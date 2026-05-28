<template>
  <div class="pipeline-stage-timeline">
    <div v-if="stageRows.length === 0" class="flex flex-column align-items-center justify-content-center p-4 text-500">
      <i class="pi pi-info-circle text-3xl mb-2"></i>
      <span>{{ emptyMessage }}</span>
    </div>

    <div v-else>
      <div class="flex align-items-center justify-content-between mb-3">
        <span class="text-sm text-600">{{ stagesCompleteCount }} / {{ stageRows.length }} resolved</span>
        <div class="flex align-items-center gap-2">
          <span v-if="dag" class="text-xs text-500">View:</span>
          <Button
            v-if="dag"
            :label="viewMode === 'timeline' ? 'Timeline' : 'DAG'"
            :icon="viewMode === 'timeline' ? 'pi pi-sitemap' : 'pi pi-list'"
            size="small"
            text
            @click="toggleViewMode"
            v-tooltip.top="viewMode === 'timeline' ? 'Switch to DAG dependency graph' : 'Switch to checklist timeline'"
          />
          <span class="text-sm text-500">{{ totalPipelineDuration }}</span>
        </div>
      </div>
      <div class="stage-progress mb-3">
        <div class="stage-progress-fill" :style="{ width: stagesPercent + '%' }"></div>
      </div>

      <!-- DAG dependency graph view -->
      <div v-if="dag && viewMode === 'dag'" class="mb-3">
        <PipelineDagView :dag="dag" :phase-ii-sections="phaseIiSections" />
        <div class="text-xs text-500 mt-2 flex flex-wrap align-items-center gap-3">
          <span class="cl-legend"><span class="cl-badge cl-badge-success">PASSED</span> Passed</span>
          <span class="cl-legend"><span class="cl-badge cl-badge-warning">PENDING</span> Pending</span>
          <span class="cl-legend"><span class="cl-badge cl-badge-secondary">SKIPPED</span> Skipped</span>
          <span class="cl-legend"><span class="cl-badge cl-badge-danger">ISSUE</span> Failed</span>
          <span class="cl-legend"><span class="cl-badge cl-badge-info">REVIEW</span> Needs review</span>
        </div>
      </div>

      <div v-if="!dag || viewMode === 'timeline'" class="text-xs mb-3 flex flex-wrap align-items-center gap-3">
        <span class="cl-tally"><span class="cl-dot cl-dot-success"></span> Passed <strong>{{ stageStatusCounts.passed }}</strong></span>
        <span class="cl-tally"><span class="cl-dot cl-dot-secondary"></span> Skipped <strong>{{ stageStatusCounts.skipped }}</strong></span>
        <span class="cl-tally"><span class="cl-dot cl-dot-warning"></span> Pending <strong>{{ stageStatusCounts.pending }}</strong></span>
        <span class="cl-tally"><span class="cl-dot cl-dot-info"></span> Needs review <strong>{{ stageStatusCounts.review }}</strong></span>
        <span class="cl-tally"><span class="cl-dot cl-dot-danger"></span> Issues <strong>{{ stageStatusCounts.issue }}</strong></span>
      </div>

      <div class="text-xs text-500 mb-3 flex flex-wrap align-items-center gap-3">
        <span class="cl-legend"><span class="cl-badge cl-badge-success">PASSED</span> Passed / OK</span>
        <span class="cl-legend"><span class="cl-badge cl-badge-warning">PENDING</span> Not checked yet</span>
        <span class="cl-legend"><span class="cl-badge cl-badge-secondary">SKIPPED</span> Not applicable</span>
        <span class="cl-legend"><span class="cl-badge cl-badge-danger">ISSUE</span> Confirmed problem</span>
        <span class="cl-legend"><span class="cl-badge cl-badge-info">NEEDS REVIEW</span> Needs human review</span>
      </div>

      <div v-if="!dag || viewMode === 'timeline'" class="stage-timeline">
        <div v-for="(stage, idx) in stageRows" :key="stage.name" class="stage-node" :class="{ 'stage-last': idx === stageRows.length - 1 }">
          <div class="stage-dot" :class="'stage-dot-' + stageSeverity(stage.status)"></div>
          <div v-if="idx < stageRows.length - 1" class="stage-line"></div>
          <div class="stage-body">
            <div class="flex align-items-center justify-content-between gap-2 stage-summary" @click="toggleNode('stage-' + stage.name)">
              <div class="flex align-items-center gap-1">
                <i class="pi text-xs stage-chevron" :class="isExpanded('stage-' + stage.name) ? 'pi-chevron-down' : 'pi-chevron-right'" />
                <span class="font-medium text-sm">{{ stage.label }}</span>
                <Tag :value="stageStatusLabel(stage.status)" :severity="stageSeverity(stage.status)" class="ml-1" />
              </div>
              <span class="text-xs text-500">{{ stage.duration }}</span>
            </div>
            <div v-if="stage.error && !isExpanded('stage-' + stage.name)" class="stage-error mt-1">
              <i class="pi pi-exclamation-triangle text-xs mr-1"></i>
              <span class="text-xs">{{ stage.error }}</span>
            </div>
            <div v-if="isExpanded('stage-' + stage.name)" class="stage-expanded mt-2">
              <div class="stage-meta text-xs text-500 mb-3 flex flex-wrap gap-x-3 gap-y-1">
                <span><strong>Status:</strong> {{ stage.status }}</span>
                <span><strong>Duration:</strong> {{ stage.duration }}</span>
                <span v-if="stage.started_at"><strong>Started:</strong> {{ formatTimestamp(stage.started_at) }}</span>
                <span v-if="stage.ended_at"><strong>Ended:</strong> {{ formatTimestamp(stage.ended_at) }}</span>
              </div>
              <div v-if="stage.error" class="stage-error mb-2">
                <i class="pi pi-exclamation-triangle text-xs mr-1"></i>
                <span class="text-xs">{{ stage.error }}</span>
              </div>

              <div v-if="stageSections(stage.name).length > 0" class="checklist-grid">
                <div v-for="sec in stageSections(stage.name)" :key="sec.id" class="checklist-item" :class="'cl-' + checklistStatus(sec.id)">
                  <div class="cl-header">
                    <span class="cl-name">{{ sec.name }}</span>
                    <i :class="checklistIcon(sec.id)" :style="{ color: checklistIconColor(sec.id), fontSize: '1.3rem' }" v-tooltip.top="checklistIconTooltip(sec.id)" />
                  </div>
                  <div class="cl-outcome">{{ sec.outcome }}</div>
                  <Button v-if="showTranscriptButton && sectionHasTranscript(sec.id)" label="View AI transcript" icon="pi pi-comments" text size="small" class="cl-transcript-btn mt-1" @click.stop="$emit('open-transcript', sec.id)" />
                </div>
              </div>
              <div v-else class="text-xs text-400 italic">No checks defined for this stage.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import PipelineDagView from '@/components/PipelineDagView.vue';
