<template>
  <Dialog
    :visible="visible"
    :modal="true"
    :closable="true"
    :style="{ width: '70rem', maxWidth: '96vw' }"
    @update:visible="onVisibleChange"
  >
    <template #header>
      <div class="flex align-items-center justify-content-between gap-2 flex-wrap w-full">
        <div class="flex align-items-center gap-2 flex-wrap">
          <span>Job Progress</span>
          <Tag v-if="job.job_id" :value="`Job: ${shortId(job.job_id)}`" severity="info" />
          <Tag :value="stateLabel" :severity="stateSeverity(job.status)" />
          <Tag v-if="pipeline.run_id" :value="`Run: ${pipeline.run_id}`" severity="secondary" />
        </div>
        <div class="flex align-items-center gap-2">
          <span class="text-600 text-sm" v-if="lastUpdatedAt">Updated: {{ formatTimestamp(lastUpdatedAt) }}</span>
          <Button
            icon="pi pi-refresh"
            class="p-button-text p-button-sm p-button-rounded"
            :loading="loading"
            v-tooltip.top="'Refresh progress'"
            @click="loadProgress"
          />
        </div>
      </div>
    </template>

    <div class="job-progress-content">
      <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

      <div v-else>
        <div class="grid mb-2">
          <div class="col-12 lg:col-6">
            <div class="summary-row"><strong>Job Type:</strong> {{ displayValue(job.job_type) }}</div>
            <div class="summary-row"><strong>Queued:</strong> {{ displayValue(formatTimestamp(job.requested_at)) }}</div>
            <div class="summary-row"><strong>Started:</strong> {{ displayValue(formatTimestamp(job.started_at)) }}</div>
          </div>
          <div class="col-12 lg:col-6">
            <div class="summary-row"><strong>Finished:</strong> {{ displayValue(formatTimestamp(job.finished_at)) }}</div>
            <div class="summary-row"><strong>Firmware SHA:</strong> <code>{{ shortSha(job.firmware_sha256) }}</code></div>
            <div class="summary-row"><strong>Message:</strong> {{ displayValue(summary.message) }}</div>
          </div>
        </div>

        <div class="mb-3">
          <div class="flex align-items-center justify-content-between mb-2">
            <span class="text-700">Progress</span>
            <span class="text-700">{{ pipeline.percent_complete }}%</span>
          </div>
          <ProgressBar :value="pipeline.percent_complete" />
        </div>

        <DataTable :value="stages" responsiveLayout="scroll" class="p-datatable-sm">
          <Column field="name" header="Stage">
            <template #body="slotProps">
              {{ stageLabel(slotProps.data.name) }}
            </template>
          </Column>
          <Column field="status" header="Status">
            <template #body="slotProps">
              <Tag :value="statusLabel(slotProps.data.status)" :severity="statusSeverity(slotProps.data.status)" />
            </template>
          </Column>
          <Column field="started_at" header="Started">
            <template #body="slotProps">
              {{ displayValue(formatTimestamp(slotProps.data.started_at)) }}
            </template>
          </Column>
          <Column field="ended_at" header="Ended">
            <template #body="slotProps">
              {{ displayValue(formatTimestamp(slotProps.data.ended_at)) }}
            </template>
          </Column>
          <Column field="duration_ms" header="Duration">
            <template #body="slotProps">
              {{ formatDuration(slotProps.data.duration_ms) }}
            </template>
          </Column>
          <Column field="error" header="Error">
            <template #body="slotProps">
              <span class="text-600">{{ displayValue(slotProps.data.error) }}</span>
            </template>
          </Column>
        </DataTable>
      </div>
    </div>

    <template #footer>
      <Button label="Close" icon="pi pi-times" class="p-button-text p-button-sm" @click="onVisibleChange(false)" />
    </template>
  </Dialog>
</template>

<script>
export default {
  name: 'FirmwareJobProgressModal',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    jobId: {
      type: String,
      default: ''
    },
    apiBase: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      error: null,
      lastUpdatedAt: null,
      pollHandle: null,
      payload: {
        job: {},
        pipeline: { run_id: null, current_stage: null, percent_complete: 0, stages: [] },
        summary: { state_label: 'Unknown', message: '' }
      }
    };
  },
  computed: {
    job() {
      return this.payload.job || {};
    },
    pipeline() {
      return this.payload.pipeline || { run_id: null, current_stage: null, percent_complete: 0, stages: [] };
    },
    summary() {
      return this.payload.summary || { state_label: 'Unknown', message: '' };
    },
    stages() {
      return Array.isArray(this.pipeline.stages) ? this.pipeline.stages : [];
    },
    stateLabel() {
      return String(this.summary.state_label || 'Unknown');
    }
  },
  watch: {
    visible: {
      immediate: true,
      handler(next) {
        if (next) {
          this.loadProgress();
          this.startPolling();
        } else {
          this.stopPolling();
        }
      }
    },
    jobId() {
      if (this.visible) {
        this.loadProgress();
      }
    }
  },
  beforeUnmount() {
    this.stopPolling();
  },
  methods: {
    onVisibleChange(next) {
      this.$emit('update:visible', Boolean(next));
    },
    startPolling() {
      this.stopPolling();
      this.pollHandle = setInterval(() => {
        if (!this.visible) return;
        this.loadProgress();
      }, 2000);
    },
    stopPolling() {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
      }
    },
    async loadProgress() {
      const id = String(this.jobId || '').trim();
      if (!id) {
        this.error = 'Missing job ID.';
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs/${encodeURIComponent(id)}/progress`);
        if (!response.ok) {
          throw new Error(`Progress request failed (${response.status})`);
        }
        this.payload = await response.json();
        this.lastUpdatedAt = new Date().toISOString();
        const status = String(this.payload?.job?.status || '').toLowerCase();
        if (status === 'done' || status === 'failed') {
          this.stopPolling();
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load job progress';
      } finally {
        this.loading = false;
      }
    },
    shortId(value) {
      const text = String(value || '').trim();
      if (!text) return '-';
      return text.slice(0, 8);
    },
    shortSha(value) {
      const text = String(value || '').trim();
      if (!text) return '-';
      if (text.length <= 16) return text;
      return `${text.slice(0, 8)}...${text.slice(-8)}`;
    },
    stageLabel(name) {
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
      return map[String(name || '')] || String(name || '-');
    },
    statusLabel(status) {
      const key = String(status || '').toLowerCase();
      if (key === 'done') return 'Done';
      if (key === 'failed') return 'Failed';
      if (key === 'running') return 'Running';
      if (key === 'pending') return 'Pending';
      if (key === 'skipped') return 'Skipped';
      return 'Unknown';
    },
    statusSeverity(status) {
      const key = String(status || '').toLowerCase();
      if (key === 'done') return 'success';
      if (key === 'failed') return 'danger';
      if (key === 'running') return 'info';
      if (key === 'pending') return 'warning';
      if (key === 'skipped') return 'secondary';
      return 'secondary';
    },
    stateSeverity(status) {
      const key = String(status || '').toLowerCase();
      if (key === 'done') return 'success';
      if (key === 'failed') return 'danger';
      if (key === 'running') return 'info';
      if (key === 'pending') return 'warning';
      return 'secondary';
    },
    formatTimestamp(value) {
      if (!value) return '';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    formatDuration(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms < 0) return '-';
      if (ms < 1000) return `${ms} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    }
  }
};
</script>

<style scoped>
.job-progress-content .summary-row {
  margin-bottom: 0.45rem;
}
</style>
