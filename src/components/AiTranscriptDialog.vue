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

      <div v-else-if="data" class="transcript-content-root">
        <!-- ============= Top Summary Bar ============= -->
        <div class="summary-bar mb-3 p-3 surface-100 border-round flex flex-wrap gap-4">
          <div class="summary-item">
            <div class="text-xs text-500 uppercase font-bold mb-1">Model</div>
            <div class="text-sm font-medium"><code>{{ data.summary.model || '—' }}</code></div>
          </div>
          <div class="summary-item">
            <div class="text-xs text-500 uppercase font-bold mb-1">Chipset</div>
            <div class="text-sm font-medium">{{ data.summary.chipset_family || '—' }}</div>
          </div>
          <div class="summary-item">
            <div class="text-xs text-500 uppercase font-bold mb-1">Platform SB</div>
            <div><Tag :value="data.summary.sb_status_label || '—'" :severity="sbBadgeSeverity(data.summary.sb_status_label)" /></div>
          </div>
          <div class="summary-item">
            <div class="text-xs text-500 uppercase font-bold mb-1">Turns</div>
            <div class="text-sm font-medium">{{ data.summary.rounds }}</div>
          </div>
          <div class="summary-item">
            <div class="text-xs text-500 uppercase font-bold mb-1">Tokens</div>
            <div class="text-sm font-medium">{{ data.summary.input_tokens }} <span class="text-400">/</span> {{ data.summary.output_tokens }}</div>
          </div>
          <div class="summary-item">
            <div class="text-xs text-500 uppercase font-bold mb-1">Latency</div>
            <div class="text-sm font-medium">{{ formatElapsed(data.summary.elapsed_ms) }}</div>
          </div>
        </div>

        <TabView>
          <!-- ============= Tab 1: Verdict & Review ============= -->
          <TabPanel>
            <template #header>
              <div class="flex align-items-center gap-2">
                <i class="pi pi-chart-bar text-green-500"></i>
                <span>Insights &amp; Verdict</span>
              </div>
            </template>

            <div class="pt-3">
              <!-- Final verdict card -->
              <Card v-if="data.summary.final_verdict" class="mb-4 verdict-card-new shadow-1">
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
                  <div v-if="data.summary.final_verdict.reasoning" class="mb-4 text-base line-height-3">
                    <strong>Reasoning:</strong> {{ data.summary.final_verdict.reasoning }}
                  </div>
                  
                  <div v-if="normalizedEvidence.length" class="mb-4">
                    <div class="text-xs font-bold text-500 uppercase mb-2">Key Evidence ({{ normalizedEvidence.length }})</div>
                    <div class="flex flex-column gap-3">
                      <div v-for="(ev, i) in normalizedEvidence" :key="i" class="evidence-item-new p-2 border-round surface-50 border-1 border-200">
                        <code class="evidence-content-new block mb-2">{{ ev.content }}</code>
                        <div v-if="ev.context" class="evidence-context-new text-sm text-600">
                          <i class="pi pi-info-circle mr-1 text-xs"></i>{{ ev.context }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="citationList.length">
                    <div class="text-xs font-bold text-500 uppercase mb-2">KB Citations</div>
                    <ul class="m-0 pl-4 text-sm">
                      <li v-for="(c, i) in citationList" :key="i" class="mb-1"><code>{{ c }}</code></li>
                    </ul>
                  </div>

                  <div v-if="data.summary.final_verdict.error" class="mt-3 p-3 bg-red-50 text-red-600 border-round text-sm">
                    <strong>Error:</strong> {{ data.summary.final_verdict.error }}
                  </div>
                </template>
              </Card>

              <!-- AI self-review card -->
              <Card class="mb-3 review-card-new shadow-1" :class="reviewCardSeverityClass">
                <template #title>
                  <div class="flex align-items-center gap-2">
                    <i class="pi pi-comment text-amber-500"></i>
                    <span>AI Self-Review &amp; Suggestions</span>
                    <Tag :value="reviewSummaryLabel" :severity="reviewSummarySeverity" class="ml-2" />
                  </div>
                </template>
                <template #content>
                  <div v-if="!harnessReview" class="p-3 bg-gray-100 border-round text-500 text-sm italic">
                    <i class="pi pi-info-circle mr-1"></i>
                    No self-review submitted for this run.
                  </div>

                  <div v-else>
                    <div class="review-summary-box mb-4 p-3 border-round">
                      {{ harnessReview.summary || '(no summary)' }}
                    </div>

                    <!-- Issues -->
                    <div v-if="reviewIssues.length" class="mb-4">
                      <div class="text-sm font-bold mb-2"><i class="pi pi-exclamation-triangle text-orange-500 mr-2"></i>Issues Observed</div>
                      <div class="flex flex-column gap-2">
                        <div v-for="(it, i) in reviewIssues" :key="i" class="p-3 border-1 border-200 border-round surface-50">
                          <div class="flex align-items-center gap-2 mb-2">
                            <Tag :value="it.category || 'other'" :severity="issueCategorySeverity(it.category)" />
                            <i :class="issueCategoryIcon(it.category)" class="text-xs"></i>
                          </div>
                          <div class="text-sm"><strong>What:</strong> {{ it.detail }}</div>
                          <div v-if="it.suggestion" class="text-sm mt-1 text-600 italic"><strong>Fix idea:</strong> {{ it.suggestion }}</div>
                        </div>
                      </div>
                    </div>

                    <!-- KB Suggestions -->
                    <div v-if="reviewKbSuggestions.length">
                      <div class="text-sm font-bold mb-2"><i class="pi pi-book text-blue-500 mr-2"></i>KB Improvements</div>
                      <div class="flex flex-column gap-2">
                        <div v-for="(s, i) in reviewKbSuggestions" :key="i" class="p-3 border-1 border-200 border-round surface-50">
                          <div class="flex align-items-center gap-2 mb-2">
                            <Tag :value="s.kind || 'amend'" :severity="suggestionKindSeverity(s.kind)" />
                            <code class="text-xs text-blue-600">{{ s.path }}</code>
                          </div>
                          <div class="text-sm"><strong>Change:</strong> {{ s.suggestion }}</div>
                          <div v-if="s.rationale" class="text-sm mt-1 text-600 italic"><strong>Why:</strong> {{ s.rationale }}</div>
                        </div>
                      </div>
                    </div>

                    <div v-if="harnessReview && !reviewIssues.length && !reviewKbSuggestions.length" class="p-3 bg-green-50 text-green-700 border-round text-sm">
                      <i class="pi pi-check-circle mr-1"></i> Clean run — no issues observed.
                    </div>
                  </div>
                </template>
              </Card>
            </div>
          </TabPanel>

          <!-- ============= Tab 2: Reasoning Timeline ============= -->
          <TabPanel>
            <template #header>
              <div class="flex align-items-center gap-2">
                <i class="pi pi-clock text-blue-500"></i>
                <span>Reasoning Timeline</span>
              </div>
            </template>

            <div v-if="timelineRounds.length" class="timeline-wrapper pt-3">
              <div v-for="round in timelineRounds" :key="round.idx" class="round-container mb-4">
                <div class="round-header flex align-items-center gap-3 mb-2">
                  <span class="round-number">TURN {{ round.idx }}</span>
                  <div class="round-stats flex gap-3 text-xs text-500">
                    <span v-if="round.thinking"><i class="pi pi-lightbulb mr-1"></i>{{ round.thinking }} thoughts</span>
                    <span v-if="round.latencyMs"><i class="pi pi-hourglass mr-1"></i>{{ round.latencyMs.toFixed(0) }}ms</span>
                    <span v-if="round.tokens && (round.tokens.input || round.tokens.output)">
                      <i class="pi pi-chart-line mr-1"></i>{{ round.tokens.input }} / {{ round.tokens.output }} tokens
                    </span>
                  </div>
                </div>

                <div v-if="round.text" class="assistant-bubble p-3 mb-3">
                  {{ round.text }}
                </div>

                <div v-if="round.toolCalls.length" class="tool-actions-list flex flex-column gap-2">
                  <div
                    v-for="(tc, i) in round.toolCalls"
                    :key="i"
                    class="tool-action-card shadow-1"
                    :class="{ 'tool-action-err': tc.isError }"
                  >
                    <div class="tool-action-header p-2 flex align-items-center justify-content-between cursor-pointer hover:surface-200" @click="toggleTool(round.idx, i)">
                      <div class="flex align-items-center gap-2 overflow-hidden">
                        <i :class="tc.isError ? 'pi pi-times-circle text-red-500' : 'pi pi-wrench text-blue-500'" class="flex-shrink-0"></i>
                        <span class="tool-name-text font-bold text-sm">{{ tc.name }}</span>
                        <code class="tool-args-text text-xs text-500 white-space-nowrap overflow-hidden text-overflow-ellipsis">{{ formatToolArgs(tc.args) }}</code>
                      </div>
                      <div class="flex align-items-center gap-3 flex-shrink-0 ml-2">
                        <span class="text-xs text-500">{{ tc.returnedChars }} chars</span>
                        <i :class="isToolExpanded(round.idx, i) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="text-400"></i>
                      </div>
                    </div>
                    <div v-if="isToolExpanded(round.idx, i)" class="tool-action-body p-2 border-top-1 border-200">
                      <pre class="tool-output-block">{{ tc.returnedContent || '(no output)' }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-center py-6 text-500">
              <i class="pi pi-info-circle text-2xl mb-2"></i>
              <div>No reasoning rounds found in this transcript.</div>
            </div>
          </TabPanel>

          <!-- ============= Tab 3: Context & Debug ============= -->
          <TabPanel>
            <template #header>
              <div class="flex align-items-center gap-2">
                <i class="pi pi-database text-purple-500"></i>
                <span>Context &amp; Raw</span>
              </div>
            </template>

            <div class="pt-3">
              <!-- KB files -->
              <div v-if="uniqueKbFiles.length" class="mb-4">
                <div class="text-sm font-bold mb-2 flex align-items-center gap-2">
                  <i class="pi pi-book text-blue-500"></i>
                  Knowledge Base Files Consulted ({{ uniqueKbFiles.length }})
                </div>
                <div class="flex flex-wrap gap-2">
                  <code v-for="(f, i) in uniqueKbFiles" :key="i" class="kb-file-tag-new">{{ f }}</code>
                </div>
              </div>

              <!-- Prompts -->
              <Accordion :multiple="true" class="mb-4">
                <AccordionTab v-if="systemPromptText">
                  <template #header>
                    <span><i class="pi pi-cog mr-2 text-purple-500"></i>System Prompt</span>
                  </template>
                  <pre class="debug-code-block">{{ systemPromptText }}</pre>
                </AccordionTab>
                <AccordionTab v-if="userPromptText">
                  <template #header>
                    <span><i class="pi pi-user mr-2 text-blue-500"></i>User Prompt</span>
                  </template>
                  <pre class="debug-code-block">{{ userPromptText }}</pre>
                </AccordionTab>
              </Accordion>

              <!-- Raw Events -->
              <Accordion>
                <AccordionTab>
                  <template #header>
                    <span><i class="pi pi-code mr-2 text-500"></i>Raw Events JSON ({{ data.events.length }})</span>
                  </template>
                  <pre class="debug-code-block raw-json-box">{{ JSON.stringify(data.events, null, 2) }}</pre>
                </AccordionTab>
              </Accordion>
            </div>
          </TabPanel>
        </TabView>
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
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import ProgressSpinner from 'primevue/progressspinner';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'AiTranscriptDialog',
  components: { Dialog, Card, Tag, Button, Message, Accordion, AccordionTab, TabView, TabPanel, ProgressSpinner },
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
    normalizedEvidence() {
      const fv = this.data?.summary?.final_verdict;
      // Handle the new rich evidence objects if present
      if (Array.isArray(fv?.evidence)) {
        return fv.evidence.map(e => ({
          content: typeof e === 'object' ? e.content : e,
          context: typeof e === 'object' ? e.context : null,
        }));
      }
      // Fallback to old evidence_strings
      if (Array.isArray(fv?.evidence_strings)) {
        return fv.evidence_strings.map(s => ({ content: s, context: null }));
      }
      return [];
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
    // Refetch when the user switches to a different section while the dialog
    // stays open — otherwise stale transcript data from the previous section
    // is shown (e.g. switching from rng_init → custom_auth would keep showing
    // rng_init's 0/0 token summary).
    sectionId(_newId, _oldId) {
      if (this.visible && _newId !== _oldId) {
        this.data = null;
        this.error = '';
        this.fetchTranscript();
      }
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
      // Generic: any overall_risk at critical/high → danger
      if (verdict.overall_risk === 'critical' || verdict.overall_risk === 'high') return 'danger';
      if (verdict.overall_risk === 'medium') return 'warning';
      if (verdict.overall_risk === 'low' || verdict.overall_risk === 'none') return 'success';
      // CA-specific: has_custom_validation is positive
      if (verdict.has_custom_validation) return 'success';
      // Backdoor-specific: has_backdoor
      if (verdict.has_backdoor) return 'danger';
      // Secrets-specific: has_private_key or has_weak_crypto_key
      if (verdict.has_private_key || verdict.has_weak_crypto_key) return 'danger';
      if (verdict.has_exposed_credential) return 'warning';
      // RNG-specific: hw_rng_confirmed is positive, weak_seed_detected is danger
      if (verdict.hw_rng_confirmed) return 'success';
      if (verdict.weak_seed_detected) return 'danger';
      // Connectivity-specific: has_suspicious_endpoints
      if (verdict.has_suspicious_endpoints) return 'danger';
      if (verdict.has_privacy_concern) return 'warning';
      // Category field (CA, backdoor findings)
      if (verdict.category === 'no-check' || verdict.category === 'backdoor'
          || verdict.category === 'hardcoded-credential' || verdict.category === 'command-injection'
          || verdict.category === 'auth-bypass') return 'danger';
      if (verdict.category === 'indeterminate' || verdict.category === 'weak-check'
          || verdict.category === 'unclassified_residual') return 'info';
      if (verdict.category === 'benign_cert_only' || verdict.category === 'false_positive'
          || verdict.category === 'clean_integration' || verdict.category === 'no-issue'
          || verdict.category === 'crypto-soft' || verdict.category === 'crypto-hw'
          || verdict.category === 'compare-and-gate' || verdict.category === 'bootloader-enforces') return 'success';
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
.transcript-content-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

/* Top Summary Bar */
.summary-bar { background-color: #f8fafc; border: 1px solid #e2e8f0; }
.summary-item { border-right: 1px solid #e2e8f0; padding-right: 1rem; }
.summary-item:last-child { border-right: none; }

/* Timeline / Turns */
.round-number {
  background: #3b82f6; color: white; padding: 0.2rem 0.6rem;
  border-radius: 4px; font-weight: 800; font-size: 0.7rem; letter-spacing: 0.05em;
}
.assistant-bubble {
  background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
  border-top-left-radius: 2px; line-height: 1.6; font-size: 0.95rem; color: #1e293b;
  white-space: pre-wrap;
}

/* Tool Action Cards */
.tool-action-card {
  background: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;
}
.tool-action-card:hover { border-color: #cbd5e1; }
.tool-action-err { border-left: 4px solid #ef4444 !important; }
.tool-name-text { color: #1e40af; }
.tool-output-block {
  background: #0f172a; color: #e2e8f0; padding: 0.75rem; border-radius: 4px;
  font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 0.75rem;
  max-height: 400px; overflow: auto; white-space: pre-wrap; margin: 0;
}

/* Insights / Verdict */
.verdict-card-new { border-top: 4px solid #3b82f6; }
.evidence-item-new { background-color: #f8fafc; }
.evidence-content-new {
  color: #1e40af; background: #eff6ff; padding: 0.3rem 0.5rem;
  border-radius: 4px; display: block; border-left: 3px solid #3b82f6;
  font-size: 0.8rem;
}
.evidence-context-new { font-style: italic; }
.review-card-new.review-card-clean { border-top: 4px solid #10b981; }
.review-card-new.review-card-warn  { border-top: 4px solid #f59e0b; }
.review-card-new.review-card-info  { border-top: 4px solid #3b82f6; }
.review-summary-box { background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; font-size: 0.9rem; }

/* Debug / Context */
.kb-file-tag-new {
  background: #f1f5f9; border: 1px solid #e2e8f0; padding: 0.1rem 0.4rem;
  border-radius: 4px; font-size: 0.7rem; margin-right: 0.4rem; margin-bottom: 0.4rem;
  display: inline-block;
}
.debug-code-block {
  background: #1e293b; color: #cbd5e1; padding: 1rem; border-radius: 6px;
  font-size: 0.8rem; overflow: auto; white-space: pre-wrap; margin: 0;
}
.raw-json-box { max-height: 500px; }

/* PrimeVue Overrides for Tabs */
:deep(.p-tabview-panels) { padding: 0; }
:deep(.p-tabview-nav) { border-bottom: 1px solid #e2e8f0; }
</style>
