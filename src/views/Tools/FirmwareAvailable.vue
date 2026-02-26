<template>
  <div class="p-3 firmware-available-page">
    <div class="grid">
      <div class="col-6 md:col-4 lg:col-2" v-for="stat in stats" :key="stat.label">
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
                <span>Latest Firmware</span>
                <Tag :value="`Network: ${network || 'unknown'}`" severity="info" />
                <Tag v-if="metadataSyncedAt" :value="`Synced: ${formatReleaseTime(metadataSyncedAt)}`" severity="success" />
              </div>
              <div class="flex align-items-center gap-2 flex-wrap">
                <div class="table-meta text-600 text-sm">
                  Showing {{ totalCount === 0 ? 0 : pageFirst + 1 }} - {{ Math.min(pageFirst + pageSize, totalCount) }} of {{ totalCount }} records
                </div>
                <Button
                  icon="pi pi-filter"
                  class="p-button-text p-button-sm p-button-rounded"
                  v-tooltip.top="'Show/Hide Filters'"
                  @click="tableFiltersExpanded = !tableFiltersExpanded"
                />
                <Button
                  icon="pi pi-refresh"
                  class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading"
                  v-tooltip.top="'Refresh'"
                  @click="refreshNow"
                />
              </div>
            </div>
          </template>
          <template #content>
            <div v-show="tableFiltersExpanded" class="table-filters grid mb-3">
              <div class="col-12 md:col-2">
                <label class="filter-label">VID</label>
                <InputText v-model="filters.vid" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">PID</label>
                <InputText v-model="filters.pid" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Vendor Name</label>
                <InputText v-model="filters.vendorName" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Product Name</label>
                <InputText v-model="filters.productName" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Software Version</label>
                <InputText v-model="filters.softwareVersion" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Software Version String</label>
                <InputText v-model="filters.softwareVersionString" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Release Time</label>
                <InputText v-model="filters.releaseTime" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Block Height</label>
                <InputText v-model="filters.blockHeight" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">TxHash (Last 8)</label>
                <InputText v-model="filters.txHashLast8" class="w-full p-inputtext-sm" placeholder="Contains..." />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Formality Conformance</label>
                <Dropdown
                  v-model="filters.formalityConformance"
                  class="w-full p-inputtext-sm"
                  :options="conformanceFilterOptions"
                  placeholder="Any"
                  showClear
                />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Downloaded</label>
                <Dropdown
                  v-model="filters.isDownloaded"
                  class="w-full p-inputtext-sm"
                  :options="downloadedFilterOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Any"
                  showClear
                />
              </div>
              <div class="col-12 md:col-2">
                <label class="filter-label">Analysis</label>
                <Dropdown
                  v-model="filters.analysisStatus"
                  class="w-full p-inputtext-sm"
                  :options="analysisFilterOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Any"
                  showClear
                />
              </div>
              <div class="col-12 md:col-4 lg:col-4 flex align-items-end justify-content-start gap-2">
                <Button
                  label="Clear"
                  icon="pi pi-filter-slash"
                  class="p-button-text p-button-sm"
                  @click="clearFilters"
                />
                <Button
                  label="Apply Filters"
                  icon="pi pi-search"
                  class="p-button-sm"
                  @click="applyFilters"
                />
              </div>
            </div>
            <Message v-if="error" severity="error" :closable="false" class="mb-3">
              {{ error }}
            </Message>
            <Message v-else-if="warning" severity="warn" :closable="false" class="mb-3">
              {{ warning }}
            </Message>
            <Message v-else-if="actionNote" severity="success" :closable="false" class="mb-3">
              {{ actionNote }}
            </Message>
            <DataTable
              :value="rows"
              :lazy="true"
              :loading="loading"
              paginator
              :rows="pageSize"
              :first="pageFirst"
              :totalRecords="totalCount"
              @page="onPage"
              sortMode="single"
              :sortField="uiSortField"
              :sortOrder="sortOrder"
              @sort="onSort"
              responsiveLayout="scroll"
              class="p-datatable-sm"
            >
              <Column field="vid" header="VID" sortable></Column>
              <Column field="pid" header="PID" sortable></Column>
              <Column field="vendorName" header="Vendor Name" sortable></Column>
              <Column field="productName" header="Product Name" sortable></Column>
              <Column field="softwareVersion" header="Software Version" sortable></Column>
              <Column field="softwareVersionString" header="Software Version String" sortable></Column>
              <Column field="releaseTime" header="Release Time" sortable>
                <template #body="slotProps">
                  {{ displayValue(formatReleaseTime(slotProps.data.releaseTime)) }}
                </template>
              </Column>
              <Column field="blockHeight" header="Block Height" sortable>
                <template #body="slotProps">
                  {{ displayValue(slotProps.data.blockHeight) }}
                </template>
              </Column>
              <Column field="txHash" header="TxHash (Last 8)">
                <template #body="slotProps">
                  <code>{{ displayValue(txHashLast8(slotProps.data.txHash)) }}</code>
                </template>
              </Column>
              <Column field="isDownloaded" header="Downloaded" headerClass="text-center" bodyClass="text-center">
                <template #body="slotProps">
                  <div class="cell-center">
                    <Tag :value="slotProps.data.isDownloaded ? 'Yes' : 'No'" :severity="slotProps.data.isDownloaded ? 'success' : 'warning'" />
                  </div>
                </template>
              </Column>
              <Column field="analysisLatestStatus" header="Analysis" headerClass="text-center" bodyClass="text-center">
                <template #body="slotProps">
                  <div class="analysis-cell cell-center flex flex-column gap-1">
                    <Tag :value="analysisLabel(slotProps.data.analysisLatestStatus)" :severity="analysisSeverity(slotProps.data.analysisLatestStatus)" />
                    <span v-if="slotProps.data.analysisLatestAt" class="text-500 text-xs">
                      {{ formatReleaseTime(slotProps.data.analysisLatestAt) }}
                    </span>
                  </div>
                </template>
              </Column>
              <Column field="formalityConformance" sortable headerClass="text-center" bodyClass="text-center">
                <template #header>
                  <span class="cell-center gap-2">
                    Formality Conformance
                    <i
                      class="pi pi-info-circle text-500"
                      v-tooltip.top="'Conformance validation based on DCL manifest, firmware independent.'"
                      style="cursor: help;"
                    />
                  </span>
                </template>
                <template #body="slotProps">
                  <div class="cell-center gap-2">
                    <Tag :value="slotProps.data.formalityConformance" :severity="severityFor(slotProps.data.formalityConformance)" />
                    <i
                      v-if="slotProps.data.formalityConformance === 'Violation' && slotProps.data.formalityComment"
                      class="pi pi-info-circle text-600"
                      v-tooltip.top="formatViolationDetails(slotProps.data.formalityComment)"
                      style="cursor: help;"
                    />
                  </div>
                </template>
              </Column>
              <Column header="Actions">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-2">
                    <Button
                      icon="pi pi-play"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="slotProps.data.isDownloaded ? 'Analyze firmware group' : 'Firmware is not downloaded locally'"
                      :disabled="!slotProps.data.isDownloaded"
                      @click="enqueueAnalyze(slotProps.data)"
                    />
                    <Button
                      icon="pi pi-chart-line"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="slotProps.data.analysisLatestJobId ? 'Open job progress' : 'No analysis job yet'"
                      :disabled="!slotProps.data.analysisLatestJobId"
                      @click="openJobProgress(slotProps.data.analysisLatestJobId)"
                    />
                    <Button
                      icon="pi pi-external-link"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="slotProps.data.firmwareSha256 ? 'Open firmware detail' : 'Open matching scan results'"
                      :disabled="!slotProps.data.firmwareSha256 && !slotProps.data.isDownloaded"
                      @click="openFirmwareDetail(slotProps.data)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>
            <div v-if="!loading && !error && totalCount === 0" class="text-600 mt-3">
              No firmware metadata found for this network yet.
            </div>
          </template>
        </Card>
      </div>
    </div>
    <FirmwareJobProgressModal
      :visible="progressDialogVisible"
      :job-id="progressJobId"
      :api-base="metadataApiBase"
      @update:visible="progressDialogVisible = $event"
    />
  </div>
