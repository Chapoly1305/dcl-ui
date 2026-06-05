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
              @row-click="onRowClick"
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

    <!-- ===== Device Detail Sidebar ===== -->
    <Sidebar
      v-model:visible="detailSidebarVisible"
      position="right"
      class="device-sidebar w-full md:w-32rem lg:w-45rem"
    >
      <template #header>
        <div class="flex align-items-center gap-2 w-full">
          <i class="pi pi-microchip text-xl text-blue-500"></i>
          <span class="text-xl font-bold">Device Detail</span>
          <Tag
            v-if="selectedDevice"
            :value="`VID:${selectedDevice.vid} PID:${selectedDevice.pid}`"
            severity="info"
            class="ml-1"
          />
        </div>
      </template>

      <!-- Error state -->
      <Message v-if="detailError" severity="error" :closable="false" class="mb-2">{{ detailError }}</Message>

      <!-- Empty state (no device selected) -->
      <div
        v-if="!selectedDevice && !detailLoading"
        class="flex flex-column align-items-center justify-content-center p-6 text-400"
      >
        <i class="pi pi-microchip text-5xl mb-3"></i>
        <span class="text-lg">Select a device row to view details.</span>
      </div>

      <!-- Loading state -->
      <div
        v-else-if="detailLoading"
        class="flex align-items-center justify-content-center p-6 text-500 gap-3"
      >
        <ProgressSpinner style="width: 2rem; height: 2rem" strokeWidth="6" />
        <span class="text-lg">Loading device detail…</span>
      </div>

      <!-- Content loaded -->
      <div v-else-if="selectedDevice" class="device-detail-content">
        <!-- Device identity banner -->
        <div class="detail-banner mb-3">
          <div class="flex align-items-center gap-3 flex-wrap">
            <i class="pi pi-microchip text-blue-500" style="font-size: 1.3rem"></i>
            <div>
              <div class="font-bold text-lg">
                {{ deviceDetail?.vendor_name || selectedDevice.vendor_name || 'Unknown Vendor' }}
                —
                {{ deviceDetail?.product_name || selectedDevice.product_name || 'Unknown Product' }}
              </div>
              <div class="text-sm text-600 mt-1">
                VID <code>{{ selectedDevice.vid }}</code>
                <span class="ml-2">PID <code>{{ selectedDevice.pid }}</code></span>
              </div>
            </div>
          </div>
        </div>

        <TabView v-model:activeIndex="detailTabIndex">
          <!-- ===== Tab 1: Device Info ===== -->
          <TabPanel header="Device Info">
            <Card class="detail-card mb-2">
              <template #title><i class="pi pi-info-circle mr-2 text-blue-500"></i>Device Metadata</template>
              <template #content>
                <div class="info-grid">
                  <div class="info-row">
                    <span class="info-label">VID</span>
                    <code class="info-value">{{ selectedDevice.vid }}</code>
                  </div>
                  <div class="info-row">
                    <span class="info-label">PID</span>
                    <code class="info-value">{{ selectedDevice.pid }}</code>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Vendor</span>
                    <span class="info-value">{{ deviceDetail?.vendor_name || selectedDevice.vendor_name || '-' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Product</span>
                    <span class="info-value">{{ deviceDetail?.product_name || selectedDevice.product_name || '-' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Chipset</span>
                    <span class="info-value">
                      <Tag
                        :value="deviceDetail?.chipset || selectedDevice.chipset || 'unknown'"
                        :severity="chipsetSeverity(deviceDetail?.chipset || selectedDevice.chipset)"
                      />
                      <Tag
                        v-if="(deviceDetail?.chipset_source || selectedDevice.chipset_source) === 'manual'"
                        value="manual"
                        severity="success"
                        class="ml-1"
                        v-tooltip.top="deviceDetail?.override_reason || selectedDevice.override_reason || 'Manual override'"
                      />
                    </span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Confidence</span>
                    <span class="info-value">
                      <span class="confidence-value">{{ formatPercent(deviceDetail?.chipset_confidence ?? selectedDevice.chipset_confidence) }}</span>
                    </span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Last Activity</span>
                    <span class="info-value">{{ formatDate(deviceDetail?.last_seen_at || selectedDevice.last_seen_at) }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Firmware Versions</span>
                    <span class="info-value">{{ deviceDetail?.firmware_count ?? selectedDevice.firmware_count ?? firmwareVersions.length }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Analyzed</span>
                    <span class="info-value">{{ deviceDetail?.analyzed_count ?? selectedDevice.analyzed_count ?? analysisResults.length }}</span>
                  </div>
                </div>
              </template>
            </Card>

            <!-- Chipset Override section -->
            <Card class="detail-card mb-0">
              <template #title><i class="pi pi-pencil mr-2 text-orange-500"></i>Chipset Override</template>
              <template #content>
                <div class="mb-2 text-sm text-600">
                  Current: <Tag :value="deviceDetail?.chipset || selectedDevice.chipset || 'unknown'" :severity="chipsetSeverity(deviceDetail?.chipset || selectedDevice.chipset)" />
                  <span v-if="(deviceDetail?.chipset_source || selectedDevice.chipset_source) === 'manual'" class="ml-1 text-xs">(manual override)</span>
                </div>
                <Button
                  label="Override Chipset"
                  icon="pi pi-pencil"
                  class="p-button-sm p-button-outlined"
                  @click="openOverride(deviceDetail || selectedDevice)"
                />
              </template>
            </Card>
          </TabPanel>

          <!-- ===== Tab 2: Firmware Versions ===== -->
          <TabPanel header="Firmware Versions">
            <div
              v-if="firmwareVersions.length === 0 && !detailLoading"
              class="flex flex-column align-items-center justify-content-center p-4 text-500"
            >
              <i class="pi pi-database text-3xl mb-2"></i>
              <span>No firmware versions recorded for this device.</span>
            </div>

            <DataTable
              v-else
              :value="firmwareVersions"
              :loading="detailLoading"
              responsiveLayout="scroll"
              class="p-datatable-sm"
            >
              <Column field="software_version" header="SW Version" style="min-width:100px">
                <template #body="slotProps">
                  <code>{{ slotProps.data.software_version }}</code>
                </template>
              </Column>
              <Column field="release_time" header="Release Time" style="min-width:140px">
                <template #body="slotProps">{{ formatDate(slotProps.data.release_time) }}</template>
              </Column>
              <Column field="block_height" header="Block" style="min-width:80px" />
              <Column field="tx_hash_first8" header="Tx Hash" style="min-width:90px">
                <template #body="slotProps">
                  <code class="text-xs">{{ slotProps.data.tx_hash_first8 || '-' }}</code>
                </template>
              </Column>
              <Column field="formality_conformance" header="Conformance" style="min-width:110px">
                <template #body="slotProps">
                  <Tag
                    v-if="slotProps.data.formality_conformance"
                    :value="slotProps.data.formality_conformance"
                    :severity="slotProps.data.formality_conformance === 'pass' ? 'success' : 'danger'"
                  />
                  <span v-else>-</span>
                </template>
              </Column>
            </DataTable>
          </TabPanel>

          <!-- ===== Tab 3: Scan History ===== -->
          <TabPanel header="Scan History">
            <div
              v-if="analysisResults.length === 0 && !detailLoading"
              class="flex flex-column align-items-center justify-content-center p-4 text-500"
            >
              <i class="pi pi-search text-3xl mb-2"></i>
              <span>No scan history for this device.</span>
            </div>

            <DataTable
              v-else
              :value="analysisResults"
              :loading="detailLoading"
              responsiveLayout="scroll"
              class="p-datatable-sm clickable-rows"
              @row-click="navigateToScan($event.data)"
            >
              <Column field="result_id" header="Result ID" style="min-width:100px">
                <template #body="slotProps">
                  <code class="text-xs">{{ slotProps.data.result_id ? slotProps.data.result_id.slice(0, 8) : '-' }}</code>
                </template>
              </Column>
              <Column field="chipset" header="Chipset" style="min-width:90px">
                <template #body="slotProps">
                  <Tag :value="slotProps.data.chipset || '-'" :severity="chipsetSeverity(slotProps.data.chipset)" />
                </template>
              </Column>
              <Column field="sdk_best_guess_base" header="SDK" style="min-width:70px">
                <template #body="slotProps">
                  <span class="text-sm">{{ slotProps.data.sdk_best_guess_base || '-' }}</span>
                </template>
              </Column>
              <Column field="verdict_authenticity" header="Authenticity" style="min-width:100px">
                <template #body="slotProps">
                  <Tag
                    :value="slotProps.data.verdict_authenticity || 'pending'"
                    :severity="slotProps.data.verdict_authenticity === 'pass' ? 'success' : slotProps.data.verdict_authenticity === 'fail' ? 'danger' : 'warning'"
                  />
                </template>
              </Column>
              <Column field="verdict_integrity" header="Integrity" style="min-width:80px">
                <template #body="slotProps">
                  <Tag
                    :value="slotProps.data.verdict_integrity || 'pending'"
                    :severity="slotProps.data.verdict_integrity === 'pass' ? 'success' : 'danger'"
                  />
                </template>
              </Column>
              <Column field="analyzed_at" header="Analyzed At" style="min-width:140px">
                <template #body="slotProps">{{ formatDate(slotProps.data.analyzed_at) }}</template>
              </Column>
            </DataTable>
          </TabPanel>
        </TabView>
      </div>
    </Sidebar>
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
      // Device detail sidebar
      detailSidebarVisible: false,
      selectedDevice: null,
      detailLoading: false,
      detailError: null,
      detailTabIndex: 0,
      deviceDetail: null,
      firmwareVersions: [],
      analysisResults: [],
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
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return String(value);
        return dt.toLocaleString();
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
    // ---- Device detail sidebar ----
    onRowClick(event) {
      this.openDeviceDetail(event?.data);
    },
    openDeviceDetail(row) {
      if (!row || row.vid === undefined || row.pid === undefined) return;
      this.selectedDevice = row;
      this.detailTabIndex = 0;
      this.detailSidebarVisible = true;
      this.fetchDeviceDetail(row.vid, row.pid);
    },
    async fetchDeviceDetail(vid, pid) {
      this.detailLoading = true;
      this.detailError = null;
      this.deviceDetail = null;
      this.firmwareVersions = [];
      this.analysisResults = [];
      try {
        const url = `${this.apiBase}/api/v1/profiling/devices/${vid}/${pid}?network=${this.selectedNetwork}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Device detail request failed (${resp.status})`);
        const payload = await resp.json();
        this.deviceDetail = payload.device || null;
        this.firmwareVersions = Array.isArray(payload.firmware_versions) ? payload.firmware_versions : [];
        this.analysisResults = Array.isArray(payload.analysis_results) ? payload.analysis_results : [];
      } catch (err) {
        this.detailError = err instanceof Error ? err.message : 'Failed to load device detail';
      } finally {
        this.detailLoading = false;
      }
    },
    navigateToScan(result) {
      const sha = String(result?.firmware_sha256 || '').trim();
      if (sha) {
        this.$router.push(`/firmware-security/firmware/${sha}`);
        return;
      }
      this.$router.push(`/firmware-security/scan-results?q=${encodeURIComponent(result.result_id || '')}`);
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

/* ---- Device Detail Sidebar ---- */
:deep(.device-sidebar.p-sidebar) {
  background: #f8fafc;
}
:deep(.device-sidebar .p-sidebar-header) {
  padding: 1rem 1.2rem 0.5rem;
}
:deep(.device-sidebar .p-sidebar-content) {
  padding: 0.5rem 1.2rem 1.2rem;
}

.device-detail-content {
  font-size: 0.88rem;
}

.detail-banner {
  padding: 1rem 1.2rem;
  background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
  border: 1px solid #dbeafe;
  border-radius: 10px;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: 1fr;
  row-gap: 0.55rem;
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px dashed #e5e7eb;
  padding-bottom: 0.3rem;
}

.info-label {
  color: #6b7280;
  font-weight: 600;
  font-size: 0.85rem;
  padding-right: 0.75rem;
  white-space: nowrap;
}

.info-value {
  color: #111827;
  font-size: 0.9rem;
  text-align: right;
  word-break: break-word;
}

.detail-card :deep(.p-card-body) {
  padding: 0.8rem;
}
.detail-card :deep(.p-card-title) {
  margin-bottom: 0.35rem;
}
.detail-card :deep(.p-card-content) {
  padding-top: 0.35rem;
}

.confidence-value {
  font-weight: 600;
}

.clickable-rows :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}
.clickable-rows :deep(.p-datatable-tbody > tr:hover) {
  background: #f1f5f9;
}
</style>
