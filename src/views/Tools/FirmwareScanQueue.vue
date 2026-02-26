<template>
  <div class="p-3 firmware-queue-page">
    <div class="grid">
      <div class="col-12">
        <Card class="queue-header-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Scan Queue</span>
                <Tag :value="`Updated: ${lastUpdated ? formatTimestamp(lastUpdated) : 'never'}`" severity="info" />
                <Tag v-if="loading" value="Refreshing" severity="warning" />
              </div>
              <div class="flex align-items-center gap-2 flex-wrap">
                <Button
                  icon="pi pi-refresh"
                  class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading"
                  v-tooltip.top="'Refresh Queue'"
                  @click="refreshQueue"
                />
                <Button
                  label="Poll Source"
                  icon="pi pi-cloud-download"
                  class="p-button-sm p-button-outlined"
                  :loading="actionLoading.poll"
                  @click="enqueuePollSource"
                />
                <Button
                  label="Validate Conformance"
                  icon="pi pi-shield"
                  class="p-button-sm p-button-outlined"
                  :loading="actionLoading.validate"
                  @click="enqueueValidateConformance"
                />
              </div>
            </div>
          </template>
          <template #content>
            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
            <Message v-else-if="statusNote" severity="success" :closable="false">{{ statusNote }}</Message>
          </template>
        </Card>
      </div>

      <div class="col-6 md:col-4 lg:col-2" v-for="item in queueStats" :key="item.label">
        <div class="card mb-0 stat-card">
          <div class="stat-label">{{ item.label }}</div>
          <div class="stat-value">{{ item.value }}</div>
        </div>
      </div>

      <div class="col-12 lg:col-6">
        <Card class="jobs-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <span>Running Jobs</span>
              <Tag :value="String(jobs.running.length)" severity="info" />
            </div>
          </template>
          <template #content>
            <DataTable
              :value="jobs.running"
              responsiveLayout="scroll"
              class="p-datatable-sm"
              :rows="8"
              :paginator="jobs.running.length > 8"
            >
              <Column field="job_id" header="Job ID">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-2">
                    <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                    <Button
                      icon="pi pi-chart-line"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="'Open job progress'"
                      @click="openJobProgress(slotProps.data.job_id)"
                    />
                  </div>
                </template>
              </Column>
              <Column field="job_type" header="Type">
                <template #body="slotProps">
                  <Tag :value="jobTypeLabel(slotProps.data.job_type)" :severity="jobTypeSeverity(slotProps.data.job_type)" />
                </template>
              </Column>
              <Column field="requested_at" header="Queued">
                <template #body="slotProps">
                  {{ formatTimestamp(slotProps.data.requested_at) }}
                </template>
              </Column>
              <Column field="started_at" header="Started">
                <template #body="slotProps">
                  {{ formatTimestamp(slotProps.data.started_at) }}
                </template>
              </Column>
              <Column field="firmware_sha256" header="Firmware SHA">
                <template #body="slotProps">
                  <code>{{ shortSha(slotProps.data.firmware_sha256) }}</code>
                </template>
              </Column>
            </DataTable>
            <div v-if="!loading && jobs.running.length === 0" class="text-600 mt-2">No running jobs.</div>
          </template>
        </Card>
      </div>

      <div class="col-12 lg:col-6">
        <Card class="jobs-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <span>Pending Queue</span>
              <Tag :value="String(jobs.pending.length)" severity="warning" />
            </div>
          </template>
          <template #content>
            <DataTable
              :value="jobs.pending"
              responsiveLayout="scroll"
              class="p-datatable-sm"
              :rows="8"
              :paginator="jobs.pending.length > 8"
            >
              <Column field="job_id" header="Job ID">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-2">
                    <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                    <Button
                      icon="pi pi-chart-line"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="'Open job progress'"
                      @click="openJobProgress(slotProps.data.job_id)"
                    />
                  </div>
                </template>
              </Column>
              <Column field="job_type" header="Type">
                <template #body="slotProps">
                  <Tag :value="jobTypeLabel(slotProps.data.job_type)" :severity="jobTypeSeverity(slotProps.data.job_type)" />
                </template>
              </Column>
              <Column field="requested_at" header="Queued">
                <template #body="slotProps">
                  {{ formatTimestamp(slotProps.data.requested_at) }}
                </template>
              </Column>
              <Column field="firmware_sha256" header="Firmware SHA">
                <template #body="slotProps">
                  <code>{{ shortSha(slotProps.data.firmware_sha256) }}</code>
                </template>
              </Column>
            </DataTable>
            <div v-if="!loading && jobs.pending.length === 0" class="text-600 mt-2">No pending jobs.</div>
          </template>
        </Card>
      </div>

      <div class="col-12">
        <Card class="jobs-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <span>Recent Outcomes</span>
              <Tag :value="String(recentOutcomes.length)" severity="secondary" />
            </div>
          </template>
          <template #content>
            <DataTable
              :value="recentOutcomes"
              responsiveLayout="scroll"
              class="p-datatable-sm"
              :rows="12"
              paginator
            >
              <Column field="job_id" header="Job ID">
                <template #body="slotProps">
                  <div class="flex align-items-center gap-2">
                    <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                    <Button
                      icon="pi pi-chart-line"
                      class="p-button-sm p-button-text"
                      v-tooltip.top="'Open job progress'"
                      @click="openJobProgress(slotProps.data.job_id)"
                    />
                  </div>
                </template>
              </Column>
              <Column field="status" header="Status">
                <template #body="slotProps">
                  <Tag :value="slotProps.data.status" :severity="statusSeverity(slotProps.data.status)" />
                </template>
              </Column>
              <Column field="job_type" header="Type">
                <template #body="slotProps">
                  <Tag :value="jobTypeLabel(slotProps.data.job_type)" :severity="jobTypeSeverity(slotProps.data.job_type)" />
                </template>
              </Column>
              <Column field="finished_at" header="Finished">
                <template #body="slotProps">
                  {{ formatTimestamp(slotProps.data.finished_at) }}
                </template>
              </Column>
              <Column field="firmware_sha256" header="Firmware SHA">
                <template #body="slotProps">
                  <code>{{ shortSha(slotProps.data.firmware_sha256) }}</code>
                </template>
              </Column>
              <Column field="error" header="Error">
                <template #body="slotProps">
                  <span class="text-600">{{ slotProps.data.error || '-' }}</span>
                </template>
              </Column>
            </DataTable>
            <div v-if="!loading && recentOutcomes.length === 0" class="text-600 mt-2">No completed jobs yet.</div>
          </template>
        </Card>
      </div>
    </div>
    <FirmwareJobProgressModal
      :visible="progressDialogVisible"
      :job-id="progressJobId"
      :api-base="apiBase"
      @update:visible="progressDialogVisible = $event"
    />
  </div>
