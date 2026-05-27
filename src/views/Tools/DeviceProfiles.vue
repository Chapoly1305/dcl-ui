<template>
  <div class="p-3 device-profiles-page">
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
                <span>Device Profiles</span>
                <Tag :value="`Network: ${selectedNetwork}`" severity="info" />
              </div>
              <div class="flex align-items-center gap-2 flex-wrap">
                <div class="table-meta text-600 text-sm">
                  Showing {{ totalCount === 0 ? 0 : pageFirst + 1 }} - {{ Math.min(pageFirst + pageSize, totalCount) }} of {{ totalCount }} records
                </div>
                <Button
                  icon="pi pi-filter"
                  class="p-button-text p-button-sm p-button-rounded"
                  v-tooltip.top="'Show/Hide Filters'"
                  @click="filtersExpanded = !filtersExpanded"
                />
                <Button
                  icon="pi pi-refresh"
                  class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading"
                  v-tooltip.top="'Refresh profiling data'"
                  @click="refreshProfiling"
                />
              </div>
            </div>
          </template>
          <template #content>
            <div v-show="filtersExpanded" class="table-filters mb-3">
              <div class="grid">
                <div class="col-6 md:col-3 pt-0">
                  <label class="filter-label">Search</label>
                  <InputText v-model="filters.q" class="w-full p-inputtext-sm" placeholder="Vendor or product name..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-3 pt-0">
                  <label class="filter-label">Chipset</label>
                  <Dropdown
                    v-model="filters.chipset"
                    class="w-full p-inputtext-sm"
                    :options="chipsetOptions"
                    placeholder="Any"
                    showClear
                  />
                </div>
                <div class="col-6 md:col-2 pt-0">
                  <label class="filter-label">Source</label>
                  <Dropdown
                    v-model="filters.chipsetSource"
                    class="w-full p-inputtext-sm"
                    :options="sourceOptions"
                    placeholder="Any"
                    showClear
                  />
                </div>
                <div class="col-6 md:col-2 pt-0 flex align-items-end">
                  <Button icon="pi pi-times" class="p-button-sm p-button-text" label="Clear" @click="clearFilters" />
                </div>
              </div>
            </div>

            <Message v-if="error" severity="error" :closable="false" class="mb-2">{{ error }}</Message>
            <Message v-if="actionNote" severity="success" :closable="true" class="mb-2" @close="actionNote = null">{{ actionNote }}</Message>

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
              <Column field="vid" header="VID" :sortable="true" style="min-width:80px" />
              <Column field="pid" header="PID" :sortable="true" style="min-width:80px" />
              <Column field="vendor_name" header="Vendor Name" :sortable="true" style="min-width:140px" />
              <Column field="product_name" header="Product Name" :sortable="true" style="min-width:160px" />
              <Column field="chipset" header="Chipset" :sortable="true" style="min-width:140px">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-2">
                    <Tag :value="slotProps.data.chipset" :severity="chipsetSeverity(slotProps.data.chipset)" />
                    <Tag
                      v-if="slotProps.data.chipset_source === 'manual'"
                      value="manual"
                      severity="success"
                      v-tooltip.top="slotProps.data.override_reason || 'Manual override'"
                    />
                  </div>
                </template>
              </Column>
              <Column field="chipset_confidence" header="Confidence" :sortable="true" style="min-width:100px">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-2">
                    <div class="confidence-bar" :style="{ width: (slotProps.data.chipset_confidence * 100) + '%' }" />
                    <span class="text-sm">{{ formatPercent(slotProps.data.chipset_confidence) }}</span>
                  </div>
                </template>
              </Column>
              <Column field="firmware_count" header="Firmware Versions" :sortable="true" style="min-width:120px" />
              <Column field="analyzed_count" header="Analyzed" :sortable="true" style="min-width:90px" />
              <Column field="last_seen_at" header="Last Activity" :sortable="true" style="min-width:140px">
                <template #body="slotProps">
                  <span class="text-sm">{{ formatDate(slotProps.data.last_seen_at) }}</span>
                </template>
              </Column>
              <Column header="Actions" style="min-width:100px">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-1">
                    <Button
                      icon="pi pi-pencil"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="'Override chipset'"
                      @click="openOverride(slotProps.data)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>

            <div v-if="!loading && !error && totalCount === 0" class="flex flex-column align-items-center justify-content-center p-5 text-500">
              <i class="pi pi-cog text-4xl mb-3"></i>
              <span class="text-lg">No device profiles found. Run a firmware scan to seed profiling data.</span>
            </div>
          </template>
        </Card>
      </div>
    </div>

    <Dialog v-model:visible="overrideDialogVisible" header="Override Chipset" :modal="true" :style="{ width: '450px' }">
      <div class="flex flex-column gap-3">
        <div>
          <label class="block mb-1 font-medium">Device</label>
          <span class="text-600">{{ overrideTarget ? `${overrideTarget.vendor_name} — ${overrideTarget.product_name} (VID:${overrideTarget.vid} PID:${overrideTarget.pid})` : '' }}</span>
        </div>
        <div>
          <label class="block mb-1 font-medium">Current Chipset</label>
          <Tag :value="overrideTarget?.chipset" :severity="overrideTarget ? chipsetSeverity(overrideTarget.chipset) : 'info'" />
        </div>
        <div>
          <label class="block mb-1 font-medium">New Chipset</label>
          <Dropdown v-model="overrideChipset" :options="chipsetOptions" class="w-full" placeholder="Select chipset..." />
        </div>
        <div>
          <label class="block mb-1 font-medium">Reason</label>
          <InputText v-model="overrideReason" class="w-full" placeholder="e.g. Physical teardown confirmed nRF5340" />
        </div>
        <div v-if="overrideError" class="text-red-500 text-sm">{{ overrideError }}</div>
      </div>
      <template #footer>
        <Button label="Cancel" class="p-button-text" @click="overrideDialogVisible = false" />
        <Button label="Save Override" icon="pi pi-check" :loading="overrideSaving" @click="submitOverride" />
      </template>
    </Dialog>
  </div>
