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

      <!-- DAG dependency graph view (shares the single status legend below) -->
      <div v-if="dag && viewMode === 'dag'" class="mb-3">
        <PipelineDagView :dag="dag" :phase-ii-sections="phaseIiSections" :backend-stages="backendStages" />
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
                  <div v-if="sectionAlgoChips(sec.id).length > 0" class="cl-algo-chips">
                    <span
                      v-for="(chip, ci) in sectionAlgoChips(sec.id)"
                      :key="`${sec.id}-chip-${ci}`"
                      class="cl-algo-chip"
                      :class="`cl-algo-chip-${chip.kind}`"
                      v-tooltip.top="chip.tooltip"
                    >
                      <span class="cl-algo-chip-label">{{ chip.label }}</span>
                      <span class="cl-algo-chip-value">{{ chip.value }}</span>
                    </span>
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
  displayStagesRef,
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
    // Raw Phase I backend stages keyed by stage name. Used to look up
    // status / details for section cards that mirror a Phase I shuttle
    // (e.g. `capability_recovery`) rather than a Phase II section.
    // Optional — if empty, shuttle cards fall through to "pending".
    backendStages: {
      type: Array,
      default: () => []
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
    backendStageByName() {
      const map = {};
      for (const s of this.backendStages || []) {
        if (s && s.name) map[String(s.name)] = s;
      }
      return map;
    },
    stageSections(displayId) {
      const display = displayStagesRef.value.find((d) => d.id === displayId);
      if (!display) return [];
      const backendMap = this.backendStageByName();
      return display.sections.map((def) => {
        // Phase II section result wins; for Phase-I shuttle cards
        // (e.g. `capability_recovery`) fall back to the backend stage
        // of the same name so the card surfaces its real status
        // instead of orphan "pending".
        const result = this.phaseIiSections[def.id] || null;
        const backend = backendMap[def.id] || null;
        const status = result?.status || backend?.status || 'pending';
        return {
          ...def,
          result,
          backend,
          status,
          outcome: status === 'pending' ? def.desc : this.checklistOutcome({ id: def.id, runner: result?.runner || 'code' })
        };
      });
    },
    checklistStatus(secId) {
      const r = this.phaseIiSections[secId];
      if (r) return r.status || 'pending';
      const backend = this.backendStageByName()[secId];
      if (backend) return backend.status || 'pending';
      return 'pending';
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
    sectionAlgoChips(secId) {
      // Surface identified encryption / signature algorithms as small
      // chips below the section name. Only emit when the section's
      // own output has positively identified the algorithm — never
      // guess. Empty list → template renders nothing.
      const r = this.phaseIiSections[secId];
      const out = r?.output || {};
      const chips = [];
      const pushEnc = (value, tooltip) => {
        if (!value) return;
        chips.push({ kind: 'enc', label: 'Encryption', value: String(value), tooltip: tooltip || '' });
      };
      const pushSig = (value, tooltip) => {
        if (!value) return;
        chips.push({ kind: 'sig', label: 'Signature', value: String(value), tooltip: tooltip || '' });
      };

      if (secId === 'weak_key_enc') {
        // enc_type names the wrapping cipher (X25519 / EC256 / AES-KW);
        // header_encryption_flag is the MCUboot image-key flag (AES-128
        // / AES-256). Both surface only after a successful probe.
        if (out.enc_type) {
          const flag = out.header_encryption_flag ? ` (${out.header_encryption_flag} image key)` : '';
          pushEnc(out.enc_type, `Cipher path actually walked by the weak-key probe${flag}`);
        } else if (out.header_encryption_flag) {
          pushEnc(out.header_encryption_flag, 'Image-key flag from MCUboot header');
        }
      } else if (secId === 'weak_key_ota') {
        pushSig(out.algorithm, 'Signature algorithm reported by the OTA authenticity probe');
      } else if (secId === 'secure_boot') {
        // Phase-I-covered: full secure-boot payload sits under `secure_boot`.
        const sb = out.secure_boot || {};
        pushSig(sb.algorithm, 'Signature algorithm identified in the OTA secure-boot TLV');
        const det = sb.details || {};
        if (det.image_encrypted === true || det.header_flag_encrypted === true) {
          pushEnc('encrypted', 'Container flag says the firmware payload is encrypted');
        }
      } else if (secId === 'entropy') {
        // Prefer the actual cipher identified by weak_key_enc (e.g.
        // EC256 with AES-128 image key) over "high-entropy". Entropy
        // is the *last-resort* basis — only show it when the section
        // had nothing better to go on.
        if (out.encrypted === true) {
          const basis = out.encryption_decision_basis;
          if (basis === 'cipher_decoded' && out.cipher) {
            const envelope = out.key_envelope ? ` (${out.key_envelope} image key)` : '';
            pushEnc(out.cipher, `Cipher decoded from the encryption TLV${envelope}`);
          } else if (basis === 'container_flag_true') {
            pushEnc('encrypted', 'Chipset container flag confirms the payload is encrypted');
          } else {
            pushEnc('high-entropy', `Global entropy ${out.entropy_global ?? '?'} ≥ threshold ${out.threshold ?? '?'} — no cipher identification available`);
          }
        }
      }
      return chips;
    },
    checklistOutcome(sec) {
      const r = this.phaseIiSections[sec.id];
      if (!r) {
        // Phase I shuttle fallback — no Phase II result, but if the
        // section ID matches a backend stage we can still render a
        // meaningful outcome from that stage's status + details.
        const backend = this.backendStageByName()[sec.id];
        if (backend) {
          const sbStatus = String(backend.status || '').toLowerCase();
          const det = backend.details || {};
          if (sbStatus === 'skipped') {
            // Surface the most informative bit from details when we can.
            // capability_recovery: all counts == 0 → "no evidence found".
            if (
              det.endpoint_count === 0 &&
              det.cluster_count === 0 &&
              det.attribute_count === 0 &&
              det.default_count === 0
            ) {
              return 'Skipped — no capability evidence to normalize';
            }
            if (det.skip_reason) return `Skipped — ${String(det.skip_reason)}`;
            return 'Skipped';
          }
          if (sbStatus === 'failed') {
            return det.error ? String(det.error).substring(0, 160) : 'Failed';
          }
          if (sbStatus === 'needs_review') {
            if (det.unsupported_reason) return `Needs review — ${String(det.unsupported_reason)}`;
            return 'Needs review';
          }
          if (sbStatus === 'success' || sbStatus === 'done') {
            const keys = Object.keys(det).filter((k) => !k.startsWith('_')).slice(0, 3);
            return keys.length ? `Verified: ${keys.join(', ')}` : 'Passed';
          }
          if (sbStatus === 'running') return 'In progress...';
        }
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
        // Section-specific summaries — say what the card actually proved.
        if (sec.id === 'entropy') {
          if (output.encrypted === true) {
            const basis = output.encryption_decision_basis;
            if (basis === 'cipher_decoded' && output.cipher) {
              const envelope = output.key_envelope ? ` with ${output.key_envelope} image key` : '';
              return `Encrypted — ${output.cipher}${envelope}`;
            }
            if (basis === 'container_flag_true') {
              return 'Encrypted — chipset container flag confirms (cipher not identified)';
            }
            const entropy = output.entropy_global != null ? ` (entropy ${output.entropy_global})` : '';
            return `Likely encrypted by entropy heuristic only${entropy}`;
          }
          if (output.encrypted === false) {
            return output.encryption_decision_basis === 'container_flag_false'
              ? 'Not encrypted — chipset container flag confirms'
              : 'Not encrypted';
          }
        }
        if (sec.id === 'weak_key_enc') {
          const cipher = output.enc_type || output.header_encryption_flag || 'cipher';
          const tried = output.keys_tried != null ? ` (${output.keys_tried} keys tried)` : '';
          return `No weak ${cipher} key matched${tried}`;
        }
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

/* ---- Per-section algorithm chips (encryption / signature) ---- */
.cl-algo-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.2rem 0 0.35rem 0;
}
.cl-algo-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.68rem;
  line-height: 1.4;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.cl-algo-chip-label {
  text-transform: uppercase;
  font-size: 0.6rem;
  opacity: 0.75;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.cl-algo-chip-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
}
.cl-algo-chip-enc { background: #ede9fe; color: #5b21b6; border-color: #ddd6fe; }
.cl-algo-chip-sig { background: #ecfeff; color: #0e7490; border-color: #cffafe; }
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