</template>

<script>
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';

export default {
  name: 'FirmwareScanQueue',
  components: {
    FirmwareJobProgressModal
  },
  data() {
    const base = (import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
    return {
      apiBase: base,
      loading: false,
      error: null,
      statusNote: null,
      lastUpdated: null,
      jobs: {
        pending: [],
        running: [],
        done: [],
        failed: []
      },
      actionLoading: {
        poll: false,
        validate: false
      },
      progressDialogVisible: false,
      progressJobId: ''
    };
  },
  computed: {
    recentOutcomes() {
      return [...this.jobs.failed, ...this.jobs.done]
        .sort((a, b) => String(b.finished_at || '').localeCompare(String(a.finished_at || '')))
        .slice(0, 50);
    },
    queueStats() {
      const pending = this.jobs.pending.length;
      const running = this.jobs.running.length;
      const done = this.jobs.done.length;
      const failed = this.jobs.failed.length;
      const outstanding = pending + running;
      const finished = done + failed;
      const successRate = finished > 0 ? ((done / finished) * 100).toFixed(1) : '0.0';
      return [
        { label: 'Outstanding', value: outstanding },
        { label: 'Running', value: running },
        { label: 'Pending', value: pending },
        { label: 'Completed', value: done },
        { label: 'Failed', value: failed },
        { label: 'Success Rate', value: `${successRate}%` }
      ];
    }
  },
  methods: {
    async refreshQueue() {
      this.loading = true;
      this.error = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs`);
        if (!response.ok) {
          throw new Error(`Queue request failed (${response.status})`);
        }
        const payload = await response.json();
        this.jobs = {
          pending: Array.isArray(payload.pending) ? payload.pending : [],
          running: Array.isArray(payload.running) ? payload.running : [],
          done: Array.isArray(payload.done) ? payload.done : [],
          failed: Array.isArray(payload.failed) ? payload.failed : []
        };
        this.lastUpdated = new Date().toISOString();
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load scan queue';
      } finally {
        this.loading = false;
      }
    },
    async enqueuePollSource() {
      this.actionLoading.poll = true;
      this.error = null;
      this.statusNote = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs/poll-now`, { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Poll enqueue failed (${response.status})`);
        }
        this.statusNote = 'Source polling job queued.';
        await this.refreshQueue();
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to enqueue poll job';
      } finally {
        this.actionLoading.poll = false;
      }
    },
    async enqueueValidateConformance() {
      this.actionLoading.validate = true;
      this.error = null;
      this.statusNote = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs/validate-conformance`, { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Validate enqueue failed (${response.status})`);
        }
        this.statusNote = 'Conformance validation job queued.';
        await this.refreshQueue();
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to enqueue validation job';
      } finally {
        this.actionLoading.validate = false;
      }
    },
    formatTimestamp(value) {
      if (!value) return '-';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    shortSha(value) {
      const text = String(value || '').trim();
      if (!text) return '-';
      return text.length > 14 ? `${text.slice(0, 6)}...${text.slice(-6)}` : text;
    },
    statusSeverity(status) {
      const key = String(status || '').toLowerCase();
      if (key === 'done') return 'success';
      if (key === 'failed') return 'danger';
      if (key === 'running') return 'info';
      return 'warning';
    },
    jobTypeSeverity(jobType) {
      const key = String(jobType || '').toLowerCase();
      if (key === 'analyze') return 'info';
      if (key === 'rerun') return 'warning';
      if (key === 'poll') return 'secondary';
      if (key === 'validate_conformance') return 'success';
      return 'secondary';
    },
    jobTypeLabel(jobType) {
      const key = String(jobType || '').toLowerCase();
      if (key === 'validate_conformance') return 'validate';
      return key || 'unknown';
    },
    openJobProgress(jobId) {
      const id = String(jobId || '').trim();
      if (!id) return;
      this.progressJobId = id;
      this.progressDialogVisible = true;
    }
  },
  mounted() {
    this.refreshQueue();
  }
};
</script>

<style scoped>
.firmware-queue-page .queue-header-card,
.firmware-queue-page .jobs-card {
  border-radius: 12px;
}

.firmware-queue-page .stat-card {
  min-height: 78px;
  padding: 0.7rem 0.85rem;
}

.firmware-queue-page .stat-label {
  color: #6b7280;
  font-size: 0.7rem;
  line-height: 1.1;
}

.firmware-queue-page .stat-value {
  color: #111827;
  font-size: 1.24rem;
  font-weight: 600;
  margin-top: 0.32rem;
  line-height: 1.2;
}
</style>