</template>

<script>
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'DeviceProfiles',
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      apiBase: requestBase,
      loading: false,
      error: null,
      actionNote: null,
      rows: [],
      totalCount: 0,
      pageSize: 50,
      pageFirst: 0,
      uiSortField: 'vendor_name',
      sortOrder: 1,
      filtersExpanded: false,
      filters: { q: '', chipset: null, chipsetSource: null },
      profileStats: { total_devices: 0, analyzed_devices: 0, unknown_chipset: 0, manual_overrides: 0 },
      chipsetOptions: [],
      sourceOptions: ['auto', 'manual'],
      overrideDialogVisible: false,
      overrideTarget: null,
      overrideChipset: null,
      overrideReason: '',
      overrideError: null,
      overrideSaving: false,
    };
  },
  computed: {
    selectedNetwork() {
      const v = String(this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || 'testnet').trim().toLowerCase();
      return v === 'mainnet' || v === 'testnet' ? v : 'testnet';
    },
    stats() {
      return [
        { label: 'Total Devices', value: this.profileStats.total_devices },
        { label: 'Analyzed', value: this.profileStats.analyzed_devices },
        { label: 'Unknown Chipset', value: this.profileStats.unknown_chipset },
        { label: 'Manual Overrides', value: this.profileStats.manual_overrides },
      ];
    },
  },
  watch: {
    selectedNetwork(next, prev) {
      if (next === prev) return;
      this.pageFirst = 0;
      this.loadProfiles();
    },
  },
  methods: {
    async loadChipsetOptions() {
      try {
        const resp = await fetch(`${this.apiBase}/api/v1/profiling/chipsets`);
        if (resp.ok) {
          const data = await resp.json();
          this.chipsetOptions = Array.isArray(data.chipsets) ? data.chipsets : [];
        }
      } catch {
        this.chipsetOptions = ['siliconlabs', 'esp32', 'nrf', 'mcuboot', 'allegion', 'aqara', 'asr', 'general_mcuboot', 'leviton', 'linkind', 'matter_ota', 'nuttx', 'nxp', 'qorvo', 'realtek', 'rt_thread', 'stm32', 'telink', 'unknown'];
      }
    },
    buildQuery() {
      const params = new URLSearchParams({
        network: this.selectedNetwork,
        limit: String(this.pageSize),
        offset: String(this.pageFirst),
        sort_by: this.uiSortField || 'vendor_name',
        sort_dir: this.sortOrder === 1 ? 'asc' : 'desc',
      });
      for (const [k, v] of [['q', this.filters.q], ['chipset', this.filters.chipset], ['chipset_source', this.filters.chipsetSource]]) {
        if (v !== null && v !== undefined && String(v).trim() !== '') params.set(k, String(v).trim());
      }
      return params.toString();
    },
    async loadProfiles() {
      this.loading = true;
      this.error = null;
      try {
        const url = `${this.apiBase}/api/v1/profiling/devices?${this.buildQuery()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
        const payload = await resp.json();
        this.rows = Array.isArray(payload.items) ? payload.items : [];
        this.totalCount = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : this.rows.length;
        if (payload.stats) this.profileStats = payload.stats;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load device profiles';
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
      this.filters = { q: '', chipset: null, chipsetSource: null };
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
    chipsetSeverity(chipset) {
      if (!chipset || chipset === 'unknown') return 'danger';
      return 'info';
    },
    formatPercent(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '0%';
      return `${Math.round(n * 100)}%`;
    },
    formatDate(value) {
      if (!value) return '';
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    },
    openOverride(row) {
      this.overrideTarget = row;
      this.overrideChipset = row.chipset || 'unknown';
      this.overrideReason = '';
      this.overrideError = null;
      this.overrideDialogVisible = true;
    },
    async submitOverride() {
      if (!this.overrideTarget || !this.overrideChipset) return;
      this.overrideSaving = true;
      this.overrideError = null;
      try {
        const resp = await fetch(
          `${this.apiBase}/api/v1/profiling/devices/${this.overrideTarget.vid}/${this.overrideTarget.pid}/chipset?network=${this.selectedNetwork}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chipset: this.overrideChipset, override_reason: this.overrideReason || null }),
          }
        );
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || `Request failed (${resp.status})`);
        }
        this.actionNote = `Chipset override saved for VID:${this.overrideTarget.vid} PID:${this.overrideTarget.pid}`;
        this.overrideDialogVisible = false;
        this.loadProfiles();
      } catch (err) {
        this.overrideError = err instanceof Error ? err.message : 'Failed to save override';
      } finally {
        this.overrideSaving = false;
      }
    },
    async refreshProfiling() {
      this.pageFirst = 0;
      try {
        await fetch(`${this.apiBase}/api/v1/profiling/refresh?network=${this.selectedNetwork}`, { method: 'POST' });
        this.actionNote = 'Profiling data refreshed.';
      } catch {
        // Non-critical — proceed to reload
      }
      this.loadProfiles();
    },
  },
  mounted() {
    this.loadChipsetOptions();
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
.confidence-bar {
  height: 6px;
  background: var(--primary-color);
  border-radius: 3px;
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