import {
  DISPLAY_STAGES,
  stageSeverity,
  stageStatusBadgeLabel,
} from '@/utils/pipelineDisplay';

export default {
  name: 'PipelineStageTimeline',
  components: { PipelineDagView },
  props: {
    stageRows: {
      type: Array,
      required: true
    },
    phaseIiSections: {
      type: Object,
      default: () => ({})
    },
    dag: {
      type: Object,
      default: null
    },
    showTranscriptButton: {
      type: Boolean,
      default: false
    },
    emptyMessage: {
      type: String,
      default: 'No stage data available.'
    }
  },
  emits: ['open-transcript'],
  data() {
    return {
      expandedNodes: {},
      viewMode: 'timeline'
    };
  },
  computed: {
    stageStatusCounts() {
      const counts = { passed: 0, pending: 0, skipped: 0, issue: 0, review: 0 };
      for (const s of this.stageRows) {
        const sev = stageSeverity(s.status);
        if (sev === 'success') counts.passed += 1;
        else if (sev === 'warning') counts.pending += 1;
        else if (sev === 'secondary') counts.skipped += 1;
        else if (sev === 'danger') counts.issue += 1;
        else if (sev === 'info') counts.review += 1;
      }
      return counts;
    },
    stagesCompleteCount() {
      const c = this.stageStatusCounts;
      return c.passed + c.skipped + c.issue + c.review;
    },
    stagesPercent() {
      if (this.stageRows.length === 0) return 0;
      return Math.round((this.stagesCompleteCount / this.stageRows.length) * 100);
    },
    totalPipelineDuration() {
      const rows = this.stageRows;
      if (rows.length === 0) return '';
      const first = rows[0]?.started_at;
      const last = rows[rows.length - 1]?.ended_at;
      if (!first || !last) return '';
      const start = new Date(first);
      const end = new Date(last);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
      const ms = end.getTime() - start.getTime();
      if (ms < 0) return '';
      if (ms < 1000) return `Total: ${ms} ms`;
      return `Total: ${(ms / 1000).toFixed(2)} s`;
    }
  },
  methods: {
    toggleViewMode() {
      this.viewMode = this.viewMode === 'timeline' ? 'dag' : 'timeline';
    },
    toggleNode(key) {
      const next = { ...this.expandedNodes };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      this.expandedNodes = next;
    },
    isExpanded(key) {
      return !!this.expandedNodes[key];
    },
    stageSeverity(status) {
      return stageSeverity(status);
    },
    stageStatusLabel(status) {
      return stageStatusBadgeLabel(status);
    },
    stageSections(displayId) {
      const display = DISPLAY_STAGES.find((d) => d.id === displayId);
      if (!display) return [];
      return display.sections.map((def) => {
        const result = this.phaseIiSections[def.id] || null;
        const status = result ? result.status : 'pending';
        return {
          ...def,
          result,
          status,
          outcome: status === 'pending' ? def.desc : this.checklistOutcome({ id: def.id, runner: result?.runner || 'code' })
        };
      });
    },
    checklistStatus(secId) {
      const r = this.phaseIiSections[secId];
      if (!r) return 'pending';
      return r.status || 'pending';
    },
    checklistIcon(secId) {
      const s = this.checklistStatus(secId);
      if (s === 'success' || s === 'done') return 'pi pi-check-circle';
      if (s === 'failed') return 'pi pi-times-circle';
      if (s === 'skipped') return 'pi pi-minus-circle';
      if (s === 'running') return 'pi pi-spin pi-spinner';
      return 'pi pi-exclamation-triangle';
    },
    checklistIconColor(secId) {
      const s = this.checklistStatus(secId);
      if (s === 'success' || s === 'done') return '#22c55e';
      if (s === 'failed') return '#ef4444';
      if (s === 'skipped') return '#9ca3af';
      if (s === 'running') return '#3b82f6';
      return '#eab308';
    },
    checklistIconTooltip(secId) {
      return stageStatusBadgeLabel(this.checklistStatus(secId));
    },
    sectionHasTranscript(secId) {
      const r = this.phaseIiSections[secId];
      const path = r?.output?.transcript_path;
      return typeof path === 'string' && path.length > 0;
    },
    checklistOutcome(sec) {
      const r = this.phaseIiSections[sec.id];
      if (!r) {
        if (sec.runner === 'llm') return 'Not evaluated — LLM analysis not yet configured';
        if (sec.runner === 'hybrid') return 'Not evaluated — hybrid analysis pending';
        return 'Not evaluated — run analysis to check';
      }
      if (r.status === 'skipped') {
        if (sec.runner === 'llm' || sec.runner === 'hybrid') {
          if (r.error && r.error !== 'Skipped: LLM section (code_only mode)') {
            return String(r.error).substring(0, 160);
          }
          return 'Deferred — LLM analysis not yet configured';
        }
        // Show the specific reason from the dispatcher or section output
        const detail = r.output?.detail || r.output?.reason;
        if (detail) return String(detail).substring(0, 160);
        if (r.error && !r.error.startsWith('Skipped:')) return String(r.error).substring(0, 160);
        if (r.error) {
          // Strip "Skipped: " prefix to show just the reason
          const reason = String(r.error).replace(/^Skipped:\s*/, '');
          return `Skipped — ${reason}`;
        }
        return 'Skipped — dependency not met';
      }
      if (r.status === 'failed') {
        const detail = r.output?.detail || r.output?.verdict;
        if (detail) return String(detail).substring(0, 160);
        return r.error ? r.error.substring(0, 120) : 'Check failed';
      }
      if (r.status === 'needs_review') {
        const detail = r.output?.detail || r.output?.verdict;
        if (detail) return String(detail).substring(0, 160);
        return 'Needs review — analysis surfaced an inconclusive signal';
      }
      if (r.status === 'success' || r.status === 'done') {
        const output = r.output || {};
        const keys = Object.keys(output).filter((k) => !k.startsWith('_')).slice(0, 3);
        if (keys.length === 0) return 'Passed';
        return `Verified: ${keys.join(', ')}`;
      }
      if (r.status === 'running') return 'In progress...';
      return 'Not evaluated';
    },
    formatTimestamp(value) {
      if (!value) return '';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    }
  }
};
</script>

