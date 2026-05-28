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
          <span class="text-xl font-bold">{{ modalTitle }}</span>
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
            <div class="col-12 md:col-4 border-right-1 surface-border" v-if="!isConformanceJob && !isPollJob">
              <div class="text-500 font-medium mb-1">FIRMWARE SHA-256</div>
              <code class="text-900">{{ shortSha(job.firmware_sha256) }}</code>
            </div>
            <div class="col-12 md:col-4 border-right-1 surface-border pl-2 md:pl-4" v-else-if="isConformanceJob">
              <div class="text-500 font-medium mb-1">TARGET NETWORK</div>
              <div class="text-900 font-bold uppercase">{{ job.source_network || 'Default' }}</div>
            </div>
            <div class="col-12 md:col-4 border-right-1 surface-border pl-2 md:pl-4" v-else-if="isPollJob">
              <div class="text-500 font-medium mb-1">SOURCE REPO</div>
              <div class="text-900 font-bold">Matter DCL Firmware</div>
            </div>
            <div class="col-6 md:col-4 border-right-1 surface-border pl-2 md:pl-4">
              <div class="text-500 font-medium mb-1">JOB TYPE</div>
              <div class="text-900 font-bold uppercase">{{ displayValue(job.job_type) }}</div>
            </div>
            <div class="col-6 md:col-4 pl-2 md:pl-4" v-if="!isConformanceJob && !isPollJob">
              <div class="text-500 font-medium mb-1">PIPELINE RUN</div>
              <div class="text-900 font-bold">{{ pipeline.run_id || 'Generating...' }}</div>
            </div>
            <div class="col-6 md:col-4 pl-2 md:pl-4" v-else>
              <div class="text-500 font-medium mb-1">REQUESTED BY</div>
              <div class="text-900 font-bold uppercase">{{ job.requested_by || '-' }}</div>
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

        <div v-if="isConformanceJob && pipeline.statistics">
          <div class="text-700 font-bold mb-3 ml-1">Conformance Statistics</div>
          <div class="grid">
            <div class="col-12 md:col-3">
              <div class="card surface-card border-1 surface-border p-3 text-center">
                <div class="text-500 font-medium mb-2">Total Records</div>
                <div class="text-900 font-bold text-2xl">{{ pipeline.statistics.total }}</div>
              </div>
            </div>
            <div class="col-12 md:col-3">
              <div class="card surface-card border-1 surface-border p-3 text-center">
                <div class="text-green-500 font-medium mb-2">Passed</div>
                <div class="text-900 font-bold text-2xl">{{ pipeline.statistics.pass }}</div>
              </div>
            </div>
            <div class="col-12 md:col-3">
              <div class="card surface-card border-1 surface-border p-3 text-center">
                <div class="text-red-500 font-medium mb-2">Violations</div>
                <div class="text-900 font-bold text-2xl">{{ pipeline.statistics.violation }}</div>
              </div>
            </div>
            <div class="col-12 md:col-3">
              <div class="card surface-card border-1 surface-border p-3 text-center">
                <div class="text-blue-500 font-medium mb-2">Processed</div>
                <div class="text-900 font-bold text-2xl">{{ pipeline.statistics.processed }}</div>
              </div>
            </div>
          </div>
        </div>

        <PipelineStageTimeline
          v-if="!isConformanceJob && !isPollJob"
          :stage-rows="displayStageRows"
          :phase-ii-sections="phaseIiSections"
          :dag="dagData"
          empty-message="Waiting for pipeline stages..."
        />

        <!-- Live AI Activity (collapsible) -->
        <div v-if="!isConformanceJob && !isPollJob" class="mt-4">
          <div class="flex align-items-center justify-content-between mb-2">
            <div class="flex align-items-center gap-2">
              <span class="text-700 font-bold">Live AI Activity</span>
              <Tag
                :value="aiStreamSummary"
                :severity="aiStreamConnected ? 'success' : 'secondary'"
                class="text-xs"
              />
              <span v-if="aiStreamConnected" class="text-500 text-xs">
                <i class="pi pi-circle-fill text-green-500" style="font-size:0.5rem"></i>
                streaming
              </span>
            </div>
            <Button
              :label="aiStreamExpanded ? 'Hide Stream' : 'Show Stream'"
              :icon="aiStreamExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
              class="p-button-text p-button-sm"
              @click="aiStreamExpanded = !aiStreamExpanded"
            />
          </div>
          <div v-if="aiStreamExpanded" class="ai-stream" ref="aiStreamScroller">
            <div v-if="aiEvents.length === 0" class="ai-stream-empty">
              No AI activity yet. The pane fills as the pipeline calls models and tools.
            </div>
            <div
              v-for="(ev, idx) in aiEvents"
              :key="idx"
              class="ai-event"
              :class="'ai-event-'+aiEventCategory(ev.event || ev.kind)"
            >
              <i :class="aiEventIcon(ev.event || ev.kind) + ' ai-event-icon'" />
              <span class="ai-event-time">{{ formatStreamTime(ev.timestamp || ev.ts) }}</span>
              <span class="ai-event-source" v-if="ev.source || ev.tool_name || ev.model">[{{ ev.source || ev.tool_name || ev.model }}]</span>
              <span class="ai-event-message">{{ buildAiEventMessage(ev) }}</span>
            </div>
          </div>
          <div v-else class="text-500 text-sm ml-2 p-2">
            {{ aiEvents.length }} event{{ aiEvents.length === 1 ? '' : 's' }} recorded.
            Click "Show Stream" to watch the AI work in real time.
          </div>
        </div>
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
import { DISPLAY_STAGES, aggregateDisplayStatus, stageSeverity } from '@/utils/pipelineDisplay';
import PipelineStageTimeline from '@/components/PipelineStageTimeline.vue';

