<template>
  <div class="p-3 findings-clustering-page">
    <!-- ===== Summary Stat Cards ===== -->
    <div class="grid mb-3">
      <div class="col-6 md:col-3" v-for="stat in summaryStats" :key="stat.label">
        <div class="card mb-0 stat-card">
          <div class="stat-label">{{ stat.label }}</div>
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-subtitle text-sm text-500">{{ stat.subtitle }}</div>
        </div>
      </div>
    </div>

    <!-- ===== Main Clusters Table ===== -->
    <div class="col-12 p-0">
      <Card class="table-card">
        <template #title>
          <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
            <div class="flex align-items-center gap-2 flex-wrap">
              <i class="pi pi-th-large" />
              <span>Findings Clusters</span>
              <Tag v-if="selectedNetwork" :value="`Network: ${selectedNetwork}`" severity="info" />
              <Tag v-if="chipsetFilter" :value="`Chipset: ${chipsetFilter}`" severity="warn" />
            </div>
            <div class="flex align-items-center gap-2 flex-wrap">
              <Dropdown
                v-model="selectedNetwork"
                :options="networkOptions"
                optionLabel="label"
                optionValue="value"
                class="p-inputtext-sm"
                style="min-width: 140px"
                placeholder="All Networks"
                showClear
                @change="onNetworkChange"
              />
              <Dropdown
                v-model="chipsetFilter"
                :options="chipsetOptions"
                class="p-inputtext-sm"
                style="min-width: 160px"
                placeholder="All Chipsets"
                showClear
                @change="onChipsetChange"
              />
              <Button
                icon="pi pi-refresh"
                class="p-button-text p-button-sm p-button-rounded"
                :loading="loading"
                v-tooltip.top="'Refresh data'"
                @click="refreshClusters"
              />
            </div>
          </div>
        </template>
        <template #content>
          <!-- Loading state -->
          <div v-if="loading && !clusters.length" class="flex justify-content-center p-5">
            <ProgressSpinner style="width: 2.5rem; height: 2.5rem" strokeWidth="6" />
          </div>

          <!-- Error state -->
          <Message v-else-if="error" severity="error" :closable="false" class="mb-2">
            {{ error }}
            <template #footer>
              <Button label="Retry" icon="pi pi-refresh" class="p-button-sm p-button-outlined" @click="refreshClusters" />
            </template>
          </Message>

          <!-- Empty state -->
          <div
            v-else-if="!loading && !clusters.length"
            class="flex flex-column align-items-center justify-content-center p-5 text-500"
          >
            <i class="pi pi-search text-4xl mb-3"></i>
            <span class="text-lg">No findings data available.</span>
            <span class="text-sm mt-1">Run firmware analyses to populate finding data.</span>
          </div>

          <!-- DataTable -->
          <DataTable
            v-else
            :value="clusters"
            :loading="loading"
            responsiveLayout="scroll"
            class="p-datatable-sm"
            @row-click="onClusterClick"
            selectionMode="single"
            dataKey="section_id"
          >
            <Column header="Finding Type" style="min-width: 240px">
              <template #body="slotProps">
                <div class="flex align-items-center gap-2">
                  <i :class="`pi ${slotProps.data.icon} text-lg`" :style="{ color: categoryColor(slotProps.data) }" />
                  <span class="font-medium">{{ slotProps.data.label }}</span>
                </div>
              </template>
            </Column>
            <Column field="total_findings" header="Findings" :sortable="true" style="min-width: 100px">
              <template #body="slotProps">
                <Badge :value="slotProps.data.total_findings" size="large" :severity="severityForCount(slotProps.data)" />
              </template>
            </Column>
            <Column field="unique_firmware_count" header="Firmwares" :sortable="true" style="min-width: 100px">
              <template #body="slotProps">
                <span class="text-lg font-medium">{{ slotProps.data.unique_firmware_count }}</span>
              </template>
            </Column>
            <Column field="unique_device_count" header="Devices" :sortable="true" style="min-width: 90px">
              <template #body="slotProps">
                <span class="text-lg font-medium">{{ slotProps.data.unique_device_count }}</span>
              </template>
            </Column>
            <Column field="unique_vendor_count" header="Vendors" :sortable="true" style="min-width: 90px">
              <template #body="slotProps">
                <span class="text-lg font-medium">{{ slotProps.data.unique_vendor_count }}</span>
              </template>
            </Column>
            <Column header="Severity Distribution" style="min-width: 280px">
              <template #body="slotProps">
                <div class="flex align-items-center gap-2">
                  <template v-for="(count, sev) in slotProps.data.severity_distribution" :key="sev">
                    <Tag
                      v-if="count > 0"
                      :value="`${sev.charAt(0).toUpperCase() + sev.slice(1)}: ${count}`"
                      :severity="SEVERITY_COLORS[sev] || 'info'"
                      class="severity-tag"
                    />
                  </template>
                </div>
              </template>
            </Column>
            <Column header="Actions" style="min-width: 120px">
              <template #body="slotProps">
                <Button
                  icon="pi pi-list"
                  label="View Devices"
                  class="p-button-sm p-button-outlined"
                  @click.stop="openDevicesSidebar(slotProps.data)"
                />
              </template>
            </Column>
          </DataTable>
        </template>
      </Card>
    </div>

    <!-- ===== Drill-Down Sidebar ===== -->
    <Sidebar
      v-model:visible="sidebarVisible"
      position="right"
      class="cluster-devices-sidebar w-full md:w-32rem lg:w-45rem"
    >
      <template #header>
        <div class="flex align-items-center gap-2 w-full">
          <i :class="`pi ${selectedCluster?.icon || 'pi-list'} text-xl`" style="color: var(--primary-color)" />
          <span class="text-xl font-bold">{{ selectedCluster?.label || 'Devices' }}</span>
          <Tag
            v-if="selectedCluster"
            :value="`${selectedCluster.total_findings} finding(s)`"
            severity="info"
            class="ml-1"
          />
        </div>
      </template>

      <!-- Sidebar error -->
      <Message v-if="sidebarError" severity="error" :closable="true" @close="sidebarError = null" class="mb-2">
        {{ sidebarError }}
      </Message>

      <!-- Sidebar loading -->
      <div
        v-if="sidebarLoading"
        class="flex align-items-center justify-content-center p-6 text-500 gap-3"
      >
        <ProgressSpinner style="width: 2rem; height: 2rem" strokeWidth="6" />
        <span class="text-lg">Loading affected devices…</span>
      </div>

      <!-- Sidebar meta -->
      <div v-if="!sidebarLoading && sidebarDevices.length" class="sidebar-meta mb-3 text-sm text-600">
        Showing {{ sidebarDevices.length }} of {{ sidebarTotal }} affected device(s)
        <span v-if="selectedNetwork"> on {{ selectedNetwork }}</span>
      </div>

      <!-- Sidebar DataTable -->
      <DataTable
        v-if="!sidebarLoading"
        :value="sidebarDevices"
        :loading="sidebarLoading"
        responsiveLayout="scroll"
        class="p-datatable-sm"
        :paginator="true"
        :rows="25"
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
      >
        <Column header="VID:PID" style="min-width: 120px">
          <template #body="slotProps">
            <code>{{ slotProps.data.vid }}:{{ slotProps.data.pid }}</code>
          </template>
        </Column>
        <Column field="vendor_name" header="Vendor" style="min-width: 140px" />
        <Column field="product_name" header="Product" style="min-width: 160px">
          <template #body="slotProps">
            <span class="text-sm">{{ slotProps.data.product_name || '-' }}</span>
          </template>
        </Column>
        <Column field="chipset" header="Chipset" style="min-width: 100px">
          <template #body="slotProps">
            <Tag :value="slotProps.data.chipset" :severity="chipsetSeverity(slotProps.data.chipset)" />
          </template>
        </Column>
        <Column field="finding_count" header="Count" style="min-width: 70px">
          <template #body="slotProps">
            <Badge :value="slotProps.data.finding_count" :severity="slotProps.data.finding_count > 3 ? 'danger' : 'warn'" />
          </template>
        </Column>
        <Column header="Severities" style="min-width: 200px">
          <template #body="slotProps">
            <div class="flex align-items-center gap-1 flex-wrap">
              <template v-for="(count, sev) in slotProps.data.severities" :key="sev">
                <Tag
                  v-if="count > 0"
                  :value="`${sev.charAt(0).toUpperCase() + sev.slice(1)}: ${count}`"
                  :severity="SEVERITY_COLORS[sev] || 'info'"
                  class="text-xs"
                />
              </template>
            </div>
          </template>
        </Column>
        <Column header="Sample Findings" style="min-width: 200px">
          <template #body="slotProps">
            <div class="flex flex-column gap-1">
              <span
                v-for="(sample, i) in slotProps.data.sample_findings.slice(0, 3)"
                :key="i"
                class="text-xs text-600 sample-finding"
              >{{ sample }}</span>
            </div>
          </template>
        </Column>
      </DataTable>

      <!-- Sidebar empty -->
      <div
        v-if="!sidebarLoading && !sidebarDevices.length && !sidebarError"
        class="flex flex-column align-items-center justify-content-center p-6 text-400"
      >
        <i class="pi pi-info-circle text-4xl mb-3"></i>
        <span>No devices affected by this finding type.</span>
      </div>

      <!-- Sidebar footer -->
      <template #footer>
        <Button label="Close" icon="pi pi-times" class="p-button-text" @click="sidebarVisible = false" />
      </template>
    </Sidebar>
  </div>
