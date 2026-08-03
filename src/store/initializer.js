// src/store/initializer.js
export default {
  initializedNetwork: null,
  initializationPromise: null,

  async initializeAllStores(store) {
    const network = store.getters['network/network'] || 'default';
    if (this.initializedNetwork === network) return;

    // App and the dashboard are created back-to-back and can both request the
    // same bootstrap. Share the in-flight work instead of launching a second
    // copy of every paginated DCL query.
    if (this.initializationPromise) {
      await this.initializationPromise;
      if (this.initializedNetwork === network) return;
    }

    this.initializationPromise = this.runInitialization(store, network);
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  },

  async runInitialization(store, network) {

    console.log('Initializing all DCL stores...');

    // Load one snapshot. Subscribing every all-record query makes each new
    // block replay the complete paginated bootstrap and creates a request storm.
    const results = await Promise.allSettled([
      // Auth
      store.dispatch('zigbeealliance.distributedcomplianceledger.dclauth/QueryAccountAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.dclauth/QueryPendingAccountAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.dclauth/QueryPendingAccountRevocationAll', {
        options: { subscribe: false, all: true }
      }),

      // Models
      store.dispatch('zigbeealliance.distributedcomplianceledger.model/QueryModelAll', {
        options: { subscribe: false, all: true }
      }),

      // Compliance
      store.dispatch('zigbeealliance.distributedcomplianceledger.compliance/QueryComplianceInfoAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.compliance/QueryCertifiedModelAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.compliance/QueryRevokedModelAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.compliance/QueryProvisionalModelAll', {
        options: { subscribe: false, all: true }
      }),

      // Vendor info
      store.dispatch('zigbeealliance.distributedcomplianceledger.vendorinfo/QueryVendorInfoAll', {
        options: { subscribe: false, all: true }
      }),

      // Upgrades
      store.dispatch('zigbeealliance.distributedcomplianceledger.dclupgrade/QueryApprovedUpgradeAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.dclupgrade/QueryProposedUpgradeAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.dclupgrade/QueryRejectedUpgradeAll', {
        options: { subscribe: false, all: true }
      }),

      // Validators
      store.dispatch('zigbeealliance.distributedcomplianceledger.validator/QueryValidatorAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.validator/QueryProposedDisableValidatorAll', {
        options: { subscribe: false, all: true }
      }),

      // PKI
      store.dispatch('zigbeealliance.distributedcomplianceledger.pki/QueryApprovedCertificatesAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.pki/QueryNocRootCertificatesAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.pki/QueryNocIcaCertificatesAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.pki/QueryPkiRevocationDistributionPointAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.pki/QueryProposedCertificateAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.pki/QueryRevokedCertificatesAll', {
        options: { subscribe: false, all: true }
      }),
      store.dispatch('zigbeealliance.distributedcomplianceledger.pki/QueryProposedCertificateRevocationAll', {
        options: { subscribe: false, all: true }
      })
    ]);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`DCL store bootstrap completed with ${failed.length} failed query groups`);
    }

    // Update certificate indexes for optimized lookups when bootstrap largely succeeded.
    if (failed.length === 0) {
      await store.dispatch('pkiOptimized/updateCertificateIndexes');
    }

    this.initializedNetwork = network;
    console.log('All DCL stores initialized');
  }
};
