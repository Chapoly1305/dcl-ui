<template>
  <div class="p-3 scan-results-page">
    <div class="grid">
      <div class="col-12 xl:col-8">
        <Card class="results-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Scan Results</span>
                <SelectButton
                  v-model="scope"
                  :options="scopeOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="p-button-sm"
                  @change="onScopeChange"
                />
                <Tag :value="`Total: ${totalCount}`" severity="info" />
              </div>
              <div class="flex align-items-center gap-2">
                <span class="text-600 text-sm">Showing {{ totalCount === 0 ? 0 : pageFirst + 1 }} - {{ Math.min(pageFirst + pageSize, totalCount) }}</span>
                <Button
                  icon="pi pi-refresh"
                  class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading"
                  v-tooltip.top="'Refresh results'"
                  @click="refreshNow"
                />
              </div>
            </div>
          </template>
          <template #content>
            <div class="grid filters mb-3">
              <div class="col-12 md:col-3">
                <label class="filter-label">Search</label>
                <InputText v-model="filters.q" class="w-full p-inputtext-sm" placeholder="run/result/firmware..." />
              </div>
              <div class="col-6 md:col-2">
                <label class="filter-label">Verdict</label>
                <Dropdown
                  v-model="filters.verdict"
                  class="w-full p-inputtext-sm"
                  :options="verdictOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Any"
                  showClear
                />
              </div>
              <div class="col-6 md:col-2">
                <label class="filter-label">Status</label>
                <Dropdown
                  v-model="filters.status"
                  class="w-full p-inputtext-sm"
                  :options="statusOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Any"
                  showClear
                />
              </div>
              <div class="col-6 md:col-2">
                <label class="filter-label">Chipset</label>
                <InputText v-model="filters.chipset" class="w-full p-inputtext-sm" placeholder="e.g. siliconlabs" />
              </div>
              <div class="col-6 md:col-1">
                <label class="filter-label">Network</label>
                <Dropdown
                  v-model="filters.network"
                  class="w-full p-inputtext-sm"
                  :options="networkOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Any"
                  showClear
                />
              </div>
              <div class="col-6 md:col-1">
                <label class="filter-label">From</label>
                <Calendar v-model="filters.fromTime" class="w-full p-inputtext-sm" dateFormat="yy-mm-dd" showTime hourFormat="24" />
              </div>
              <div class="col-6 md:col-1">
                <label class="filter-label">To</label>
                <Calendar v-model="filters.toTime" class="w-full p-inputtext-sm" dateFormat="yy-mm-dd" showTime hourFormat="24" />
              </div>
              <div class="col-12 md:col-12 flex align-items-end gap-2">
                <Button label="Clear" icon="pi pi-filter-slash" class="p-button-text p-button-sm" @click="clearFilters" />
                <Button label="Apply Filters" icon="pi pi-search" class="p-button-sm" @click="applyFilters" />
              </div>
            </div>

            <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

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
              @row-click="onRowClick"
              responsiveLayout="scroll"
              class="p-datatable-sm"
            >
              <Column field="analyzed_at" header="Analyzed At" sortable>
                <template #body="slotProps">{{ formatTimestamp(slotProps.data.analyzed_at) }}</template>
              </Column>
              <Column field="input_firmware_name" header="Firmware" />
              <Column field="firmware_sha256" header="Firmware SHA">
                <template #body="slotProps"><code>{{ shortSha(slotProps.data.firmware_sha256) }}</code></template>
              </Column>
              <Column field="status" header="Run Status" sortable>
                <template #body="slotProps">
                  <Tag :value="slotProps.data.status" :severity="runStatusSeverity(slotProps.data.status)" />
                </template>
              </Column>
              <Column field="verdict_integrity" header="Integrity" sortable>
                <template #body="slotProps">
                  <Tag :value="slotProps.data.verdict_integrity" :severity="verdictSeverity(slotProps.data.verdict_integrity)" />
                </template>
              </Column>
              <Column field="verdict_authenticity" header="Authenticity" sortable>
                <template #body="slotProps">
                  <Tag :value="slotProps.data.verdict_authenticity" :severity="verdictSeverity(slotProps.data.verdict_authenticity)" />
                </template>
              </Column>
              <Column field="chipset" header="Chipset" sortable>
                <template #body="slotProps">
                  <div class="flex flex-column gap-1">
                    <span>{{ displayValue(slotProps.data.chipset) }}</span>
                    <span class="text-500 text-xs">conf {{ formatConfidence(slotProps.data.chipset_confidence) }}</span>
                  </div>
                </template>
              </Column>
              <Column field="sdk_best_guess_base" header="SDK">
                <template #body="slotProps">{{ displayValue(slotProps.data.sdk_best_guess_base) }}</template>
              </Column>
              <Column field="attempt_count" header="Attempts" headerClass="text-center" bodyClass="text-center">
                <template #body="slotProps">
                  <div class="flex align-items-center justify-content-center gap-1">
                    <Tag :value="String(slotProps.data.attempt_count || 1)" severity="secondary" />
                    <Tag
                      v-if="scope === 'all'"
                      :value="`#${slotProps.data.attempt_index}`"
                      :severity="slotProps.data.latest_in_group ? 'success' : 'warning'"
                    />
                  </div>
                </template>
              </Column>
              <Column field="source_network" header="Network" />
              <Column header="Actions">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-2">
                    <Button
                      icon="pi pi-file"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="'View rendered report'"
                      @click.stop="openReport(slotProps.data)"
                    />
                    <Button
                      icon="pi pi-external-link"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="slotProps.data.firmware_sha256 ? 'Open firmware detail' : 'Firmware SHA missing'"
                      :disabled="!slotProps.data.firmware_sha256"
                      @click.stop="openFirmwareDetail(slotProps.data)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>

            <div v-if="!loading && totalCount === 0" class="text-600 mt-3">No scan results found for current filters.</div>
          </template>
        </Card>
      </div>

      <div class="col-12 xl:col-4">
        <Card class="report-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Rendered Report</span>
                <Tag v-if="selectedResult" :value="`Result: ${shortId(selectedResult.result_id)}`" severity="info" />
              </div>
              <Button
                icon="pi pi-refresh"
                class="p-button-text p-button-sm p-button-rounded"
                :loading="detailLoading"
                v-tooltip.top="'Refresh selected report'"
                :disabled="!selectedResultId"
                @click="reloadSelectedDetail"
              />
            </div>
          </template>
          <template #content>
            <Message v-if="detailError" severity="error" :closable="false" class="mb-3">{{ detailError }}</Message>

            <div v-if="!selectedResultId && !detailLoading" class="text-600">Select a row to read the report.</div>

            <div v-else-if="detailLoading" class="flex align-items-center gap-2 text-600">
              <ProgressSpinner style="width: 1.5rem; height: 1.5rem" strokeWidth="6" />
              Loading report...
            </div>

            <div v-else-if="selectedResult">
              <div class="mb-3 attempt-strip">
                <div class="text-700 text-sm mb-2">Attempt Timeline</div>
                <div class="attempt-list">
                  <Button
                    v-for="(attempt, idx) in attempts"
                    :key="attempt.result_id"
                    class="p-button-text p-button-sm attempt-btn"
                    :class="{ 'is-active': attempt.result_id === selectedResultId }"
                    @click="selectAttempt(attempt.result_id)"
                  >
                    <span class="attempt-label">#{{ idx + 1 }}</span>
                    <span class="attempt-time">{{ formatTimestamp(attempt.analyzed_at) }}</span>
                    <Tag :value="attempt.status" :severity="runStatusSeverity(attempt.status)" />
                  </Button>
                </div>
              </div>

              <TabView v-model:activeIndex="detailTabIndex">
                <TabPanel header="Summary">
                  <div class="grid">
                    <div class="col-6"><strong>Run ID:</strong> <code>{{ selectedResult.run_id }}</code></div>
                    <div class="col-6"><strong>Result ID:</strong> <code>{{ selectedResult.result_id }}</code></div>
                    <div class="col-6"><strong>Analyzed:</strong> {{ formatTimestamp(selectedResult.analyzed_at) }}</div>
                    <div class="col-6"><strong>Status:</strong> <Tag :value="selectedResult.status" :severity="runStatusSeverity(selectedResult.status)" /></div>
                    <div class="col-6"><strong>Integrity:</strong> <Tag :value="selectedResult.verdict_integrity" :severity="verdictSeverity(selectedResult.verdict_integrity)" /></div>
                    <div class="col-6"><strong>Authenticity:</strong> <Tag :value="selectedResult.verdict_authenticity" :severity="verdictSeverity(selectedResult.verdict_authenticity)" /></div>
                    <div class="col-6"><strong>Chipset:</strong> {{ displayValue(selectedResult.chipset) }}</div>
                    <div class="col-6"><strong>SDK Guess:</strong> {{ displayValue(selectedResult.sdk_best_guess_base) }}</div>
                    <div class="col-12"><strong>Input Firmware:</strong> {{ displayValue(selectedResult.input_firmware_name) }}</div>
                  </div>
                </TabPanel>

                <TabPanel header="OTA/Header">
                  <DataTable :value="otaRows" responsiveLayout="scroll" class="p-datatable-sm">
                    <Column field="label" header="Field" />
                    <Column field="value" header="Value" />
                  </DataTable>
                  <div v-if="otaRows.length === 0" class="text-600 mt-2">No OTA header data available.</div>
                </TabPanel>

                <TabPanel header="SDK Evidence">
                  <div class="mb-2"><strong>Best Guess:</strong> {{ displayValue(sdkBestGuess) }}</div>
                  <div class="mb-2">
                    <strong>Possible Versions:</strong>
                    <span v-if="sdkPossible.length === 0" class="text-600"> - </span>
                    <Tag v-for="v in sdkPossible" :key="`possible-${v}`" :value="v" severity="success" class="mr-2 mb-2" />
                  </div>
                  <div class="mb-2">
                    <strong>Impossible Versions:</strong>
                    <span v-if="sdkImpossible.length === 0" class="text-600"> - </span>
                    <Tag v-for="v in sdkImpossible" :key="`impossible-${v}`" :value="v" severity="danger" class="mr-2 mb-2" />
                  </div>
                  <div class="mb-2">
                    <strong>Warnings:</strong>
                    <span v-if="sdkWarnings.length === 0" class="text-600"> - </span>
                    <Tag v-for="(v, idx) in sdkWarnings" :key="`warn-${idx}`" :value="v" severity="warning" class="mr-2 mb-2" />
                  </div>
                </TabPanel>

                <TabPanel header="Stages">
                  <DataTable :value="stageRows" responsiveLayout="scroll" class="p-datatable-sm">
                    <Column field="name" header="Stage">
                      <template #body="slotProps">{{ stageLabel(slotProps.data.name) }}</template>
                    </Column>
                    <Column field="status" header="Status">
                      <template #body="slotProps">
                        <Tag :value="slotProps.data.status" :severity="stageSeverity(slotProps.data.status)" />
                      </template>
                    </Column>
                    <Column field="started_at" header="Started">
                      <template #body="slotProps">{{ displayValue(formatTimestamp(slotProps.data.started_at)) }}</template>
                    </Column>
                    <Column field="ended_at" header="Ended">
                      <template #body="slotProps">{{ displayValue(formatTimestamp(slotProps.data.ended_at)) }}</template>
                    </Column>
                    <Column field="duration" header="Duration">
                      <template #body="slotProps">{{ slotProps.data.duration }}</template>
                    </Column>
                    <Column field="error" header="Error">
                      <template #body="slotProps">{{ displayValue(slotProps.data.error) }}</template>
                    </Column>
                  </DataTable>
                </TabPanel>

                <TabPanel header="Provenance">
                  <div class="grid">
                    <div class="col-12"><strong>Source Network:</strong> {{ displayValue(selectedResult.source_network) }}</div>
                    <div class="col-12"><strong>Source Path:</strong> {{ displayValue(selectedResult.source_rel_path) }}</div>
                    <div class="col-12"><strong>Firmware Store Path:</strong> {{ displayValue(selectedResult.firmware_store_path) }}</div>
                    <div class="col-12"><strong>Report Path:</strong> {{ displayValue(selectedResult.report_path) }}</div>
                    <div class="col-12"><strong>Parent Run ID:</strong> {{ displayValue(selectedResult.parent_run_id) }}</div>
                  </div>
                </TabPanel>
              </TabView>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FirmwareScanResults',
  data() {
    const base = (import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
    return {
      apiBase: base,
      loading: false,
      error: null,
      rows: [],
      totalCount: 0,
      pageSize: 50,
      pageFirst: 0,
      scope: 'latest',
      scopeOptions: [
        { label: 'Latest', value: 'latest' },
        { label: 'All Attempts', value: 'all' }
      ],
      uiSortField: 'analyzed_at',
      sortOrder: -1,
      filters: {
        q: '',
        verdict: null,
        status: null,
        chipset: '',
        network: null,
        fromTime: null,
        toTime: null
      },
      verdictOptions: [
        { label: 'Pass', value: 'pass' },
        { label: 'Fail', value: 'fail' },
        { label: 'Warning', value: 'warning' },
        { label: 'Unknown', value: 'unknown' }
      ],
      statusOptions: [
        { label: 'Success', value: 'success' },
        { label: 'Partial', value: 'partial' },
        { label: 'Failed', value: 'failed' }
      ],
      networkOptions: [
        { label: 'Testnet', value: 'testnet' },
        { label: 'Mainnet', value: 'mainnet' }
      ],
      selectedResultId: '',
      detailLoading: false,
      detailError: null,
      detailPayload: {
        result: null,
        attempts: []
      },
      detailTabIndex: 0
    };
  },
  computed: {
    selectedResult() {
      return this.detailPayload?.result || null;
    },
    attempts() {
      const rows = Array.isArray(this.detailPayload?.attempts) ? this.detailPayload.attempts : [];
      return [...rows].sort((a, b) => String(b.analyzed_at || '').localeCompare(String(a.analyzed_at || '')));
    },
    sanitizedReport() {
      return this.selectedResult?.sanitized_report || {};
    },
    reportOutputs() {
      return this.sanitizedReport?.outputs || {};
    },
    otaRows() {
      const ota = this.reportOutputs?.matter_ota || {};
      const header = ota?.header || {};
      const data = [
        ['Is Matter OTA', this.boolLabel(ota?.is_matter_ota)],
        ['Hash Verified', this.boolLabel(ota?.hash_verified)],
        ['VID', header?.vid],
        ['PID', header?.pid],
        ['Software Version', header?.software_version],
        ['Software Version String', header?.software_version_string],
        ['Hash Algorithm', header?.hash_algorithm],
        ['Digest Type', header?.digest_type],
        ['Payload Size', header?.payload_size],
        ['Total Size', header?.total_size],
        ['Payload Hash', header?.payload_hash]
      ];
      return data
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([label, value]) => ({ label, value: String(value) }));
    },
    sdkResult() {
      return this.reportOutputs?.sdk_result || {};
    },
    sdkBestGuess() {
      return this.sdkResult?.best_guess_base || this.selectedResult?.sdk_best_guess_base || null;
    },
    sdkPossible() {
      return Array.isArray(this.sdkResult?.possible_versions) ? this.sdkResult.possible_versions : [];
    },
    sdkImpossible() {
      return Array.isArray(this.sdkResult?.impossible_versions) ? this.sdkResult.impossible_versions : [];
    },
    sdkWarnings() {
      return Array.isArray(this.sdkResult?.attribution_warnings) ? this.sdkResult.attribution_warnings : [];
    },
    stageRows() {
      const stages = Array.isArray(this.sanitizedReport?.stages) ? this.sanitizedReport.stages : [];
      return stages.map((stage) => {
        const details = stage?.details || {};
        const started = stage?.started_at || null;
        const ended = stage?.ended_at || null;
        return {
          name: stage?.name || '',
          status: stage?.status || '',
          started_at: started,
          ended_at: ended,
          duration: this.durationLabel(started, ended),
          error: details?.error || null
        };
      });
    }
  },
  methods: {
    onScopeChange() {
      this.pageFirst = 0;
      this.loadResults();
    },
    onPage(event) {
      this.pageFirst = event.first;
      this.pageSize = event.rows;
      this.loadResults();
    },
    onSort(event) {
      this.uiSortField = event.sortField || 'analyzed_at';
      this.sortOrder = event.sortOrder || -1;
      this.pageFirst = 0;
      this.loadResults();
    },
    sortFieldApi(value) {
      const key = String(value || '').trim();
      const allowed = new Set(['analyzed_at', 'chipset', 'status', 'verdict_integrity', 'verdict_authenticity']);
      return allowed.has(key) ? key : 'analyzed_at';
    },
    buildQuery() {
      const params = new URLSearchParams({
        scope: this.scope,
        limit: String(this.pageSize),
        offset: String(this.pageFirst),
        sort_by: this.sortFieldApi(this.uiSortField),
        sort_dir: this.sortOrder === 1 ? 'asc' : 'desc'
      });
      const map = [
        ['q', this.filters.q],
        ['verdict', this.filters.verdict],
        ['status', this.filters.status],
        ['chipset', this.filters.chipset],
        ['network', this.filters.network]
      ];
      for (const [k, v] of map) {
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          params.set(k, String(v).trim());
        }
      }
      if (this.filters.fromTime instanceof Date) params.set('from_time', this.filters.fromTime.toISOString());
      if (this.filters.toTime instanceof Date) params.set('to_time', this.filters.toTime.toISOString());
      return params.toString();
    },
    async refreshNow() {
      await this.loadResults();
    },
    async loadResults() {
      this.loading = true;
      this.error = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/results?${this.buildQuery()}`);
        if (!response.ok) throw new Error(`Results request failed (${response.status})`);
        const payload = await response.json();
        this.rows = Array.isArray(payload.items) ? payload.items : [];
        this.totalCount = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : this.rows.length;

        const currentSelected = String(this.selectedResultId || '').trim();
        const hasCurrent = this.rows.some((row) => row.result_id === currentSelected);
        if (!hasCurrent) {
          const first = this.rows[0];
          if (first?.result_id) {
            await this.openReport(first);
          } else {
            this.selectedResultId = '';
            this.detailPayload = { result: null, attempts: [] };
          }
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load results';
        this.rows = [];
        this.totalCount = 0;
      } finally {
        this.loading = false;
      }
    },
    clearFilters() {
      this.filters = {
        q: '',
        verdict: null,
        status: null,
        chipset: '',
        network: null,
        fromTime: null,
        toTime: null
      };
      this.pageFirst = 0;
      this.loadResults();
    },
    applyFilters() {
      this.pageFirst = 0;
      this.loadResults();
    },
    async onRowClick(event) {
      await this.openReport(event?.data);
    },
    async openReport(row) {
      const resultId = String(row?.result_id || '').trim();
      if (!resultId) return;
      this.selectedResultId = resultId;
      this.detailTabIndex = 0;
      await this.loadResultDetail(resultId);
    },
    async reloadSelectedDetail() {
      if (!this.selectedResultId) return;
      await this.loadResultDetail(this.selectedResultId);
    },
    async selectAttempt(resultId) {
      const id = String(resultId || '').trim();
      if (!id || id === this.selectedResultId) return;
      this.selectedResultId = id;
      await this.loadResultDetail(id);
    },
    async loadResultDetail(resultId) {
      this.detailLoading = true;
      this.detailError = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/results/${encodeURIComponent(resultId)}`);
        if (!response.ok) throw new Error(`Result detail request failed (${response.status})`);
        const payload = await response.json();
        this.detailPayload = {
          result: payload?.result || null,
          attempts: Array.isArray(payload?.attempts) ? payload.attempts : []
        };
      } catch (err) {
        this.detailError = err instanceof Error ? err.message : 'Failed to load result detail';
      } finally {
        this.detailLoading = false;
      }
    },
    openFirmwareDetail(row) {
      const sha = String(row?.firmware_sha256 || '').trim();
      if (!sha) return;
      this.$router.push(`/firmware-security/firmware/${sha}`);
    },
    runStatusSeverity(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'success') return 'success';
      if (key === 'partial') return 'warning';
      if (key === 'failed') return 'danger';
      return 'info';
    },
    verdictSeverity(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'pass') return 'success';
      if (key === 'fail') return 'danger';
      if (key === 'warning') return 'warning';
      return 'info';
    },
    stageSeverity(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'success' || key === 'done') return 'success';
      if (key === 'failed' || key === 'error') return 'danger';
      if (key === 'running') return 'info';
      if (key === 'pending') return 'warning';
      return 'secondary';
    },
    stageLabel(value) {
      const map = {
        '00_meta': '00 Meta',
        '10_matter_ota': '10 Matter OTA',
        '20_chipset_identify': '20 Chipset Identify',
        '30_extract_executable': '30 Extract Executable',
        '40_ida_headless': '40 IDA Headless',
        '50_capability_recovery': '50 Capability Recovery',
        '60_sdk_version': '60 SDK Version',
        '90_finalize': '90 Finalize'
      };
      return map[String(value || '')] || String(value || '-');
    },
    formatTimestamp(value) {
      if (!value) return '';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    durationLabel(startedAt, endedAt) {
      const start = startedAt ? new Date(startedAt) : null;
      const end = endedAt ? new Date(endedAt) : null;
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-';
      const ms = end.getTime() - start.getTime();
      if (ms < 0) return '-';
      if (ms < 1000) return `${ms} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    },
    shortSha(value) {
      const text = String(value || '').trim();
      if (!text) return '-';
      return text.length <= 16 ? text : `${text.slice(0, 8)}...${text.slice(-8)}`;
    },
    shortId(value) {
      const text = String(value || '').trim();
      return text ? text.slice(0, 8) : '-';
    },
    formatConfidence(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '-';
      return n.toFixed(2);
    },
    boolLabel(value) {
      if (value === true) return 'Yes';
      if (value === false) return 'No';
      return '-';
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    }
  },
  mounted() {
    this.loadResults();
  }
};
</script>

<style scoped>
.scan-results-page .results-card,
.scan-results-page .report-card {
  border-radius: 12px;
}

.scan-results-page .filters {
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}

.scan-results-page .filter-label {
  display: block;
  font-size: 0.82rem;
  color: #6b7280;
  margin-bottom: 0.35rem;
}

.scan-results-page .attempt-strip {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.6rem;
  background: #fafafa;
}

.scan-results-page .attempt-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 180px;
  overflow: auto;
}

.scan-results-page .attempt-btn {
  justify-content: flex-start;
  gap: 0.5rem;
  border: 1px solid transparent;
}

.scan-results-page .attempt-btn.is-active {
  border-color: #93c5fd;
  background: #eff6ff;
}

.scan-results-page .attempt-label {
  font-weight: 600;
  min-width: 2.1rem;
}

.scan-results-page .attempt-time {
  color: #4b5563;
  font-size: 0.83rem;
}
</style>
