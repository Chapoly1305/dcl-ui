<template>
  <div class="p-3 vendor-profiles-page">
    <div class="grid">
      <div class="col-6 md:col-3" v-for="stat in stats" :key="stat.label">
        <div class="card mb-0 stat-card">
          <div class="stat-label">{{ stat.label }}</div>
          <div class="stat-value">{{ stat.value }}</div>
        </div>
      </div>

      <div class="col-12">
        <Card class="table-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Vendor Profiles</span>
                <Tag :value="`Network: ${selectedNetwork}`" severity="info" />
              </div>
              <div class="flex align-items-center gap-2 flex-wrap">
                <div class="table-meta text-600 text-sm">
                  Showing {{ totalCount === 0 ? 0 : pageFirst + 1 }} - {{ Math.min(pageFirst + pageSize, totalCount) }} of {{ totalCount }} records
                </div>
                <Button
                  icon="pi pi-filter"
                  class="p-button-text p-button-sm p-button-rounded"
                  v-tooltip.top="'Show/Hide Search'"
                  @click="filtersExpanded = !filtersExpanded"
                />
              </div>
            </div>
          </template>
          <template #content>
            <div v-show="filtersExpanded" class="table-filters mb-3">
              <div class="grid">
                <div class="col-6 md:col-4 pt-0">
                  <label class="filter-label">Search Vendor</label>
                  <InputText v-model="filters.q" class="w-full p-inputtext-sm" placeholder="Vendor name..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 pt-0 flex align-items-end">
                  <Button icon="pi pi-times" class="p-button-sm p-button-text" label="Clear" @click="clearFilters" />
                </div>
              </div>
            </div>

            <Message v-if="error" severity="error" :closable="false" class="mb-2">{{ error }}</Message>

            <DataTable
              :value="rows"
              :lazy="true"
              :loading="loading"
              :paginator="true"
              :rows="pageSize"
              :first="pageFirst"
              :totalRecords="totalCount"
              :sortField="uiSortField"
              :sortOrder="sortOrder"
              responsiveLayout="scroll"
              @page="onPage"
              @sort="onSort"
              paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
              :rowsPerPageOptions="[25, 50, 100]"
              currentPageReportTemplate=""
            >
              <Column field="vendor_name" header="Vendor Name" :sortable="true" style="min-width:160px">
                <template #body="slotProps">
                  <span class="font-medium">{{ slotProps.data.vendor_name }}</span>
                </template>
              </Column>
              <Column field="device_count" header="Devices" :sortable="true" style="min-width:90px" />
              <Column field="firmware_count" header="Firmware Images" :sortable="true" style="min-width:120px" />
              <Column field="analyzed_device_count" header="Analyzed Devices" :sortable="true" style="min-width:130px">
                <template #body="slotProps">
                  <span>{{ slotProps.data.analyzed_device_count }} / {{ slotProps.data.device_count }}</span>
                </template>
              </Column>
              <Column header="Chipset Breakdown" style="min-width:240px">
                <template #body="slotProps">
                  <div class="flex flex-wrap gap-1">
                    <Tag
                      v-for="(count, chipset) in slotProps.data.chipsetBreakdown"
                      :key="chipset"
                      :value="`${chipset}: ${count}`"
                      :severity="chipset === 'unknown' ? 'danger' : 'info'"
                      class="text-xs"
                    />
                    <span v-if="!slotProps.data.hasAnyChipset" class="text-500 text-sm">—</span>
                  </div>
                </template>
              </Column>
              <Column field="last_updated_at" header="Last Updated" :sortable="true" style="min-width:130px">
                <template #body="slotProps">
                  <span class="text-sm">{{ formatDate(slotProps.data.last_updated_at) }}</span>
                </template>
              </Column>
              <Column header="Actions" style="min-width:80px">
                <template #body="slotProps">
                  <Button
                    icon="pi pi-chevron-down"
                    class="p-button-sm p-button-text"
                    v-tooltip.top="expandedVendor === slotProps.data.vendor_name ? 'Collapse' : 'Expand devices'"
                    @click="toggleExpand(slotProps.data.vendor_name)"
                  />
                </template>
              </Column>
            </DataTable>

            <div v-if="!loading && !error && totalCount === 0" class="flex flex-column align-items-center justify-content-center p-5 text-500">
              <i class="pi pi-briefcase text-4xl mb-3"></i>
              <span class="text-lg">No vendor profiles found. Seed device profiles first.</span>
            </div>

            <!-- Expanded vendor detail -->
            <div v-if="expandedVendor" class="mt-3">
              <Card>
                <template #title>
                  <div class="flex align-items-center justify-content-between">
                    <span>{{ expandedVendor }} — Devices</span>
                    <Button icon="pi pi-times" class="p-button-text p-button-sm p-button-rounded" @click="expandedVendor = null; expandedDevices = []" />
                  </div>
                </template>
                <template #content>
                  <div v-if="expandedLoading" class="flex justify-content-center p-3">
                    <i class="pi pi-spin pi-spinner text-2xl text-500"></i>
                  </div>
                  <DataTable v-else :value="expandedDevices" responsiveLayout="scroll" class="p-datatable-sm">
                    <Column field="vid" header="VID" />
                    <Column field="pid" header="PID" />
                    <Column field="product_name" header="Product Name" />
                    <Column field="chipset" header="Chipset">
                      <template #body="slotProps">
                        <div class="flex align-items-center gap-2">
                          <Tag :value="slotProps.data.chipset" :severity="slotProps.data.chipset === 'unknown' ? 'danger' : 'info'" />
                          <Tag v-if="slotProps.data.chipset_source === 'manual'" value="manual" severity="success" />
                        </div>
                      </template>
                    </Column>
                    <Column field="firmware_count" header="Firmware Versions" />
                    <Column field="analyzed_count" header="Analyzed" />
                    <Column field="last_seen_at" header="Last Activity">
                      <template #body="slotProps">
                        <span class="text-sm">{{ formatDate(slotProps.data.last_seen_at) }}</span>
                      </template>
                    </Column>
                  </DataTable>
                </template>
              </Card>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script>
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'VendorProfiles',
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      apiBase: requestBase,
      loading: false,
      error: null,
      rows: [],
      totalCount: 0,
      pageSize: 50,
      pageFirst: 0,
      uiSortField: 'vendor_name',
      sortOrder: 1,
      filtersExpanded: false,
      filters: { q: '' },
      vendorStats: { total_vendors: 0, total_devices: 0, total_analyzed: 0, avg_devices_per_vendor: 0, analyzed_coverage_pct: 0 },
      expandedVendor: null,
      expandedDevices: [],
      expandedLoading: false,
    };
  },
  computed: {
    selectedNetwork() {
      const v = String(this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || 'testnet').trim().toLowerCase();
      return v === 'mainnet' || v === 'testnet' ? v : 'testnet';
    },
    stats() {
      return [
        { label: 'Total Vendors', value: this.vendorStats.total_vendors },
        { label: 'Total Devices', value: this.vendorStats.total_devices },
        { label: 'Avg Devices/Vendor', value: this.vendorStats.avg_devices_per_vendor },
        { label: 'Analyzed Coverage', value: `${this.vendorStats.analyzed_coverage_pct}%` },
      ];
    },
  },
  watch: {
    selectedNetwork(next, prev) {
      if (next === prev) return;
      this.pageFirst = 0;
      this.expandedVendor = null;
      this.expandedDevices = [];
      this.loadProfiles();
    },
  },
  methods: {
    buildQuery() {
      const params = new URLSearchParams({
        network: this.selectedNetwork,
        limit: String(this.pageSize),
        offset: String(this.pageFirst),
        sort_by: this.uiSortField || 'vendor_name',
        sort_dir: this.sortOrder === 1 ? 'asc' : 'desc',
      });
      if (this.filters.q && String(this.filters.q).trim()) {
        params.set('q', String(this.filters.q).trim());
      }
      return params.toString();
    },
    async loadProfiles() {
      this.loading = true;
      this.error = null;
      try {
        const url = `${this.apiBase}/api/v1/profiling/vendors?${this.buildQuery()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
        const payload = await resp.json();
        this.rows = (Array.isArray(payload.items) ? payload.items : []).map(item => ({
          ...item,
          chipsetBreakdown: item.chipset_breakdown || {},
          sdkBreakdown: item.sdk_breakdown || {},
          hasAnyChipset: item.chipset_breakdown && Object.keys(item.chipset_breakdown).length > 0,
        }));
        this.totalCount = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : this.rows.length;
        if (payload.stats) this.vendorStats = payload.stats;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load vendor profiles';
        this.rows = [];
        this.totalCount = 0;
      } finally {
        this.loading = false;
      }
    },
    applyFilters() {
      this.pageFirst = 0;
      this.loadProfiles();
    },
    clearFilters() {
      this.filters = { q: '' };
      this.pageFirst = 0;
      this.loadProfiles();
    },
    onPage(event) {
      this.pageFirst = event.first;
      this.pageSize = event.rows;
      this.loadProfiles();
    },
    onSort(event) {
      this.uiSortField = event.sortField || 'vendor_name';
      this.sortOrder = event.sortOrder || 1;
      this.pageFirst = 0;
      this.loadProfiles();
    },
    formatDate(value) {
      if (!value) return '';
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    },
    async toggleExpand(vendorName) {
      if (this.expandedVendor === vendorName) {
        this.expandedVendor = null;
        this.expandedDevices = [];
        return;
      }
      this.expandedVendor = vendorName;
      this.expandedDevices = [];
      this.expandedLoading = true;
      try {
        const resp = await fetch(`${this.apiBase}/api/v1/profiling/vendors/${encodeURIComponent(vendorName)}?network=${this.selectedNetwork}`);
        if (resp.ok) {
          const data = await resp.json();
          this.expandedDevices = Array.isArray(data.devices) ? data.devices : [];
        }
      } catch {
        this.expandedDevices = [];
      } finally {
        this.expandedLoading = false;
      }
    },
  },
  mounted() {
    this.loadProfiles();
  },
};
</script>

<style scoped>
.stat-card {
  text-align: center;
  padding: 1rem 0.5rem;
}
.stat-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}
.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}
.filter-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
  letter-spacing: 0.04em;
}
</style>
