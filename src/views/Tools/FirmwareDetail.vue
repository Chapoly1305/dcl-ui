<template>
  <div class="p-3 firmware-detail-page">
    <div class="grid">
      <div class="col-12">
        <Card class="detail-header-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <Button icon="pi pi-arrow-left" class="p-button-text p-button-sm" @click="goBack" />
                <span>Firmware Detail</span>
                <Tag :value="`SHA: ${shortSha(firmwareSha256)}`" severity="info" />
                <Tag :value="detail.is_downloaded ? 'Downloaded' : 'Not Downloaded'" :severity="detail.is_downloaded ? 'success' : 'warning'" />
                <Tag :value="analysisLabel(detail.analysis_latest_status)" :severity="analysisSeverity(detail.analysis_latest_status)" />
              </div>
              <div class="flex align-items-center gap-2 flex-wrap">
                <Button
                  icon="pi pi-play"
                  class="p-button-sm"
                  label="Analyze"
                  :disabled="!detail.is_downloaded"
                  :loading="enqueueLoading"
                  @click="enqueueAnalyze"
                />
                <Button
                  icon="pi pi-refresh"
                  class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading"
                  v-tooltip.top="'Refresh detail'"
                  @click="refreshAll"
                />
              </div>
            </div>
          </template>
          <template #content>
            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
            <Message v-else-if="statusNote" severity="success" :closable="false">{{ statusNote }}</Message>
            <div v-else class="text-600 text-sm">
              Last analysis: {{ displayValue(formatTimestamp(detail.analysis_latest_at)) }}
            </div>
          </template>
        </Card>
      </div>

      <div class="col-12">
        <TabView v-model:activeIndex="activeTabIndex" @tab-change="onTabChange">
          <TabPanel header="Overview">
            <div class="grid">
              <div class="col-6 md:col-3" v-for="k in overviewKpis" :key="k.label">
                <div class="card mb-0 stat-card">
                  <div class="stat-label">{{ k.label }}</div>
                  <div class="stat-value">{{ k.value }}</div>
                </div>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="detail-card">
                  <template #title>Linked DCL Records</template>
                  <template #content>
                    <DataTable :value="detail.aliases || []" responsiveLayout="scroll" class="p-datatable-sm" :rows="8" :paginator="(detail.aliases || []).length > 8">
                      <Column field="network" header="Network" />
                      <Column field="vid" header="VID" />
                      <Column field="pid" header="PID" />
                      <Column field="software_version" header="Software Version" />
                      <Column field="tx_hash_last8" header="TxHash (Last 8)">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.tx_hash_last8 }}</code>
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="(detail.aliases || []).length === 0" class="text-600 mt-2">No linked DCL aliases.</div>
                  </template>
                </Card>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="detail-card">
                  <template #title>Latest Outcome</template>
                  <template #content>
                    <div v-if="detail.latest_result" class="grid">
                      <div class="col-12 md:col-6"><strong>Result ID:</strong> <code>{{ detail.latest_result.result_id }}</code></div>
                      <div class="col-12 md:col-6"><strong>Run ID:</strong> <code>{{ detail.latest_result.run_id }}</code></div>
                      <div class="col-12 md:col-6"><strong>Status:</strong> {{ detail.latest_result.status }}</div>
                      <div class="col-12 md:col-6"><strong>Analyzed At:</strong> {{ formatTimestamp(detail.latest_result.analyzed_at) }}</div>
                      <div class="col-12 md:col-6"><strong>Integrity:</strong> {{ detail.latest_result.verdict_integrity }}</div>
                      <div class="col-12 md:col-6"><strong>Authenticity:</strong> {{ detail.latest_result.verdict_authenticity }}</div>
                      <div class="col-12 md:col-6"><strong>Chipset:</strong> {{ detail.latest_result.chipset }}</div>
                      <div class="col-12 md:col-6"><strong>SDK:</strong> {{ displayValue(detail.latest_result.sdk_best_guess_base) }}</div>
                    </div>
                    <div v-else class="text-600">No completed analysis yet for this firmware group.</div>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Jobs">
            <Card class="detail-card">
              <template #title>Job History</template>
              <template #content>
                <DataTable :value="jobRows" responsiveLayout="scroll" class="p-datatable-sm" :rows="15" paginator>
                  <Column field="job_id" header="Job ID">
                    <template #body="slotProps"><code>{{ shortId(slotProps.data.job_id) }}</code></template>
                  </Column>
                  <Column field="status" header="Status">
                    <template #body="slotProps"><Tag :value="slotProps.data.status" :severity="analysisSeverity(slotProps.data.status)" /></template>
                  </Column>
                  <Column field="job_type" header="Type" />
                  <Column field="requested_at" header="Requested">
                    <template #body="slotProps">{{ formatTimestamp(slotProps.data.requested_at) }}</template>
                  </Column>
                  <Column field="started_at" header="Started">
                    <template #body="slotProps">{{ displayValue(formatTimestamp(slotProps.data.started_at)) }}</template>
                  </Column>
                  <Column field="finished_at" header="Finished">
                    <template #body="slotProps">{{ displayValue(formatTimestamp(slotProps.data.finished_at)) }}</template>
                  </Column>
                  <Column field="error" header="Error">
                    <template #body="slotProps"><span class="text-600">{{ displayValue(slotProps.data.error) }}</span></template>
                  </Column>
                </DataTable>
              </template>
            </Card>
          </TabPanel>

          <TabPanel header="Modules">
            <div class="grid">
              <div class="col-12 md:col-6" v-for="m in modules" :key="m.module_id">
                <Card class="detail-card module-card">
                  <template #title>
                    <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
                      <span>{{ m.title }}</span>
                      <Tag :value="analysisLabel(m.status)" :severity="analysisSeverity(m.status)" />
                    </div>
                  </template>
                  <template #content>
                    <div class="module-summary">
                      <div v-for="(value, key) in (m.summary || {})" :key="`${m.module_id}-${key}`" class="summary-row">
                        <span class="text-600">{{ key }}</span>
                        <span class="text-900">{{ stringifyValue(value) }}</span>
                      </div>
                    </div>
                    <div class="mt-3">
                      <Accordion :activeIndex="[]">
                        <AccordionTab header="Details (raw)">
                          <pre class="module-json">{{ prettyJson(m.details || {}) }}</pre>
                        </AccordionTab>
                      </Accordion>
                    </div>
                  </template>
                </Card>
              </div>
              <div v-if="modules.length === 0" class="col-12 text-600">No module output available yet.</div>
            </div>
          </TabPanel>
        </TabView>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FirmwareDetail',
  data() {
    const base = (import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
    return {
      apiBase: base,
      loading: false,
      enqueueLoading: false,
      error: null,
      statusNote: null,
      detail: {
        firmware_sha256: '',
        is_downloaded: false,
        duplicate_group_size: 0,
        analysis_latest_status: 'none',
        analysis_latest_at: null,
        attempt_count: 0,
        aliases: [],
        latest_result: null,
        jobs: { pending: [], running: [], done: [], failed: [] }
      },
      jobsPayload: { jobs: { pending: [], running: [], done: [], failed: [] }, attempts: [] },
      modulesPayload: { modules: [], run_id: null },
      activeTabIndex: 0,
      jobsLoaded: false,
      modulesLoaded: false
    };
  },
  computed: {
    firmwareSha256() {
      return String(this.$route.params.sha256 || '').toLowerCase();
    },
    overviewKpis() {
      return [
        { label: 'Duplicate Records', value: this.detail.duplicate_group_size || 0 },
        { label: 'Attempts', value: this.detail.attempt_count || 0 },
        { label: 'Latest Status', value: this.analysisLabel(this.detail.analysis_latest_status) },
        { label: 'Downloaded', value: this.detail.is_downloaded ? 'Yes' : 'No' }
      ];
    },
    jobRows() {
      const j = this.jobsPayload.jobs || {};
      const out = [];
      for (const key of ['running', 'pending', 'failed', 'done']) {
        const rows = Array.isArray(j[key]) ? j[key] : [];
        for (const row of rows) out.push({ ...row, status: key });
      }
      return out.sort((a, b) => String(b.finished_at || b.started_at || b.requested_at || '').localeCompare(String(a.finished_at || a.started_at || a.requested_at || '')));
    },
    modules() {
      return Array.isArray(this.modulesPayload.modules) ? this.modulesPayload.modules : [];
    }
  },
  methods: {
    async refreshAll() {
      await this.refreshDetail();
      if (this.activeTabIndex === 1) await this.refreshJobs();
      if (this.activeTabIndex === 2) await this.refreshModules();
    },
    async refreshDetail() {
      this.loading = true;
      this.error = null;
      this.statusNote = null;
      try {
        const detailResp = await fetch(`${this.apiBase}/api/v1/firmware/${this.firmwareSha256}`);
        if (!detailResp.ok) throw new Error(`Detail request failed (${detailResp.status})`);
        this.detail = await detailResp.json();
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load firmware detail';
      } finally {
        this.loading = false;
      }
    },
    async refreshJobs() {
      this.loading = true;
      this.error = null;
      try {
        const jobsResp = await fetch(`${this.apiBase}/api/v1/firmware/${this.firmwareSha256}/jobs`);
        if (!jobsResp.ok) throw new Error(`Jobs request failed (${jobsResp.status})`);
        this.jobsPayload = await jobsResp.json();
        this.jobsLoaded = true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load job history';
      } finally {
        this.loading = false;
      }
    },
    async refreshModules() {
      this.loading = true;
      this.error = null;
      try {
        const modulesResp = await fetch(`${this.apiBase}/api/v1/firmware/${this.firmwareSha256}/modules`);
        if (!modulesResp.ok) throw new Error(`Modules request failed (${modulesResp.status})`);
        this.modulesPayload = await modulesResp.json();
        this.modulesLoaded = true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load module outputs';
      } finally {
        this.loading = false;
      }
    },
    async onTabChange(event) {
      const idx = Number(event?.index ?? this.activeTabIndex);
      this.activeTabIndex = Number.isFinite(idx) ? idx : 0;
      if (this.activeTabIndex === 1 && !this.jobsLoaded) await this.refreshJobs();
      if (this.activeTabIndex === 2 && !this.modulesLoaded) await this.refreshModules();
    },
    async enqueueAnalyze() {
      this.enqueueLoading = true;
      this.error = null;
      this.statusNote = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs/analyze-firmware`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firmware_sha256: this.firmwareSha256, requested_from: 'firmware_detail' })
        });
        if (!response.ok) {
          throw new Error(`Analyze enqueue failed (${response.status})`);
        }
        await this.refreshAll();
        this.statusNote = `Analysis job queued for ${this.shortSha(this.firmwareSha256)}.`;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to queue analysis job';
      } finally {
        this.enqueueLoading = false;
      }
    },
    goBack() {
      this.$router.push('/firmware-security/available-firmware');
    },
    formatTimestamp(value) {
      if (!value) return '';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    analysisLabel(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'done' || key === 'pass') return 'Done';
      if (key === 'failed' || key === 'violation') return 'Failed';
      if (key === 'running') return 'Running';
      if (key === 'pending') return 'Pending';
      return 'None';
    },
    analysisSeverity(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'done' || key === 'pass') return 'success';
      if (key === 'failed' || key === 'violation') return 'danger';
      if (key === 'running') return 'info';
      if (key === 'pending') return 'warning';
      return 'secondary';
    },
    shortSha(value) {
      const text = String(value || '');
      if (text.length <= 16) return text || '-';
      return `${text.slice(0, 8)}...${text.slice(-8)}`;
    },
    shortId(value) {
      const text = String(value || '');
      return text ? text.slice(0, 8) : '-';
    },
    stringifyValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    },
    prettyJson(value) {
      try {
        return JSON.stringify(value || {}, null, 2);
      } catch {
        return '{}';
      }
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    }
  },
  mounted() {
    this.refreshAll();
  }
};
</script>

<style scoped>
.firmware-detail-page .detail-header-card,
.firmware-detail-page .detail-card {
  border-radius: 12px;
}

.firmware-detail-page .stat-card {
  min-height: 78px;
  padding: 0.7rem 0.85rem;
}

.firmware-detail-page .stat-label {
  color: #6b7280;
  font-size: 0.72rem;
  line-height: 1.1;
}

.firmware-detail-page .stat-value {
  color: #111827;
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: 0.3rem;
  line-height: 1.2;
}

.firmware-detail-page .module-summary {
  display: grid;
  gap: 0.45rem;
}

.firmware-detail-page .summary-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.firmware-detail-page .module-json {
  margin: 0;
  padding: 0.65rem;
  max-height: 240px;
  overflow: auto;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.78rem;
}
</style>
