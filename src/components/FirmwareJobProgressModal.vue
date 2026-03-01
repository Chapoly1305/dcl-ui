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
          <i class="pi pi-cog pi-spin text-primary" style="font-size: 1.2rem" v-if="job.status === 'running'"></i>
          <i class="pi pi-check-circle text-success" style="font-size: 1.2rem" v-else-if="job.status === 'done'"></i>
          <i class="pi pi-exclamation-circle text-danger" style="font-size: 1.2rem" v-else-if="job.status === 'failed'"></i>
          <span class="text-xl font-bold">Analysis Progress</span>
          <Tag v-if="job.job_id" :value="`Job: ${shortId(job.job_id)}`" severity="info" />
          <Tag :value="stateLabel" :severity="stateSeverity(job.status)" />
        </div>
        <div class="flex align-items-center gap-2">
          <span class="text-600 text-xs" v-if="lastUpdatedAt">Updated: {{ formatTimestamp(lastUpdatedAt) }}</span>
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
        <div class="surface-ground p-3 border-round mb-4">
          <div class="grid text-sm">
            <div class="col-12 md:col-4 border-right-1 surface-border">
              <div class="text-500 font-medium mb-1">FIRMWARE SHA-256</div>
              <code class="text-900">{{ shortSha(job.firmware_sha256) }}</code>
            </div>
            <div class="col-6 md:col-4 border-right-1 surface-border pl-2 md:pl-4">
              <div class="text-500 font-medium mb-1">JOB TYPE</div>
              <div class="text-900 font-bold uppercase">{{ displayValue(job.job_type) }}</div>
            </div>
            <div class="col-6 md:col-4 pl-2 md:pl-4">
              <div class="text-500 font-medium mb-1">PIPELINE RUN</div>
              <div class="text-900 font-bold">{{ pipeline.run_id || 'Generating...' }}</div>
            </div>
          </div>
        </div>

        <div class="mb-4 px-1">
          <div class="flex align-items-center justify-content-between mb-2">
            <span class="text-700 font-bold">Overall Progress</span>
            <span class="text-primary font-bold text-lg">{{ pipeline.percent_complete }}%</span>
          </div>
          <ProgressBar :value="pipeline.percent_complete" :showValue="false" style="height: 10px" />
          <div class="mt-2 text-600 text-sm italic" v-if="summary.message">
            Current status: {{ summary.message }}
          </div>
        </div>

        <div class="text-700 font-bold mb-2 ml-1">Pipeline Stages</div>
        <DataTable :value="stages" responsiveLayout="scroll" class="p-datatable-sm custom-stages-table border-1 surface-border border-round">
          <Column field="name" header="Stage">
            <template #body="slotProps">
              <span class="font-medium">{{ stageLabel(slotProps.data.name) }}</span>
            </template>
          </Column>
          <Column field="status" header="Status" headerClass="text-center" bodyClass="text-center">
            <template #body="slotProps">
              <Tag :value="statusLabel(slotProps.data.status)" :severity="statusSeverity(slotProps.data.status)" class="w-full" />
            </template>
          </Column>
          <Column field="started_at" header="Started">
            <template #body="slotProps">
              <span class="text-600">{{ displayValue(formatTimestamp(slotProps.data.started_at)) }}</span>
            </template>
          </Column>
          <Column field="ended_at" header="Ended">
            <template #body="slotProps">
              <span class="text-600">{{ displayValue(formatTimestamp(slotProps.data.ended_at)) }}</span>
            </template>
          </Column>
          <Column field="duration_ms" header="Duration" headerClass="text-right" bodyClass="text-right font-mono">
            <template #body="slotProps">
              {{ formatDuration(slotProps.data.duration_ms) }}
            </template>
          </Column>
          <Column field="error" header="Notes/Errors">
            <template #body="slotProps">
              <span class="text-red-500 font-medium" v-if="slotProps.data.error">{{ slotProps.data.error }}</span>
              <span class="text-400" v-else>-</span>
            </template>
          </Column>
        </DataTable>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-content-between align-items-center w-full">
        <div class="text-500 text-xs">
          Automatic polling every 2s
        </div>
        <Button label="Close Window" icon="pi pi-times" class="p-button-outlined p-button-sm" @click="onVisibleChange(false)" />
      </div>
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
        '45_secure_boot_authenticity': '45 Secure Boot',
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
      return `${(ms / 1000).toFixed(2)}s`;
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
.custom-stages-table :deep(.p-datatable-thead > tr > th) {
  background: #f9fafb;
}
</style>