</template>

<script>
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';

export default {
  name: 'FirmwareAvailable',
  components: {
    FirmwareJobProgressModal
  },
  data() {
    const base = (import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
    return {
      metadataApiBase: base,
      loading: false,
      error: null,
      actionNote: null,
      rows: [],
      network: '',
      metadataSyncedAt: null,
      warning: null,
      totalCount: 0,
      datasetStats: {
        trackedImages: 0,
        uniqueVendors: 0,
        uniqueDevices: 0,
        conformancePass: 0,
        conformanceViolation: 0,
        conformancePassRatio: 0,
        conformanceViolationRatio: 0,
        newIn24h: 0
      },
      pageSize: 50,
      pageFirst: 0,
      uiSortField: 'releaseTime',
      sortOrder: -1,
      tableFiltersExpanded: false,
      filters: this.defaultFilters(),
      conformanceFilterOptions: ['pass', 'violation', 'pending', 'unknown'],
      downloadedFilterOptions: [
        { label: 'Downloaded', value: 'true' },
        { label: 'Not Downloaded', value: 'false' }
      ],
      analysisFilterOptions: [
        { label: 'Done', value: 'done' },
        { label: 'Failed', value: 'failed' },
        { label: 'Running', value: 'running' },
        { label: 'Pending', value: 'pending' },
        { label: 'None', value: 'none' }
      ],
      progressDialogVisible: false,
      progressJobId: ''
    };
  },
  computed: {
    stats() {
      return [
        { label: 'Tracked Images', value: this.datasetStats.trackedImages },
        { label: 'Unique Vendors', value: this.datasetStats.uniqueVendors },
        { label: 'Unique Devices (VID:PID)', value: this.datasetStats.uniqueDevices },
        {
          label: 'Conformance Pass',
          value: `${this.datasetStats.conformancePass} (${this.formatPercent(this.datasetStats.conformancePassRatio)})`
        },
        {
          label: 'Conformance Violation',
          value: `${this.datasetStats.conformanceViolation} (${this.formatPercent(this.datasetStats.conformanceViolationRatio)})`
        },
        { label: 'New in 24h', value: this.datasetStats.newIn24h }
      ];
    }
  },
  methods: {
    defaultFilters() {
      return {
        vid: '',
        pid: '',
        vendorName: '',
        productName: '',
        softwareVersion: '',
        softwareVersionString: '',
        releaseTime: '',
        blockHeight: '',
        txHashLast8: '',
        formalityConformance: null,
        isDownloaded: null,
        analysisStatus: null
      };
    },
    clearFilters() {
      this.filters = this.defaultFilters();
      this.pageFirst = 0;
      this.loadAvailableFirmware();
    },
    applyFilters() {
      this.pageFirst = 0;
      this.loadAvailableFirmware();
    },
    onPage(event) {
      this.pageFirst = event.first;
      this.pageSize = event.rows;
      this.loadAvailableFirmware();
    },
    onSort(event) {
      this.uiSortField = event.sortField || 'releaseTime';
      this.sortOrder = event.sortOrder || -1;
      this.pageFirst = 0;
      this.loadAvailableFirmware();
    },
    normalizeSortField(value) {
      const key = String(value || '').trim();
      const map = {
        releaseTime: 'release_time',
        release_time: 'release_time',
        vid: 'vid',
        pid: 'pid',
        vendorName: 'vendor_name',
        vendor_name: 'vendor_name',
        productName: 'product_name',
        product_name: 'product_name',
        softwareVersion: 'software_version',
        software_version: 'software_version',
        softwareVersionString: 'software_version_string',
        software_version_string: 'software_version_string',
        blockHeight: 'block_height',
        block_height: 'block_height',
        formalityConformance: 'formality_conformance',
        formality_conformance: 'formality_conformance'
      };
      return map[key] || 'release_time';
    },
    buildQueryString(refresh) {
      const params = new URLSearchParams({
        limit: String(this.pageSize),
        offset: String(this.pageFirst),
        refresh: refresh ? 'true' : 'false',
        sort_by: this.normalizeSortField(this.uiSortField || 'releaseTime'),
        sort_dir: this.sortOrder === 1 ? 'asc' : 'desc'
      });
      const filterMap = [
        ['vid', this.filters.vid],
        ['pid', this.filters.pid],
        ['vendor_name', this.filters.vendorName],
        ['product_name', this.filters.productName],
        ['software_version', this.filters.softwareVersion],
        ['software_version_string', this.filters.softwareVersionString],
        ['release_time', this.filters.releaseTime],
        ['block_height', this.filters.blockHeight],
        ['tx_hash_last8', this.filters.txHashLast8],
        ['formality_conformance', this.filters.formalityConformance],
        ['is_downloaded', this.filters.isDownloaded],
        ['analysis_status', this.filters.analysisStatus]
      ];
      for (const [key, value] of filterMap) {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          params.set(key, String(value).trim());
        }
      }
      return params.toString();
    },
    async refreshNow() {
      this.pageFirst = 0;
      await this.loadAvailableFirmware(true);
    },
    async loadAvailableFirmware(refresh = false) {
      this.loading = true;
      this.error = null;
      this.actionNote = null;
      try {
        const url = `${this.metadataApiBase}/api/v1/firmware/available?${this.buildQueryString(refresh)}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        this.network = payload.network || '';
        this.metadataSyncedAt = payload.metadata_synced_at || null;
        this.warning = payload.warning || null;
        const apiTotal = Number(payload.total_count);
        this.totalCount = Number.isFinite(apiTotal) && apiTotal >= 0 ? apiTotal : items.length;
        const gs = payload.global_stats || {};
        this.datasetStats = {
          trackedImages: Number.isFinite(Number(gs.tracked_images)) ? Number(gs.tracked_images) : this.totalCount,
          uniqueVendors: Number.isFinite(Number(gs.unique_vendors)) ? Number(gs.unique_vendors) : 0,
          uniqueDevices: Number.isFinite(Number(gs.unique_devices)) ? Number(gs.unique_devices) : 0,
          conformancePass: Number.isFinite(Number(gs.conformance_pass)) ? Number(gs.conformance_pass) : 0,
          conformanceViolation: Number.isFinite(Number(gs.conformance_violation)) ? Number(gs.conformance_violation) : 0,
          conformancePassRatio: Number.isFinite(Number(gs.conformance_pass_ratio)) ? Number(gs.conformance_pass_ratio) : 0,
          conformanceViolationRatio: Number.isFinite(Number(gs.conformance_violation_ratio)) ? Number(gs.conformance_violation_ratio) : 0,
          newIn24h: Number.isFinite(Number(gs.new_in_24h)) ? Number(gs.new_in_24h) : 0
        };
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
          firmwareSha256: item.firmware_sha256 || '',
          isDownloaded: Boolean(item.is_downloaded),
          analysisLatestStatus: this.normalizeAnalysisStatus(item.analysis_latest_status),
          analysisLatestAt: item.analysis_latest_at || null,
          analysisLatestJobId: item.analysis_latest_job_id || '',
          duplicateGroupSize: Number.isFinite(Number(item.duplicate_group_size)) ? Number(item.duplicate_group_size) : 0,
          formalityConformance: this.normalizeConformance(item.formality_conformance, item.formality_basis),
          formalityComment: item.formality_comment || ''
        }));
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load firmware metadata';
        this.rows = [];
        this.totalCount = 0;
        this.datasetStats = {
          trackedImages: 0,
          uniqueVendors: 0,
          uniqueDevices: 0,
          conformancePass: 0,
          conformanceViolation: 0,
          conformancePassRatio: 0,
          conformanceViolationRatio: 0,
          newIn24h: 0
        };
        this.warning = null;
      } finally {
        this.loading = false;
      }
    },
    analysisLabel(value) {
      const key = this.normalizeAnalysisStatus(value);
      if (key === 'done') return 'Done';
      if (key === 'failed') return 'Failed';
      if (key === 'running') return 'Running';
      if (key === 'pending') return 'Pending';
      return 'None';
    },
    analysisSeverity(value) {
      const key = this.normalizeAnalysisStatus(value);
      if (key === 'done') return 'success';
      if (key === 'failed') return 'danger';
      if (key === 'running') return 'info';
      if (key === 'pending') return 'warning';
      return 'secondary';
    },
    normalizeAnalysisStatus(value) {
      const key = String(value || '').trim().toLowerCase();
      if (key === 'done' || key === 'failed' || key === 'running' || key === 'pending') return key;
      return 'none';
    },
    async enqueueAnalyze(row) {
      try {
        const sha = String(row?.firmwareSha256 || '').trim();
        const payload = {
          firmware_sha256: sha || null,
          requested_from: 'available_firmware',
          network: this.network || null,
          vid: row?.vid ?? null,
          pid: row?.pid ?? null,
          software_version: row?.softwareVersion ?? null,
          block_height: row?.blockHeight ?? null,
          tx_hash_last8: this.txHashLast8(row?.txHash)
        };
        const response = await fetch(`${this.metadataApiBase}/api/v1/jobs/analyze-firmware`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          throw new Error(`Analyze enqueue failed (${response.status})`);
        }
        const result = await response.json();
        await this.loadAvailableFirmware();
        const queuedJobId = String(result?.job?.job_id || '').trim();
        if (queuedJobId) {
          this.openJobProgress(queuedJobId);
        }
        const queuedSha = String(result?.firmware_sha256 || sha || '').trim();
        this.actionNote = queuedSha ? `Analysis job queued for ${queuedSha.slice(0, 8)}...` : 'Analysis job queued.';
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to enqueue analysis job';
      }
    },
    openJobProgress(jobId) {
      const id = String(jobId || '').trim();
      if (!id) {
        this.error = 'No analysis job found for this row.';
        return;
      }
      this.progressJobId = id;
      this.progressDialogVisible = true;
    },
    openFirmwareDetail(row) {
      const sha = String(row?.firmwareSha256 || '').trim();
      if (sha) {
        this.$router.push(`/firmware-security/firmware/${sha}`);
        return;
      }
      const vid = String(row?.vid || '').trim();
      const pid = String(row?.pid || '').trim();
      const blockHeight = String(row?.blockHeight || '').trim();
      const txHashLast8 = String(row?.txHashLast8 || '').trim();
      let queryToken = '';
      if (vid && pid && blockHeight) {
        queryToken = `otaT_${vid}_${pid}_${blockHeight}_`;
      } else if (txHashLast8) {
        queryToken = txHashLast8;
      }
      if (!queryToken) {
        this.error = 'No firmware group yet and no identity fields to locate scan results.';
        return;
      }
      this.$router.push({ path: '/firmware-security/scan-results', query: { q: queryToken } });
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
    formatPercent(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '0.00%';
      return `${n.toFixed(2)}%`;
    },
    severityFor(status) {
      if (status.startsWith('Pass')) return 'success';
      if (status.startsWith('Violation')) return 'danger';
      if (status === 'Pending') return 'warning';
      return 'warning';
    },
    formatViolationDetails(value) {
      if (!value) return 'No violation detail';
      return String(value).split(';').join('; ');
    }
  },
  mounted() {
    this.loadAvailableFirmware();
  }
};
</script>

<style scoped>
.firmware-available-page .table-card {
  border-radius: 12px;
}

.firmware-available-page .stat-card {
  min-height: 78px;
  padding: 0.7rem 0.85rem;
}

.firmware-available-page .stat-label {
  color: #6b7280;
  font-size: 0.7rem;
  line-height: 1.1;
}

.firmware-available-page .stat-value {
  color: #111827;
  font-size: 1.24rem;
  font-weight: 600;
  margin-top: 0.32rem;
  line-height: 1.2;
  word-break: break-word;
}

.firmware-available-page .filter-label {
  display: block;
  font-size: 0.82rem;
  color: #6b7280;
  margin-bottom: 0.35rem;
}

.firmware-available-page .table-meta {
  white-space: nowrap;
}

.firmware-available-page .table-filters {
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}

.firmware-available-page .cell-center {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