export default {
  name: 'FirmwareJobProgressModal',
  components: { PipelineStageTimeline },
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
      aiStreamExpanded: true,
      aiStreamConnected: false,
      aiEvents: [],
      aiEventSource: null,
      aiStreamRetryHandle: null,
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
    phaseIiSections() {
      const phaseIi = this.payload.phase_ii;
      return phaseIi ? (phaseIi.sections || {}) : {};
    },
    dagData() {
      const phaseIi = this.payload.phase_ii;
      return phaseIi ? (phaseIi.dag || null) : null;
    },
    displayStageRows() {
      const backendStages = Array.isArray(this.pipeline.stages) ? this.pipeline.stages : [];
      const byName = new Map(backendStages.map((s) => [String(s?.name || ''), s]));
      const phaseIiResults = this.phaseIiSections;
      return DISPLAY_STAGES.map((display) => {
        const linked = display.backend.map((name) => byName.get(name)).filter(Boolean);
        const starts = linked.map((s) => s?.started_at).filter(Boolean);
        const ends = linked.map((s) => s?.ended_at).filter(Boolean);
        for (const sec of display.sections || []) {
          const piResult = phaseIiResults[sec.id];
          if (piResult) {
            if (piResult.started_at) starts.push(piResult.started_at);
            if (piResult.ended_at) ends.push(piResult.ended_at);
          }
        }
        starts.sort();
        ends.sort();
        const started_at = starts.length ? starts[0] : null;
        const ended_at = ends.length ? ends[ends.length - 1] : null;
        const error = linked.map((s) => s?.details?.error || s?.error).filter(Boolean).join('; ') || null;
        const backendDurationMs = linked.length === 1 && linked[0]?.duration_ms != null ? Number(linked[0].duration_ms) : null;
        const hasPhaseIiTiming = (display.sections || []).some((s) => {
          const r = phaseIiResults[s.id];
          return r && (r.started_at || r.ended_at);
        });
        return {
          id: display.id,
          name: display.id,
          label: display.label,
          status: aggregateDisplayStatus(display, linked, this.phaseIiSections),
          started_at,
          ended_at,
          duration: this.displayDuration(started_at, ended_at, hasPhaseIiTiming ? null : backendDurationMs),
          error
        };
      });
    },
    aiStreamSummary() {
      const n = this.aiEvents.length;
      if (!n) return this.aiStreamConnected ? 'Listening...' : 'Idle';
      const tail = this.aiEvents[n - 1];
      const kind = tail.event || tail.kind || 'unknown';
      return `${n} event${n === 1 ? '' : 's'} · last: ${kind}`;
    },
    stateLabel() {
      return String(this.summary.state_label || 'Unknown');
    },
    isConformanceJob() {
      return this.job.job_type === 'validate_conformance';
    },
    isPollJob() {
      return this.job.job_type === 'poll';
    },
    modalTitle() {
      if (this.isConformanceJob) return 'Conformance Validation';
      if (this.isPollJob) return 'Source Polling';
      return 'Analysis Progress';
    }
  },
  watch: {
    visible: {
      immediate: true,
      handler(next) {
        if (next) {
          this.loadProgress();
          this.startPolling();
          this.openAiStream();
        } else {
          this.stopPolling();
          this.closeAiStream();
        }
      }
    },
    jobId() {
      if (this.visible) {
        this.loadProgress();
        this.closeAiStream();
        this.aiEvents = [];
        this.openAiStream();
      }
    }
  },
  beforeUnmount() {
    this.stopPolling();
    this.closeAiStream();
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
    stateSeverity(status) {
      return stageSeverity(status);
    },
    formatTimestamp(value) {
      if (!value) return '';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    displayDuration(startedAt, endedAt, durationMs) {
      if (durationMs != null && Number.isFinite(durationMs) && durationMs >= 0) {
        if (durationMs < 1) return `${(durationMs * 1000).toFixed(0)} μs`;
        if (durationMs < 10) return `${durationMs.toFixed(2)} ms`;
        if (durationMs < 1000) return `${durationMs.toFixed(0)} ms`;
        return `${(durationMs / 1000).toFixed(2)} s`;
      }
      const start = startedAt ? new Date(startedAt) : null;
      const end = endedAt ? new Date(endedAt) : null;
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-';
      const ms = end.getTime() - start.getTime();
      if (ms < 0) return '-';
      if (ms < 1000) return `${ms} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    },
    openAiStream() {
      const id = String(this.jobId || '').trim();
      if (!id) return;
      if (typeof window === 'undefined' || typeof window.EventSource !== 'function') return;
      this.closeAiStream();
      try {
        const url = `${this.apiBase}/api/v1/jobs/${encodeURIComponent(id)}/events`;
        const es = new window.EventSource(url);
        this.aiEventSource = es;
        es.addEventListener('open', () => { this.aiStreamConnected = true; });
        es.addEventListener('agent_event', (msg) => {
          try {
            const ev = JSON.parse(msg.data);
            this.pushAiEvent(ev);
          } catch (_e) { /* ignore malformed line */ }
        });
        es.addEventListener('done', () => {
          this.aiStreamConnected = false;
          this.closeAiStream();
        });
        es.addEventListener('error', () => {
          this.aiStreamConnected = false;
        });
      } catch (_err) {
        this.aiStreamConnected = false;
      }
    },
    closeAiStream() {
      if (this.aiEventSource) {
        try { this.aiEventSource.close(); } catch (_e) { /* ignore */ }
        this.aiEventSource = null;
      }
      if (this.aiStreamRetryHandle) {
        clearTimeout(this.aiStreamRetryHandle);
        this.aiStreamRetryHandle = null;
      }
      this.aiStreamConnected = false;
    },
    pushAiEvent(ev) {
      const MAX_EVENTS = 500;
      this.aiEvents.push(ev);
      if (this.aiEvents.length > MAX_EVENTS) {
        this.aiEvents.splice(0, this.aiEvents.length - MAX_EVENTS);
      }
      this.$nextTick(() => {
        const el = this.$refs.aiStreamScroller;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    formatStreamTime(iso) {
      if (!iso) return '';
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return '';
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      const ss = String(dt.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    },
    aiEventCategory(kind) {
      if (!kind) return 'info';
      if (kind.startsWith('llm_') || kind === 'assistant_turn') return 'llm';
      if (kind.startsWith('tool_')) return 'tool';
      if (kind.startsWith('agent_') || kind.startsWith('run_')) return 'agent';
      if (kind.startsWith('sidekick_')) return 'sidekick';
      return 'info';
    },
    buildAiEventMessage(ev) {
      if (ev.message) return ev.message;
      const k = ev.event || ev.kind || 'unknown';
      if (k === 'tool_call') {
        let args = '';
        try { args = JSON.stringify(ev.tool_args); } catch(_e) {}
        return `Called ${ev.tool_name} with ${args.length < 50 ? args : args.substring(0, 50) + '...'}`;
      }
      if (k === 'tool_result') return `Tool ${ev.tool_name} finished in ${ev.tool_duration_ms || '?'} ms`;
      if (k === 'llm_call') return `Calling ${ev.model || 'LLM'}`;
      if (k === 'llm_response') return `LLM response received (${ev.output_tokens || '?'} tokens)`;
      if (k === 'assistant_turn') return 'Thinking...';
      if (k === 'run_started') return `Agent started on network ${ev.active_network || 'default'}`;
      return k.replace(/_/g, ' ');
    },
    aiEventIcon(kind) {
      const cat = this.aiEventCategory(kind);
      const finished = kind.endsWith('_finished') || kind.endsWith('_done');
      const failed = kind.endsWith('_failed') || kind.endsWith('_timeout') || kind.endsWith('_empty');
      if (failed) return 'pi pi-times-circle';
      if (cat === 'llm') return finished ? 'pi pi-comment' : 'pi pi-spinner pi-spin';
      if (cat === 'tool') return finished ? 'pi pi-wrench' : 'pi pi-cog pi-spin';
      if (cat === 'agent') return finished ? 'pi pi-flag' : 'pi pi-bolt';
      if (cat === 'sidekick') return finished ? 'pi pi-check' : 'pi pi-search';
      return 'pi pi-info-circle';
    }
  }
};
</script>

<style scoped>
button[data-pd-tooltip] {
  transform: translateZ(0);
}

.job-progress-content .summary-row {
  margin-bottom: 0.45rem;
}

/* ---- Live AI Activity pane ---- */
.ai-stream {
  border: 1px solid var(--surface-border, #dee2e6);
  border-radius: 8px;
  padding: 8px 12px;
  background: #0b1220;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  max-height: 320px;
  overflow-y: auto;
  line-height: 1.55;
}
.ai-stream-empty {
  color: #94a3b8;
  font-style: italic;
  padding: 6px 2px;
}
.ai-event {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 0;
  border-left: 2px solid transparent;
  padding-left: 6px;
}
.ai-event-icon {
  font-size: 0.7rem;
  width: 12px;
  flex-shrink: 0;
}
.ai-event-time {
  color: #64748b;
  flex-shrink: 0;
}
.ai-event-source {
  color: #93c5fd;
  flex-shrink: 0;
}
.ai-event-message {
  color: #e2e8f0;
  word-break: break-word;
  min-width: 0;
}
.ai-event-llm      { border-left-color: #60a5fa; }
.ai-event-llm .ai-event-icon      { color: #60a5fa; }
.ai-event-tool     { border-left-color: #fbbf24; }
.ai-event-tool .ai-event-icon     { color: #fbbf24; }
.ai-event-agent    { border-left-color: #a78bfa; }
.ai-event-agent .ai-event-icon    { color: #a78bfa; }
.ai-event-sidekick { border-left-color: #34d399; }
.ai-event-sidekick .ai-event-icon { color: #34d399; }
.ai-event-info     { border-left-color: #64748b; }
.ai-event-info .ai-event-icon     { color: #94a3b8; }
</style>