<style scoped>
/* ---- Stage Progress Bar ---- */
.stage-progress {
  height: 4px;
  border-radius: 2px;
  background: #e5e7eb;
  overflow: hidden;
}
.stage-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: #22c55e;
  transition: width 0.3s ease;
}

/* ---- Status tallies and legend pills ---- */
.cl-tally {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #334155;
}
.cl-tally strong {
  color: #0f172a;
  font-weight: 700;
  margin-left: 0.15rem;
}
.cl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.cl-dot-success { background: #22c55e; }
.cl-dot-danger { background: #ef4444; }
.cl-dot-info { background: #3b82f6; }
.cl-dot-warning { background: #f59e0b; }
.cl-dot-secondary { background: #9ca3af; }

.cl-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  margin-right: 0.35rem;
  line-height: 1.4;
}
.cl-badge-success { background: #dcfce7; color: #15803d; }
.cl-badge-danger { background: #fee2e2; color: #b91c1c; }
.cl-badge-info { background: #dbeafe; color: #1d4ed8; }
.cl-badge-warning { background: #fef9c3; color: #a16207; }
.cl-badge-secondary { background: #f3f4f6; color: #4b5563; }
.cl-legend {
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

/* ---- Stage Timeline ---- */
.stage-timeline {
  position: relative;
}
.stage-node {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  position: relative;
  padding-bottom: 0.7rem;
}
.stage-node.stage-last {
  padding-bottom: 0;
}
.stage-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 3px;
  flex-shrink: 0;
  z-index: 1;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px currentColor;
}
.stage-line {
  position: absolute;
  left: 5px;
  top: 18px;
  width: 2px;
  height: calc(100% - 8px);
  background: #e5e7eb;
  z-index: 0;
}
.stage-body {
  flex: 1;
  min-width: 0;
}
.stage-dot-success { color: #22c55e; background: #22c55e; }
.stage-dot-danger { color: #ef4444; background: #ef4444; }
.stage-dot-info { color: #3b82f6; background: #3b82f6; }
.stage-dot-warning { color: #f59e0b; background: #f59e0b; }
.stage-dot-secondary { color: #9ca3af; background: #9ca3af; }

/* Expand/collapse */
.stage-chevron {
  flex-shrink: 0;
  font-size: 0.7rem !important;
  color: #6b7280;
  transition: transform 0.15s ease;
}
.stage-summary {
  cursor: pointer;
  user-select: none;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.1s ease;
}
.stage-summary:hover {
  background: #f3f4f6;
}
.stage-expanded {
  margin-top: 8px;
}
.stage-meta {
  opacity: 0.85;
  line-height: 1.6;
  display: flex;
  flex-wrap: wrap;
  column-gap: 1.5rem;
  row-gap: 0.25rem;
}
.stage-meta > span {
  white-space: nowrap;
}
.stage-meta > span strong {
  margin-right: 0.35rem;
}
.stage-error {
  padding: 0.35rem 0.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #991b1b;
}
.stage-expanded .checklist-grid {
  margin-top: 4px;
}

/* ---- Checklist cards ---- */
.checklist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.checklist-item {
  border: 1px solid var(--surface-border, #dee2e6);
  border-radius: 10px;
  padding: 20px 22px;
  background: #fff;
}
.checklist-item.cl-success,
.checklist-item.cl-done {
  border-left: 4px solid #22c55e;
}
.checklist-item.cl-failed,
.checklist-item.cl-issue {
  border-left: 4px solid #ef4444;
  background: #fef2f2;
}
.checklist-item.cl-needs_review,
.checklist-item.cl-ai_review,
.checklist-item.cl-review {
  border-left: 4px solid #3b82f6;
  background: #eff6ff;
}
.checklist-item.cl-running {
  border-left: 4px solid #3b82f6;
}
.checklist-item.cl-skipped,
.checklist-item.cl-not_applicable {
  opacity: 0.6;
  border-left: 4px solid #9ca3af;
}
.checklist-item.cl-pending,
.checklist-item.cl-not_checked {
  border-left: 4px solid #f59e0b;
  opacity: 0.85;
}
.cl-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
}
.cl-name {
  font-size: 0.78rem;
  color: var(--text-color-secondary, #6c757d);
  margin-bottom: 0;
  line-height: 1.3;
}
.cl-outcome {
  font-size: 0.82rem;
  color: var(--text-color-secondary, #6c757d);
  line-height: 1.4;
  border-top: 1px solid var(--surface-ground, #f8f9fa);
  padding-top: 8px;
}
</style>
