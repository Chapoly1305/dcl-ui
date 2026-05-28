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

        <div v-if="!isConformanceJob && !isPollJob">
          <div class="text-700 font-bold mb-2 ml-1">Pipeline Stages</div>
          <DataTable :value="stages" responsiveLayout="scroll" class="p-datatable-sm custom-stages-table border-1 surface-border border-round">
            <Column field="label" header="Stage">
              <template #body="slotProps">
                <span class="font-medium">{{ slotProps.data.label || slotProps.data.name }}</span>
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
              :class="'ai-event-'+aiEventCategory(ev.kind)"
            >
              <i :class="aiEventIcon(ev.kind) + ' ai-event-icon'" />
              <span class="ai-event-time">{{ formatStreamTime(ev.ts) }}</span>
              <span class="ai-event-source" v-if="ev.source">[{{ ev.source }}]</span>
              <span class="ai-event-message">{{ ev.message || ev.kind }}</span>
            </div>
          </div>
          <div v-else class="text-500 text-sm ml-2 p-2">
            {{ aiEvents.length }} event{{ aiEvents.length === 1 ? '' : 's' }} recorded.
            Click "Show Stream" to watch the AI work in real time.
          </div>
        </div>

        <!-- Phase II DAG Section (collapsible) -->
        <div v-if="hasPhaseIi" class="mt-4">
          <div class="flex align-items-center justify-content-between mb-2">
            <div class="flex align-items-center gap-2">
              <span class="text-700 font-bold">Phase 1 &amp; 2 Details</span>
              <Tag :value="phaseIiSummary" severity="info" class="text-xs" />
            </div>
            <Button
              :label="phaseIiExpanded ? 'Hide Details' : 'Show Details'"
              :icon="phaseIiExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
              class="p-button-text p-button-sm"
              @click="phaseIiExpanded = !phaseIiExpanded"
            />
          </div>
          <div v-if="phaseIiExpanded" class="phase2-dag">
            <div class="phase-divider"><Tag value="Phase 1: Spec Conformance" severity="info" /></div>
            <div v-for="(tier, ti) in phaseIiTiers" :key="'tier-'+ti" class="dag-tier">
              <div v-if="isPhaseBoundary(ti)" class="phase-divider mt-3 mb-1">
                <Tag value="Phase 2: Firmware Analysis" severity="warn" />
              </div>
              <div class="dag-tier-label">
                <Tag :value="'Group '+ti" severity="secondary" class="tier-tag" />
                <span class="text-400 text-xs ml-2">max {{ tier.max_workers }} parallel</span>
              </div>
              <div class="dag-tier-nodes">
                <div
                  v-for="sec in tier.sections"
                  :key="sec.id"
                  class="dag-node"
                  :class="'dag-node-'+sectionStatus(sec.id)"
                  v-tooltip.top="sectionTooltip(sec)"
                >
                  <div class="dag-node-name" style="font-weight:600;font-size:0.8rem;color:var(--text-color)">{{ sec.name }}</div>
                  <Tag
                    :value="sectionStatus(sec.id)"
                    :severity="sectionStatusSeverity(sec.id)"
                    class="dag-node-tag"
                  />
                </div>
              </div>
              <div v-if="ti < phaseIiTiers.length - 1" class="dag-tier-arrow">
                <i class="pi pi-arrow-down text-400" />
                <i class="pi pi-arrow-down text-400" />
                <i class="pi pi-arrow-down text-400" />
              </div>
            </div>
          </div>
          <div v-else class="text-500 text-sm ml-2 p-2">
            {{ phaseIiSummaryDetail }}
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
import {
  stageSeverity as sharedStageSeverity,
  stageStatusFriendlyLabel,
} from '@/utils/pipelineDisplay';

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
      phaseIiExpanded: false,
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
    stages() {
      const all = Array.isArray(this.pipeline.stages) ? this.pipeline.stages : [];
      return all.filter(s => s.visible !== false);
    },
    phaseIi() {
      return this.payload.phase_ii || null;
    },
    hasPhaseIi() {
      return this.phaseIi && this.phaseIi.dag && Array.isArray(this.phaseIi.dag.tiers);
    },
    phaseIiTiers() {
      if (!this.hasPhaseIi) return [];
      return this.phaseIi.dag.tiers;
    },
    phaseIiSections() {
      return this.phaseIi ? (this.phaseIi.sections || {}) : {};
    },
    phaseIiSummary() {
      if (!this.hasPhaseIi) return '';
      const sections = this.phaseIiSections;
      const total = Object.keys(sections).length;
      if (total === 0) return 'Pending';
      const done = Object.values(sections).filter(s => s.status === 'success' || s.status === 'done').length;
      const running = Object.values(sections).filter(s => s.status === 'running').length;
      const failed = Object.values(sections).filter(s => s.status === 'failed').length;
      if (running > 0) return `${done}/${total} done, ${running} running`;
      if (failed > 0) return `${done}/${total} done, ${failed} failed`;
      return `${done}/${total} sections`;
    },
    phaseIiSummaryDetail() {
      if (!this.hasPhaseIi) return '';
      const sections = this.phaseIiSections;
      const statuses = Object.entries(sections).map(([id, s]) => `${id}:${s.status}`).join(', ');
      const pct = this.phaseIi ? this.phaseIi.percent_complete : 0;
      return `${pct}% complete. Sections: ${statuses || 'none yet'}`;
    },
    aiStreamSummary() {
      const n = this.aiEvents.length;
      if (!n) return this.aiStreamConnected ? 'Listening...' : 'Idle';
      const tail = this.aiEvents[n - 1];
      return `${n} event${n === 1 ? '' : 's'} · last: ${tail.kind}`;
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
    statusLabel(status) { return stageStatusFriendlyLabel(status); },
    statusSeverity(status) { return sharedStageSeverity(status); },
    stateSeverity(status) {
      // Job-level state (running / done / failed / pending) — narrower than
      // section status, but use the same severity mapping for consistency.
      return sharedStageSeverity(status);
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
      // Sub-ms stages (e.g. finalize ~60 μs, secure_boot_authenticity ~500 μs)
      // genuinely ran — render them as microseconds so the table doesn't
      // imply they were skipped.
      if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`;
      if (ms < 10) return `${ms.toFixed(2)} ms`;
      if (ms < 1000) return `${ms.toFixed(0)} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    },
    sectionStatus(sectionId) {
      const s = this.phaseIiSections[sectionId];
      return s ? s.status : 'pending';
    },
    sectionStatusSeverity(sectionId) {
      return sharedStageSeverity(this.sectionStatus(sectionId));
    },
    sectionTooltip(sec) {
      const s = this.phaseIiSections[sec.id];
      const status = s ? s.status : 'pending';
      const runner = sec.runner || 'code';
      let tip = `${sec.id}: ${sec.name}\nStatus: ${status}\nRunner: ${runner}`;
      if (s && s.error) tip += `\nError: ${s.error.substring(0, 120)}`;
      return tip;
    },
    isPhaseBoundary(ti) {
      // Phase 2 starts at the first tier where sections have phase=2
      const tier = this.phaseIiTiers[ti];
      if (!tier || !tier.sections || !tier.sections.length) return false;
      const sec = tier.sections[0];
      if (sec.phase === 2) {
        // Only show the divider at the FIRST phase-2 tier
        if (ti === 0) return false;
        const prevTier = this.phaseIiTiers[ti - 1];
        const prevSec = prevTier?.sections?.[0];
        return !prevSec || prevSec.phase !== 2;
      }
      return false;
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
          // Browser will normally auto-retry; we don't manually reopen unless
          // the connection stays dropped — keep handle around so retry uses it.
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
      // Keep a bounded ring buffer so long jobs don't blow up memory.
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
      if (kind.startsWith('llm_')) return 'llm';
      if (kind.startsWith('tool_')) return 'tool';
      if (kind.startsWith('agent_')) return 'agent';
      if (kind.startsWith('sidekick_')) return 'sidekick';
      return 'info';
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
/* Safari: DataTable scroll container creates a stacking context that
   swallows mouseenter on child elements. translateZ(0) forces the button
   onto its own compositing layer so Safari delivers pointer events. */
button[data-pd-tooltip] {
  transform: translateZ(0);
}

.job-progress-content .summary-row {
  margin-bottom: 0.45rem;
}
.custom-stages-table :deep(.p-datatable-thead > tr > th) {
  background: #f9fafb;
}

/* Phase II DAG */
.phase2-dag {
  border: 1px solid var(--surface-border, #dee2e6);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface-ground, #f8f9fa);
  max-height: 500px;
  overflow-y: auto;
}
.dag-tier {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 4px;
}
.dag-tier-label {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}
.tier-tag {
  font-size: 0.8rem;
}
.dag-tier-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.dag-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  border: 2px solid var(--surface-border, #dee2e6);
  background: #fff;
  min-width: 100px;
  max-width: 150px;
  transition: transform 0.15s, box-shadow 0.15s;
  cursor: default;
}
.dag-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.dag-node-name {
  font-size: 0.78rem;
  color: var(--text-color-secondary, #6c757d);
  text-align: center;
  line-height: 1.3;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dag-node-tag {
  transform: scale(0.75);
  transform-origin: center;
  margin-top: 2px;
}
.phase-divider {
  display: flex;
  justify-content: center;
  padding: 2px 0;
}
.dag-tier-arrow {
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 4px 0;
  opacity: 0.5;
}

/* Status-based border colors — aligned with the 5-state palette. */
.dag-node-success,
.dag-node-done           { border-color: #86efac; background: #f0fdf4; } /* green PASSED */
.dag-node-failed,
.dag-node-issue          { border-color: #fca5a5; background: #fef2f2; } /* red ISSUE */
.dag-node-needs_review,
.dag-node-review,
.dag-node-uncertain      { border-color: #93c5fd; background: #eff6ff; } /* blue AI REVIEW */
.dag-node-pending,
.dag-node-not_checked,
.dag-node-running        { border-color: #fcd34d; background: #fffbeb; } /* yellow PENDING */
.dag-node-skipped,
.dag-node-not_applicable { border-color: #dee2e6; background: #f8f9fa; opacity: 0.6; } /* gray SKIPPED */
.dag-node-pending { border-color: var(--surface-d, #dee2e6); background: #fff; }

/* Live AI Activity pane */
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
.ai-event-llm      { border-left-color: #60a5fa; }   /* blue */
.ai-event-llm .ai-event-icon      { color: #60a5fa; }
.ai-event-tool     { border-left-color: #fbbf24; }   /* amber */
.ai-event-tool .ai-event-icon     { color: #fbbf24; }
.ai-event-agent    { border-left-color: #a78bfa; }   /* purple */
.ai-event-agent .ai-event-icon    { color: #a78bfa; }
.ai-event-sidekick { border-left-color: #34d399; }   /* green */
.ai-event-sidekick .ai-event-icon { color: #34d399; }
.ai-event-info     { border-left-color: #64748b; }
.ai-event-info .ai-event-icon     { color: #94a3b8; }
</style>
