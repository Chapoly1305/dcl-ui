<template>
  <Teleport to="body">
    <Dialog
      :visible="visible"
      :modal="true"
      :closable="true"
      :dismissable-mask="true"
      append-to="body"
      :base-z-index="20000"
      class="ai-transcript-dialog-root"
      :style="{ width: '80rem', maxWidth: '96vw' }"
      @update:visible="onVisibleChange"
    >
    <template #header>
      <div class="flex align-items-center gap-2">
        <i class="pi pi-comments text-blue-500"></i>
        <span class="font-medium">AI Analysis Transcript — Section {{ sectionId }}</span>
      </div>
    </template>

    <template #default>
      <div v-if="loading" class="text-center p-4">
        <ProgressSpinner style="width:36px;height:36px" />
        <div class="text-sm text-500 mt-2">Loading transcript…</div>
      </div>

      <div v-else-if="error" class="p-4">
        <Message severity="error" :closable="false">
          <strong>Couldn't load transcript:</strong> {{ error }}
        </Message>
      </div>

      <div v-else-if="data">
        <!-- ============= Summary panel ============= -->
        <div class="summary-grid mb-3">
          <div class="summary-cell">
            <div class="summary-label">Model</div>
            <div class="summary-value"><code>{{ data.summary.model || '—' }}</code></div>
          </div>
          <div class="summary-cell">
            <div class="summary-label">Chipset</div>
            <div class="summary-value">{{ data.summary.chipset_family || '—' }}</div>
          </div>
          <div class="summary-cell">
            <div class="summary-label">Platform SB</div>
            <div class="summary-value">
              <Tag :value="data.summary.sb_status_label || '—'" :severity="sbBadgeSeverity(data.summary.sb_status_label)" />
            </div>
          </div>
          <div class="summary-cell">
            <div class="summary-label">Assistant turns</div>
            <div class="summary-value">{{ data.summary.rounds }}</div>
          </div>
          <div class="summary-cell">
            <div class="summary-label">Tool calls</div>
            <div class="summary-value">
              {{ data.summary.tool_calls }}
              <span v-if="data.summary.tool_errors" class="text-red-500 text-xs">({{ data.summary.tool_errors }} err)</span>
            </div>
          </div>
          <div class="summary-cell">
            <div class="summary-label">Tokens (in / out)</div>
            <div class="summary-value">{{ data.summary.input_tokens }} / {{ data.summary.output_tokens }}</div>
          </div>
          <div class="summary-cell">
            <div class="summary-label">Latency</div>
            <div class="summary-value">{{ formatElapsed(data.summary.elapsed_ms) }}</div>
          </div>
          <div class="summary-cell">
            <div class="summary-label">Events recorded</div>
            <div class="summary-value">{{ data.summary.event_count }}</div>
          </div>
        </div>

        <!-- ============= Final verdict ============= -->
        <Card v-if="data.summary.final_verdict" class="mb-3 verdict-card">
          <template #title>
            <div class="flex align-items-center gap-2">
              <i class="pi pi-flag-fill text-blue-500"></i>
              <span>Final Verdict</span>
              <Tag
                v-if="data.summary.final_verdict.category"
                :value="data.summary.final_verdict.category"
                :severity="verdictBadgeSeverity(data.summary.final_verdict)"
                class="ml-2"
              />
              <Tag
                v-if="data.summary.final_verdict.confidence"
                :value="`confidence: ${data.summary.final_verdict.confidence}`"
                severity="secondary"
                class="ml-1"
              />
            </div>
          </template>
          <template #content>
            <div v-if="data.summary.final_verdict.reasoning" class="mb-2 text-sm">
              <strong>Reasoning:</strong> {{ data.summary.final_verdict.reasoning }}
            </div>
            <div v-if="evidenceList.length" class="mb-2">
              <div class="text-xs text-500 mb-1">Evidence strings ({{ evidenceList.length }}):</div>
              <div class="evidence-chips">
                <code v-for="(ev, i) in evidenceList" :key="i" class="evidence-chip">{{ ev }}</code>
              </div>
            </div>
            <div v-if="citationList.length" class="text-xs text-500">
              <strong>KB citations:</strong>
              <ul class="m-0 pl-3">
                <li v-for="(c, i) in citationList" :key="i"><code>{{ c }}</code></li>
              </ul>
            </div>
            <div v-if="data.summary.final_verdict.error" class="text-red-500">
              <strong>Error:</strong> {{ data.summary.final_verdict.error }}
            </div>
          </template>
        </Card>

        <!-- ============= KB files consulted ============= -->
        <Accordion v-if="uniqueKbFiles.length" :multiple="true" class="mb-3">
          <AccordionTab>
            <template #header>
              <span><i class="pi pi-book mr-2 text-blue-500"></i>Knowledge base files consulted ({{ uniqueKbFiles.length }})</span>
            </template>
            <ul class="m-0 pl-3 text-xs">
              <li v-for="(f, i) in uniqueKbFiles" :key="i"><code>{{ f }}</code></li>
            </ul>
          </AccordionTab>
        </Accordion>

        <!-- ============= Prompts (collapsed by default) ============= -->
        <Accordion :multiple="true" class="mb-3">
          <AccordionTab v-if="systemPromptText">
            <template #header>
              <span><i class="pi pi-cog mr-2 text-purple-500"></i>System prompt ({{ systemPromptText.length }} chars)</span>
            </template>
            <pre class="prompt-block">{{ systemPromptText }}</pre>
          </AccordionTab>
          <AccordionTab v-if="userPromptText">
            <template #header>
              <span><i class="pi pi-user mr-2 text-blue-500"></i>User prompt ({{ userPromptText.length }} chars)</span>
            </template>
            <pre class="prompt-block">{{ userPromptText }}</pre>
          </AccordionTab>
        </Accordion>

        <!-- ============= AI self-review (under User prompt) ============= -->
        <Card class="mb-3 review-card" :class="reviewCardSeverityClass">
          <template #title>
            <div class="flex align-items-center gap-2 review-title">
              <i class="pi pi-comment text-amber-500"></i>
              <span>AI Self-Review &amp; KB Suggestions</span>
              <Tag
                :value="reviewSummaryLabel"
                :severity="reviewSummarySeverity"
                class="ml-2"
              />
            </div>
          </template>
          <template #content>
            <!-- Placeholder for runs whose verdict predates harness_review -->
            <div v-if="!harnessReview" class="review-empty review-empty-missing">
              <i class="pi pi-info-circle text-blue-500 mr-1"></i>
              No self-review submitted for this run. Runs predating the
              <code>harness_review</code> schema (or transcripts written before
              the verdict pydantic model added the field) won't have one — re-run
              the section to capture it.
            </div>

            <!-- One-line summary the model wrote -->
            <div v-if="harnessReview" class="review-summary">{{ harnessReview.summary || '(no summary)' }}</div>

            <!-- Reactive issues observed during the run -->
            <div v-if="reviewIssues.length" class="review-section">
              <div class="review-section-head">
                <i class="pi pi-exclamation-triangle text-orange-500 mr-1"></i>
                Issues observed ({{ reviewIssues.length }})
              </div>
              <div v-for="(it, i) in reviewIssues" :key="`iss-${i}`" class="review-item">
                <div class="review-item-head">
                  <i :class="issueCategoryIcon(it.category)" class="mr-1"></i>
                  <Tag :value="it.category || 'other'" :severity="issueCategorySeverity(it.category)" />
                </div>
                <div class="review-item-body">
                  <div class="review-item-detail"><strong>What:</strong> {{ it.detail }}</div>
                  <div v-if="it.suggestion" class="review-item-suggestion">
                    <strong>Fix idea:</strong> {{ it.suggestion }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Proactive KB-quality suggestions -->
            <div v-if="reviewKbSuggestions.length" class="review-section">
              <div class="review-section-head">
                <i class="pi pi-book text-blue-500 mr-1"></i>
                Suggested KB improvements ({{ reviewKbSuggestions.length }})
                <span class="text-xs text-500 ml-2">— suggestions only; the team reviews before adopting</span>
              </div>
              <div v-for="(s, i) in reviewKbSuggestions" :key="`kb-${i}`" class="review-item">
                <div class="review-item-head">
                  <Tag :value="s.kind || 'amend'" :severity="suggestionKindSeverity(s.kind)" />
                  <code class="review-item-path ml-2">{{ s.path }}</code>
                </div>
                <div class="review-item-body">
                  <div class="review-item-detail"><strong>Change:</strong> {{ s.suggestion }}</div>
                  <div v-if="s.rationale" class="review-item-suggestion">
                    <strong>Why:</strong> {{ s.rationale }}
                  </div>
                </div>
              </div>
            </div>

            <!-- "All good" empty state (only when a review exists and is clean) -->
            <div
              v-if="harnessReview && !reviewIssues.length && !reviewKbSuggestions.length"
              class="review-empty"
            >
              <i class="pi pi-check-circle text-green-500 mr-1"></i>
              Clean run — no issues observed, no KB suggestions filed.
            </div>
          </template>
        </Card>

        <!-- ============= Round-by-round timeline ============= -->
        <div v-if="timelineRounds.length" class="mb-3">
          <h4 class="m-0 mb-2"><i class="pi pi-clock mr-2 text-green-500"></i>Reasoning Timeline ({{ timelineRounds.length }} turns)</h4>
          <div v-for="round in timelineRounds" :key="round.idx" class="round-card mb-2">
            <div class="round-header">
              <span class="round-label">Turn {{ round.idx }}</span>
              <span v-if="round.thinking" class="text-xs text-500">
                <i class="pi pi-lightbulb mr-1"></i>{{ round.thinking }} chars of thinking
              </span>
              <span v-if="round.tokens && (round.tokens.input || round.tokens.output)" class="text-xs text-500 ml-2">
                {{ round.tokens.input || 0 }} in / {{ round.tokens.output || 0 }} out
              </span>
              <span v-if="round.latencyMs" class="text-xs text-500 ml-2">
                {{ round.latencyMs.toFixed(0) }} ms
              </span>
            </div>
            <div v-if="round.text" class="round-text">{{ round.text }}</div>
            <div v-if="round.toolCalls.length" class="round-tools">
              <div v-for="(tc, i) in round.toolCalls" :key="i" class="tool-row" :class="{ 'tool-err': tc.isError }">
                <div class="tool-row-head">
                  <i :class="tc.isError ? 'pi pi-times-circle text-red-500' : 'pi pi-wrench text-blue-500'" class="mr-1"></i>
                  <code class="tool-name">{{ tc.name }}</code>
                  <code class="tool-args">{{ formatToolArgs(tc.args) }}</code>
                  <span class="text-xs text-500 ml-2">→ {{ tc.returnedChars }} chars{{ tc.isError ? ' (error)' : '' }}</span>
                  <Button
                    v-if="tc.returnedContent"
                    :label="isToolExpanded(round.idx, i) ? 'Hide' : 'Show'"
                    text
                    size="small"
                    class="ml-2"
                    @click="toggleTool(round.idx, i)"
                  />
                </div>
                <pre v-if="isToolExpanded(round.idx, i) && tc.returnedContent" class="tool-return">{{ tc.returnedContent }}</pre>
              </div>
            </div>
          </div>
        </div>

        <!-- ============= Raw events (debug) ============= -->
        <Accordion :multiple="false">
          <AccordionTab>
            <template #header>
              <span><i class="pi pi-code mr-2 text-500"></i>Raw events ({{ data.events.length }})</span>
            </template>
            <pre class="raw-events">{{ JSON.stringify(data.events, null, 2) }}</pre>
          </AccordionTab>
        </Accordion>
      </div>
    </template>
    </Dialog>
  </Teleport>
</template>

<script>
import Dialog from 'primevue/dialog';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';
import ProgressSpinner from 'primevue/progressspinner';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'AiTranscriptDialog',
  components: { Dialog, Card, Tag, Button, Message, Accordion, AccordionTab, ProgressSpinner },
  props: {
    visible: { type: Boolean, default: false },
    resultId: { type: String, required: true },
    sectionId: { type: String, required: true },
  },
  emits: ['update:visible'],
  data() {
    return {
      loading: false,
      error: '',
      data: null,
      // Mutating a flag on the computed result's child objects doesn't
      // trigger re-renders, so track tool-row expansion in this reactive
      // map keyed by "<roundIdx>:<toolCallIdx>".
      expandedTools: {},
    };
  },
  computed: {
    apiBase() {
      return resolveMatteroverwatchApiBase().requestBase || '';
    },
    systemPromptText() {
      const ev = (this.data?.events || []).find(e => e.event === 'prompt_sent');
      return ev?.system_prompt || '';
    },
    userPromptText() {
      const ev = (this.data?.events || []).find(e => e.event === 'prompt_sent');
      return ev?.user_message || '';
    },
    uniqueKbFiles() {
      const seen = new Set();
      const out = [];
      for (const f of (this.data?.summary?.kb_files_consulted || [])) {
        if (!seen.has(f)) { seen.add(f); out.push(f); }
      }
      return out;
    },
    evidenceList() {
      const fv = this.data?.summary?.final_verdict;
      return Array.isArray(fv?.evidence_strings) ? fv.evidence_strings : [];
    },
    citationList() {
      const fv = this.data?.summary?.final_verdict;
      return Array.isArray(fv?.kb_citations) ? fv.kb_citations : [];
    },
    harnessReview() {
      const hr = this.data?.summary?.final_verdict?.harness_review;
      if (!hr || typeof hr !== 'object') return null;
      return hr;
    },
    reviewIssues() {
      const arr = this.harnessReview?.issues;
      return Array.isArray(arr) ? arr : [];
    },
    reviewKbSuggestions() {
      const arr = this.harnessReview?.kb_suggestions;
      return Array.isArray(arr) ? arr : [];
    },
    reviewSummaryLabel() {
      if (!this.harnessReview) return 'not submitted';
      const s = (this.harnessReview.summary || '').trim().toLowerCase();
      if (s === 'all good' && !this.reviewIssues.length && !this.reviewKbSuggestions.length) {
        return 'clean run';
      }
      const n = this.reviewIssues.length + this.reviewKbSuggestions.length;
      return `${n} item${n === 1 ? '' : 's'} flagged`;
    },
    reviewSummarySeverity() {
      if (!this.harnessReview) return 'secondary';
      if (this.reviewIssues.length) return 'warning';
      if (this.reviewKbSuggestions.length) return 'info';
      return 'success';
    },
    reviewCardSeverityClass() {
      if (!this.harnessReview) return 'review-card-missing';
      if (this.reviewIssues.length) return 'review-card-warn';
      if (this.reviewKbSuggestions.length) return 'review-card-info';
      return 'review-card-clean';
    },
    timelineRounds() {
      // Reconstruct one "round" per assistant turn / ModelResponse message.
      // Tool dispatches and ToolReturnPart parts get glued to the originating round.
      const rounds = [];
      const events = this.data?.events || [];
      let current = null;
      let roundIdx = 0;

      const newRound = () => {
        if (current) rounds.push(current);
        current = {
          idx: roundIdx++,
          text: '',
          thinking: 0,
          tokens: null,
          latencyMs: 0,
          toolCalls: [],
        };
      };

      for (const ev of events) {
        const k = ev.event;
        if (k === 'assistant_turn') {
          // Legacy bespoke-loop transcript shape
          newRound();
          current.text = ev.assistant_text || '';
          current.tokens = { input: ev.input_tokens || 0, output: ev.output_tokens || 0 };
          current.latencyMs = ev.latency_ms || 0;
          if (ev.reasoning_content_chars) current.thinking = ev.reasoning_content_chars;
          for (const tc of (ev.tool_calls || [])) {
            current.toolCalls.push({
              id: tc.id,
              name: tc.name,
              args: tc.input,
              isError: false,
              returnedChars: 0,
              returnedContent: '',
            });
          }
        } else if (k === 'pydantic_ai_message') {
          if (ev.message_kind === 'ModelResponse') {
            newRound();
            for (const part of (ev.parts || [])) {
              if (part.kind === 'text') current.text += part.content || '';
              else if (part.kind === 'ThinkingPart') current.thinking += 1;
              else if (part.kind === 'tool_call') {
                current.toolCalls.push({
                  id: part.tool_call_id,
                  name: part.tool_name,
                  args: part.args,
                  isError: false,
                  returnedChars: 0,
                  returnedContent: '',
                });
              }
            }
          } else if (ev.message_kind === 'ModelRequest') {
            // ModelRequest carries tool_return parts that match prior tool_calls
            for (const part of (ev.parts || [])) {
              if (part.kind !== 'tool_return') continue;
              // Find the matching tool_call across all rounds (most recently)
              for (let i = rounds.length - 1; i >= 0; i--) {
                const tc = rounds[i].toolCalls.find(t => t.id === part.tool_call_id);
                if (tc) {
                  tc.returnedContent = part.content || '';
                  tc.returnedChars = (part.content || '').length;
                  if (typeof part.content === 'string' && part.content.startsWith('ERROR:')) tc.isError = true;
                  break;
                }
              }
              // Also check the current in-progress round
              if (current) {
                const tc = current.toolCalls.find(t => t.id === part.tool_call_id);
                if (tc) {
                  tc.returnedContent = part.content || '';
                  tc.returnedChars = (part.content || '').length;
                }
              }
            }
          }
        } else if (k === 'tool_dispatch') {
          // Find the originating tool_call by ID, OR if the harness can't
          // surface a tool_use_id (the Claude Agent SDK's MCP handlers
          // don't expose the originator to the tool body), fall back to
          // FIFO matching by tool_name against the earliest still-unfilled
          // tool_call. The agent loop is linear so this is deterministic.
          const matchById = (toolCalls) =>
            ev.tool_use_id ? toolCalls.find(t => t.id === ev.tool_use_id) : null;
          // The assistant_turn records the SDK's full prefixed name
          // (e.g. "mcp__kb__bn_get_xrefs_to") while tool_dispatch emits the
          // bare dispatcher name ("bn_get_xrefs_to"). Match by suffix so
          // both shapes line up.
          const namesEqual = (a, b) => a === b || a.endsWith(`__${b}`) || b.endsWith(`__${a}`);
          const matchByName = (toolCalls) =>
            toolCalls.find(t => namesEqual(t.name, ev.tool_name)
              && t.returnedChars === 0 && !t.returnedContent);
          const apply = (tc) => {
            tc.returnedContent = ev.content || '';
            tc.returnedChars = ev.returned_chars || (ev.content || '').length;
            tc.isError = !!ev.is_error;
          };

          let matched = false;
          // Walk back through completed rounds first (Legacy bespoke-loop
          // transcripts dispatch AFTER the assistant_turn that contains
          // their tool_calls).
          for (let i = rounds.length - 1; i >= 0 && !matched; i--) {
            const tc = matchById(rounds[i].toolCalls) || matchByName(rounds[i].toolCalls);
            if (tc) { apply(tc); matched = true; }
          }
          // Then the round currently being built (PydanticAI / claude_agent
          // case — tool_dispatch arrives during the same round window).
          if (!matched && current) {
            const tc = matchById(current.toolCalls) || matchByName(current.toolCalls);
            if (tc) apply(tc);
          }
        }
      }
      if (current) rounds.push(current);
      return rounds;
    },
  },
  watch: {
    visible(now) {
      if (now && !this.data && !this.loading) this.fetchTranscript();
    },
  },
  methods: {
    onVisibleChange(v) {
      this.$emit('update:visible', v);
      if (!v) this.expandedTools = {};  // reset expansions when closing
    },
    isToolExpanded(roundIdx, toolIdx) {
      return !!this.expandedTools[`${roundIdx}:${toolIdx}`];
    },
    toggleTool(roundIdx, toolIdx) {
      const key = `${roundIdx}:${toolIdx}`;
      // Use a fresh object so Vue treats it as a new value (assigning a
      // property on the existing object would still mutate without
      // triggering reactivity in some setups).
      this.expandedTools = {
        ...this.expandedTools,
        [key]: !this.expandedTools[key],
      };
    },
    async fetchTranscript() {
      if (!this.resultId || !this.sectionId) return;
      this.loading = true;
      this.error = '';
      this.data = null;
      this.expandedTools = {};
      const url = `${this.apiBase}/api/v1/results/${encodeURIComponent(this.resultId)}/sections/${encodeURIComponent(this.sectionId)}/transcript`;
      try {
        const r = await fetch(url);
        if (!r.ok) {
          this.error = `HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''}`;
          try { const body = await r.json(); if (body?.detail) this.error += ` — ${body.detail}`; } catch { /* ignore */ }
        } else {
          this.data = await r.json();
        }
      } catch (e) {
        this.error = e?.message || String(e);
      } finally {
        this.loading = false;
      }
    },
    sbBadgeSeverity(label) {
      if (label === 'strong') return 'success';
      if (label === 'weak') return 'warning';
      if (label === 'absent') return 'danger';
      return 'secondary';
    },
    verdictBadgeSeverity(verdict) {
      if (!verdict) return 'secondary';
      if (verdict.has_custom_validation) return 'success';
      if (verdict.category === 'no-check') return 'danger';
      if (verdict.category === 'indeterminate') return 'info';
      return 'secondary';
    },
    formatElapsed(ms) {
      if (ms == null) return '—';
      if (ms < 1000) return `${ms.toFixed(0)} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    },
    formatToolArgs(args) {
      if (args == null) return '()';
      if (typeof args === 'string') return `(${args})`;
      try { return `(${JSON.stringify(args)})`; } catch { return '(?)'; }
    },
    issueCategoryIcon(cat) {
      switch (cat) {
        case 'tool_malfunction': return 'pi pi-wrench text-red-500';
        case 'tool_missing':     return 'pi pi-question-circle text-orange-500';
        case 'kb_gap':           return 'pi pi-book text-blue-500';
        case 'prompt_ambiguity': return 'pi pi-comment text-purple-500';
        case 'binary_artifact':  return 'pi pi-file text-gray-500';
        default:                 return 'pi pi-circle text-gray-500';
      }
    },
    issueCategorySeverity(cat) {
      switch (cat) {
        case 'tool_malfunction': return 'danger';
        case 'tool_missing':     return 'warning';
        case 'kb_gap':           return 'info';
        case 'prompt_ambiguity': return 'warning';
        case 'binary_artifact':  return 'secondary';
        default:                 return 'secondary';
      }
    },
    suggestionKindSeverity(kind) {
      switch (kind) {
        case 'add':      return 'success';
        case 'amend':    return 'info';
        case 'clarify':  return 'info';
        case 'remove':   return 'danger';
        default:         return 'secondary';
      }
    },
  },
};
</script>

<!-- Global (unscoped) style: the dialog is teleported to <body>, so scoped
     styles wouldn't reach it. Force z-index above the parent Sidebar (which
     itself sits at ~11000 in this app). -->
<style>
.ai-transcript-dialog-root.p-dialog,
.p-dialog-mask:has(> .ai-transcript-dialog-root) {
  z-index: 20100 !important;
}
</style>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.5rem;
}
.summary-cell {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.summary-label {
  font-size: 0.7rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.summary-value { font-size: 0.95rem; font-weight: 500; margin-top: 0.15rem; }

.verdict-card :deep(.p-card-body) { padding: 0.75rem 1rem; }
.evidence-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.evidence-chip {
  background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;
  padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.75rem;
}

.prompt-block, .raw-events, .tool-return {
  background: #1e293b; color: #e2e8f0;
  padding: 0.6rem; border-radius: 4px;
  white-space: pre-wrap; word-break: break-word;
  font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
  font-size: 0.75rem; max-height: 400px; overflow: auto;
}

.round-card {
  border: 1px solid #e5e7eb; border-left: 3px solid #3b82f6;
  border-radius: 4px; padding: 0.5rem 0.75rem; background: #fafbfc;
}
.round-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.round-label { font-weight: 600; color: #1e40af; }
.round-text { font-size: 0.85rem; color: #374151; white-space: pre-wrap; margin-bottom: 0.5rem; }

.round-tools { display: flex; flex-direction: column; gap: 0.3rem; }
.tool-row { background: white; border: 1px solid #e5e7eb; border-radius: 3px; padding: 0.4rem 0.5rem; }
.tool-row.tool-err { border-left: 3px solid #ef4444; }
.tool-row-head { display: flex; align-items: center; flex-wrap: wrap; font-size: 0.8rem; }
.tool-name { font-weight: 600; color: #1e40af; }
.tool-args { color: #6b7280; margin-left: 0.4rem; font-size: 0.75rem; }
.tool-return { margin-top: 0.4rem; max-height: 250px; }

/* ----- AI self-review panel ----- */
.review-card :deep(.p-card-body) { padding: 0.75rem 1rem; }
.review-card.review-card-clean   { border-left: 3px solid #10b981; }
.review-card.review-card-info    { border-left: 3px solid #3b82f6; }
.review-card.review-card-warn    { border-left: 3px solid #f59e0b; }
.review-card.review-card-missing { border-left: 3px solid #94a3b8; }
.review-empty.review-empty-missing {
  background: #f1f5f9; border-color: #cbd5e1; color: #475569;
}
.review-title { font-size: 0.95rem; font-weight: 600; }
.review-summary {
  font-size: 0.85rem; color: #374151;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px;
  padding: 0.5rem 0.75rem; margin-bottom: 0.6rem;
}
.review-section { margin-top: 0.5rem; }
.review-section-head {
  font-size: 0.8rem; font-weight: 600; color: #1f2937;
  display: flex; align-items: center; margin-bottom: 0.3rem;
}
.review-item {
  border: 1px solid #e5e7eb; border-radius: 4px;
  background: #fafbfc; padding: 0.4rem 0.6rem; margin-bottom: 0.35rem;
}
.review-item-head { display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.2rem; }
.review-item-path {
  font-size: 0.75rem; color: #1e40af;
  background: #eff6ff; padding: 0.05rem 0.35rem; border-radius: 3px;
}
.review-item-body { font-size: 0.8rem; color: #374151; }
.review-item-detail { margin-bottom: 0.15rem; }
.review-item-suggestion { color: #4b5563; }
.review-empty {
  font-size: 0.85rem; color: #047857;
  background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px;
  padding: 0.5rem 0.75rem;
}
</style>