</template>

<script>
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi.js';
import { SEVERITY_COLORS, categoryMeta } from '@/utils/findingsCategories.js';

export default {
  name: 'FindingsClustering',
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      apiBase: requestBase,
      loading: false,
      error: null,
      clusters: [],
      stats: null,
      // Filters
      selectedNetwork: null,
      networkOptions: [
        { label: 'Mainnet', value: 'mainnet' },
        { label: 'Testnet', value: 'testnet' },
      ],
      chipsetFilter: null,
      chipsetOptions: [
        'espressif', 'nordic', 'silabs', 'realtek', 'mcuboot',
        'ti', 'infineon', 'nxp', 'st', 'marvell', 'bouffalo',
        'telink', 'vendor_ota', 'generic', 'unknown',
      ],
      // Sidebar
      sidebarVisible: false,
      sidebarLoading: false,
      sidebarError: null,
      selectedCluster: null,
      sidebarDevices: [],
      sidebarTotal: 0,
      SEVERITY_COLORS,
    };
  },

  computed: {
    summaryStats() {
      const s = this.stats || {};
      return [
        { label: 'Total Findings', value: s.total_findings || 0, subtitle: 'Deduplicated across firmwares' },
        { label: 'Unique Vendors', value: s.total_vendors || 0, subtitle: 'Affected manufacturers' },
        { label: 'Unique Devices', value: s.total_devices || 0, subtitle: 'Affected VID:PID pairs' },
        { label: 'Unique Firmwares', value: s.total_firmwares || 0, subtitle: 'Distinct firmware images' },
      ];
    },
  },

  mounted() {
    this.loadClusters();
  },

  methods: {
    async loadClusters() {
      this.loading = true;
      this.error = null;
      try {
        const params = new URLSearchParams();
        if (this.selectedNetwork) params.set('network', this.selectedNetwork);
        if (this.chipsetFilter) params.set('chipset', this.chipsetFilter);

        const qs = params.toString();
        const url = `${this.apiBase}/api/v1/findings/clusters${qs ? '?' + qs : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Request failed (${response.status})${detail ? ': ' + detail : ''}`);
        }
        const payload = await response.json();
        this.clusters = payload.clusters || [];
        this.stats = payload.stats || {};
      } catch (err) {
        this.error = err.message || 'Failed to load findings clusters';
        console.error('findings/clusters fetch error:', err);
      } finally {
        this.loading = false;
      }
    },

    refreshClusters() {
      // Use refresh=1 to bypass TTL cache
      this.loading = true;
      this.error = null;
      const params = new URLSearchParams({ refresh: '1' });
      if (this.selectedNetwork) params.set('network', this.selectedNetwork);
      if (this.chipsetFilter) params.set('chipset', this.chipsetFilter);

      fetch(`${this.apiBase}/api/v1/findings/clusters?${params.toString()}`)
        .then(r => {
          if (!r.ok) throw new Error(`Request failed (${r.status})`);
          return r.json();
        })
        .then(payload => {
          this.clusters = payload.clusters || [];
          this.stats = payload.stats || {};
        })
        .catch(err => {
          this.error = err.message || 'Failed to refresh clusters';
          console.error('findings/clusters refresh error:', err);
        })
        .finally(() => { this.loading = false; });
    },

    onNetworkChange() {
      this.loadClusters();
    },

    onChipsetChange() {
      this.loadClusters();
    },

    onClusterClick(event) {
      this.openDevicesSidebar(event.data);
    },

    async openDevicesSidebar(cluster) {
      this.selectedCluster = cluster;
      this.sidebarVisible = true;
      this.sidebarLoading = true;
      this.sidebarError = null;
      this.sidebarDevices = [];
      this.sidebarTotal = 0;

      try {
        const params = new URLSearchParams({ limit: '200', offset: '0' });
        if (this.selectedNetwork) params.set('network', this.selectedNetwork);
        if (this.chipsetFilter) params.set('chipset', this.chipsetFilter);

        const url = `${this.apiBase}/api/v1/findings/clusters/${cluster.section_id}/devices?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Request failed (${response.status})${detail ? ': ' + detail : ''}`);
        }
        const payload = await response.json();
        this.sidebarDevices = payload.items || [];
        this.sidebarTotal = payload.total_count || 0;
      } catch (err) {
        this.sidebarError = err.message || 'Failed to load devices';
        console.error('cluster devices fetch error:', err);
      } finally {
        this.sidebarLoading = false;
      }
    },

    // ── display helpers ──

    categoryColor(cluster) {
      const sevDist = cluster.severity_distribution || {};
      if (sevDist.critical > 0) return 'var(--red-500)';
      if (sevDist.high > 0) return 'var(--orange-500)';
      if (sevDist.medium > 0) return 'var(--yellow-600)';
      return 'var(--text-color-secondary)';
    },

    severityForCount(cluster) {
      const sevDist = cluster.severity_distribution || {};
      if (sevDist.critical > 0) return 'danger';
      if (sevDist.high > 0) return 'warn';
      if (sevDist.medium > 0) return 'info';
      return 'info';
    },

    chipsetSeverity(chipset) {
      const c = String(chipset || '').toLowerCase();
      if (c === 'unknown' || c === 'generic' || c === 'vendor_ota') return 'info';
      if (c === 'non_firmware') return 'danger';
      return 'success';
    },
  },
};
</script>

<style scoped>
.findings-clustering-page {
  max-width: 1400px;
}

.stat-card {
  padding: 1rem;
  border-left: 4px solid var(--primary-color);
}

.stat-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;
}

.stat-subtitle {
  margin-top: 0.25rem;
}

.severity-tag {
  font-size: 0.75rem;
}

.sample-finding {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 250px;
}

.sidebar-meta {
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.table-card {
  margin-bottom: 0;
}
</style>
