<template>
  <div class="p-3">
    <div class="grid">
      <div class="col-12">
        <Card>
          <template #title>Available Firmware</template>
          <template #content>
            <div class="flex align-items-center gap-2 flex-wrap">
              <Tag :value="`Network: ${network || 'unknown'}`" severity="info" />
              <Tag v-if="metadataSyncedAt" :value="`Synced: ${formatReleaseTime(metadataSyncedAt)}`" severity="success" />
              <Tag v-if="error" value="Metadata API Error" severity="danger" />
            </div>
          </template>
        </Card>
      </div>

      <div class="col-12 md:col-4" v-for="stat in stats" :key="stat.label">
        <div class="card mb-0">
          <div class="text-500 text-sm">{{ stat.label }}</div>
          <div class="text-900 text-2xl font-semibold mt-2">{{ stat.value }}</div>
        </div>
      </div>

      <div class="col-12">
        <Card>
          <template #title>Latest Firmware</template>
          <template #content>
            <Message v-if="error" severity="error" :closable="false" class="mb-3">
              {{ error }}
            </Message>
            <Message v-else-if="warning" severity="warn" :closable="false" class="mb-3">
              {{ warning }}
            </Message>
            <DataTable :value="rows" :loading="loading" responsiveLayout="scroll" class="p-datatable-sm">
              <Column field="vid" header="VID"></Column>
              <Column field="pid" header="PID"></Column>
              <Column field="vendorName" header="Vendor Name"></Column>
              <Column field="productName" header="Product Name"></Column>
              <Column field="softwareVersion" header="Software Version"></Column>
              <Column field="softwareVersionString" header="Software Version String"></Column>
              <Column header="Release Time">
                <template #body="slotProps">
                  {{ displayValue(formatReleaseTime(slotProps.data.releaseTime)) }}
                </template>
              </Column>
              <Column header="Block Height">
                <template #body="slotProps">
                  {{ displayValue(slotProps.data.blockHeight) }}
                </template>
              </Column>
              <Column header="TxHash (Last 8)">
                <template #body="slotProps">
                  <code>{{ displayValue(txHashLast8(slotProps.data.txHash)) }}</code>
                </template>
              </Column>
              <Column field="formalityConformance">
                <template #header>
                  <span class="flex align-items-center gap-2">
                    Formality Conformance
                    <i
                      class="pi pi-info-circle text-500"
                      v-tooltip.top="'Conformance validation based on DCL manifest, firmware independent.'"
                      style="cursor: help;"
                    />
                  </span>
                </template>
                <template #body="slotProps">
                  <Tag :value="slotProps.data.formalityConformance" :severity="severityFor(slotProps.data.formalityConformance)" />
                </template>
              </Column>
            </DataTable>
            <div v-if="!loading && !error && rows.length === 0" class="text-600 mt-3">
              No firmware metadata found for this network yet.
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FirmwareAvailable',
  data() {
    const base = (import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
    return {
      metadataApiBase: base,
      loading: false,
      error: null,
      rows: [],
      network: '',
      metadataSyncedAt: null,
      warning: null
    };
  },
  computed: {
    stats() {
      const vendorSet = new Set(this.rows.map((row) => row.vendorName).filter(Boolean));
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const newIn24h = this.rows.filter((row) => {
        if (!row.releaseTime) return false;
        const t = new Date(row.releaseTime).getTime();
        return Number.isFinite(t) && now - t <= oneDayMs;
      }).length;
      return [
        { label: 'Tracked Images', value: this.rows.length },
        { label: 'Unique Vendors', value: vendorSet.size },
        { label: 'New in 24h', value: newIn24h }
      ];
    }
  },
  methods: {
    async loadAvailableFirmware() {
      this.loading = true;
      this.error = null;
      try {
        const url = `${this.metadataApiBase}/api/v1/firmware/available?limit=200&refresh=false`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        this.network = payload.network || '';
        this.metadataSyncedAt = payload.metadata_synced_at || null;
        this.warning = payload.warning || null;
        this.rows = items.map((item) => ({
          vid: item.vid,
          pid: item.pid,
          vendorName: item.vendor_name || '',
          productName: item.product_name || '',
          softwareVersion: item.software_version,
          softwareVersionString: item.software_version_string || '',
          releaseTime: item.release_time || null,
          blockHeight: item.block_height,
          txHash: item.tx_hash_last8 || '',
          formalityConformance: this.normalizeConformance(item.formality_conformance, item.formality_basis)
        }));
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load firmware metadata';
        this.rows = [];
        this.warning = null;
      } finally {
        this.loading = false;
      }
    },
    normalizeConformance(value, basis) {
      if (!value) return 'Unknown';
      const lower = String(value).toLowerCase();
      if (lower === 'pending') return 'Pending';
      if (lower === 'pass') return basis === 'sec26_db' ? 'Pass' : 'Pass';
      if (lower === 'violation') return basis === 'sec26_db' ? 'Violation' : 'Violation';
      return 'Unknown';
    },
    formatReleaseTime(value) {
      if (!value) return '';
      return new Date(value).toLocaleString();
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    },
    txHashLast8(txHash) {
      if (!txHash) return '';
      return String(txHash).slice(-8);
    },
    severityFor(status) {
      if (status.startsWith('Pass')) return 'success';
      if (status.startsWith('Violation')) return 'danger';
      if (status === 'Pending') return 'warning';
      return 'warning';
    }
  },
  mounted() {
    this.loadAvailableFirmware();
  }
};
</script>
