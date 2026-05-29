<script>
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

const REVIEWER_KEY = 'mw_suggestion_reviewer';

export default {
    name: 'AiSuggestionsReview',

    data() {
        const { requestBase } = resolveMatteroverwatchApiBase();
        return {
            apiBase: requestBase,
            loading: false,
            error: null,
            items: [],
            total: 0,
            counts: { pending: 0, accepted: 0, rejected: 0, total: 0 },
            // Filters
            statusFilter: 'pending',
            typeFilter: null,
            search: '',
            scope: 'latest',
            // Paging
            first: 0,
            rows: 50,
            // Reviewer identity (free text, persisted locally)
            reviewer: (typeof localStorage !== 'undefined' && localStorage.getItem(REVIEWER_KEY)) || '',
            // Suggestion detail dialog
            detailVisible: false,
            detail: null,
            // Scan/job detail dialog
            scanDetailVisible: false,
            scanDetailLoading: false,
            scanDetailError: null,
            scanDetail: null,
            // Per-row inflight guard
            deciding: {},
            statusOptions: [
                { label: 'Pending', value: 'pending' },
                { label: 'Accepted', value: 'accepted' },
                { label: 'Rejected', value: 'rejected' },
                { label: 'All', value: null }
            ],
            typeOptions: [
                { label: 'All types', value: null },
                { label: 'KB Suggestions', value: 'kb_suggestion' },
                { label: 'Issues', value: 'issue' }
            ],
            scopeOptions: [
                { label: 'Latest per firmware', value: 'latest' },
                { label: 'All attempts', value: 'all' }
            ]
        };
    },

    computed: {
        selectedNetwork() {
            return this.normalizeNetwork(
                this.$store?.state?.network?.selectedNetwork ||
                    this.$store?.state?.network?.defaultNetwork ||
                    'testnet'
            );
        }
    },

    watch: {
        selectedNetwork() {
            // React to the global Mainnet/Testnet switch.
            this.first = 0;
            this.load();
        }
    },

    mounted() {
        this.load();
    },

    methods: {
        normalizeNetwork(value) {
            const key = String(value || '')
                .trim()
                .toLowerCase();
            return key === 'mainnet' || key === 'testnet' ? key : 'testnet';
        },

        buildQuery() {
            const q = new URLSearchParams();
            q.set('network', this.selectedNetwork);
            q.set('scope', this.scope);
            q.set('limit', String(this.rows));
            q.set('offset', String(this.first));
            if (this.statusFilter) q.set('status', this.statusFilter);
            if (this.typeFilter) q.set('type', this.typeFilter);
            if (this.search && this.search.trim()) q.set('q', this.search.trim());
            return q.toString();
        },

        async load() {
            if (!this.apiBase) {
                this.error = 'MatterOverwatch API base is not configured.';
                return;
            }
            this.loading = true;
            this.error = null;
            try {
                const response = await fetch(`${this.apiBase}/api/v1/suggestions?${this.buildQuery()}`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const data = await response.json();
                this.items = Array.isArray(data.items) ? data.items : [];
                this.total = data.total || 0;
                this.counts = data.counts || this.counts;
            } catch (err) {
                this.error = String(err && err.message ? err.message : err);
                this.items = [];
                this.total = 0;
            } finally {
                this.loading = false;
            }
        },

        onPage(event) {
            this.first = event.first;
            this.rows = event.rows;
            this.load();
        },

        applyFilters() {
            this.first = 0;
            this.load();
        },

        async decide(row, status) {
            if (!this.apiBase || !row || !row.suggestion_id) return;
            const id = row.suggestion_id;
            this.deciding = { ...this.deciding, [id]: true };
            if (this.reviewer && typeof localStorage !== 'undefined') {
                localStorage.setItem(REVIEWER_KEY, this.reviewer);
            }
            try {
                const response = await fetch(
                    `${this.apiBase}/api/v1/suggestions/${encodeURIComponent(id)}/decision`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            status,
                            reviewer: this.reviewer || undefined,
                            note: row.note || ''
                        })
                    }
                );
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const updated = await response.json();
                // Patch the row in place, and refresh counts.
                Object.assign(row, {
                    status: updated.status,
                    reviewer: updated.reviewer,
                    note: updated.note,
                    decided_at: updated.decided_at
                });
                if (this.detail && this.detail.suggestion_id === id) {
                    Object.assign(this.detail, {
                        status: updated.status,
                        reviewer: updated.reviewer,
                        decided_at: updated.decided_at
                    });
                }
                // If a status filter is active and the row no longer matches,
                // a reload keeps the list coherent; otherwise just refresh counts.
                if (this.statusFilter && this.statusFilter !== updated.status) {
                    this.load();
                } else {
                    this.refreshCounts();
                }
            } catch (err) {
                this.error = `Failed to save decision: ${String(err && err.message ? err.message : err)}`;
            } finally {
                const next = { ...this.deciding };
                delete next[id];
                this.deciding = next;
            }
        },

        async refreshCounts() {
            // Lightweight: re-fetch with current scope but only to read counts.
            try {
                const q = new URLSearchParams({ network: this.selectedNetwork, scope: this.scope, limit: '1', offset: '0' });
                const response = await fetch(`${this.apiBase}/api/v1/suggestions?${q.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    this.counts = data.counts || this.counts;
                }
            } catch (err) {
                /* non-fatal */
            }
        },

        openDetail(row) {
            this.detail = row;
            this.detailVisible = true;
        },

        shortRunId(runId) {
            const s = String(runId || '');
            if (!s) return '—';
            const tail = s.includes('_') ? s.split('_').pop() : s;
            return tail.slice(0, 10);
        },

        formatDate(iso) {
            if (!iso) return '';
            try {
                return new Date(iso).toLocaleDateString();
            } catch (err) {
                return '';
            }
        },

        async openScanDetail(row) {
            if (!row || !row.result_id) return;
            this.scanDetail = {
                result_id: row.result_id,
                run_id: row.run_id,
                device_label: row.device_label,
                chipset: row.chipset,
                firmware_sha256: row.firmware_sha256,
                analyzed_at: row.analyzed_at,
                sections: []
            };
            this.scanDetailVisible = true;
            this.scanDetailLoading = true;
            this.scanDetailError = null;
            try {
                const response = await fetch(
                    `${this.apiBase}/api/v1/results/${encodeURIComponent(row.result_id)}/report`
                );
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const report = await response.json();
                this.scanDetail.sections = this.parseReportSections(report);
            } catch (err) {
                this.scanDetailError = String(err && err.message ? err.message : err);
            } finally {
                this.scanDetailLoading = false;
            }
        },

        parseReportSections(report) {
            const results = (report && report.outputs && report.outputs.phase_ii && report.outputs.phase_ii.results) || {};
            const rows = [];
            for (const sectionId of Object.keys(results)) {
                const wrapper = results[sectionId] || {};
                const out = (wrapper && typeof wrapper.output === 'object' && wrapper.output) || {};
                rows.push({
                    section_id: sectionId,
                    status: wrapper.status || out._status || '—',
                    verdict: out.verdict || out.llm_category || '',
                    confidence: out.llm_confidence || '',
                    detail: out.detail || out.llm_reasoning || ''
                });
            }
            rows.sort((a, b) => a.section_id.localeCompare(b.section_id));
            return rows;
        },

        sectionStatusSeverity(status) {
            const map = {
                success: 'success',
                failed: 'danger',
                skipped: 'secondary',
                needs_review: 'warning',
                pending: 'info'
            };
            return map[String(status || '').toLowerCase()] || 'secondary';
        },

        changeText(row) {
            const p = (row && row.payload) || {};
            return row.item_type === 'issue' ? p.detail : p.suggestion;
        },

        statusSeverity(status) {
            if (status === 'accepted') return 'success';
            if (status === 'rejected') return 'danger';
            return 'warning';
        },

        typeSeverity(type) {
            return type === 'issue' ? 'warning' : 'info';
        },

        issueCategorySeverity(category) {
            const map = {
                tool_malfunction: 'danger',
                tool_missing: 'danger',
                kb_gap: 'warning',
                prompt_ambiguity: 'info',
                binary_artifact: 'secondary',
                other: 'secondary'
            };
            return map[category] || 'secondary';
        },

        suggestionKindSeverity(kind) {
            const map = { add: 'success', amend: 'info', clarify: 'warning', remove: 'danger' };
            return map[kind] || 'info';
        },

        shortSha(sha) {
            return sha ? String(sha).slice(0, 12) : '—';
        },

        formatTime(iso) {
            if (!iso) return '—';
            try {
                return new Date(iso).toLocaleString();
            } catch (err) {
                return iso;
            }
        }
    }
};
</script>

<template>
    <div class="ai-suggestions-review p-3">
        <div class="flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <div class="flex align-items-center gap-2">
                <i class="pi pi-comments text-blue-500 text-lg"></i>
                <h2 class="m-0 text-lg">AI Suggestions Review</h2>
            </div>
            <div class="flex gap-1 flex-wrap">
                <Tag :value="`${counts.pending}`" severity="warning" v-tooltip.top="'Pending'" />
                <Tag :value="`${counts.accepted}`" severity="success" v-tooltip.top="'Accepted'" />
                <Tag :value="`${counts.rejected}`" severity="danger" v-tooltip.top="'Rejected'" />
                <Tag :value="`${counts.total}`" severity="secondary" v-tooltip.top="'Total'" />
            </div>
        </div>

        <!-- Filters -->
        <div class="surface-card p-2 border-round mb-2 flex flex-wrap gap-2 align-items-end">
            <div class="flex flex-column gap-1">
                <label class="text-xs font-bold text-500 uppercase">Status</label>
                <Dropdown
                    v-model="statusFilter"
                    :options="statusOptions"
                    option-label="label"
                    option-value="value"
                    @change="applyFilters"
                    style="width: 9rem"
                />
            </div>
            <div class="flex flex-column gap-1">
                <label class="text-xs font-bold text-500 uppercase">Type</label>
                <Dropdown
                    v-model="typeFilter"
                    :options="typeOptions"
                    option-label="label"
                    option-value="value"
                    @change="applyFilters"
                    style="width: 10rem"
                />
            </div>
            <div class="flex flex-column gap-1">
                <label class="text-xs font-bold text-500 uppercase">Scope</label>
                <Dropdown
                    v-model="scope"
                    :options="scopeOptions"
                    option-label="label"
                    option-value="value"
                    @change="applyFilters"
                    style="width: 10rem"
                />
            </div>
            <div class="flex flex-column gap-1 flex-grow-1" style="min-width: 12rem">
                <label class="text-xs font-bold text-500 uppercase">Search</label>
                <span class="p-input-icon-left">
                    <i class="pi pi-search" />
                    <InputText
                        v-model="search"
                        placeholder="firmware, path, text…"
                        class="w-full"
                        @keyup.enter="applyFilters"
                    />
                </span>
            </div>
            <div class="flex flex-column gap-1">
                <label class="text-xs font-bold text-500 uppercase">Your name</label>
                <InputText v-model="reviewer" placeholder="reviewer" style="width: 8rem" />
            </div>
            <div>
                <Button icon="pi pi-filter" v-tooltip.top="'Apply filters'" @click="applyFilters" :loading="loading" />
            </div>
        </div>

        <Message v-if="error" severity="error" :closable="true" @close="error = null">{{ error }}</Message>

        <DataTable
            :value="items"
            :loading="loading"
            lazy
            paginator
            class="p-datatable-sm"
            :rows="rows"
            :first="first"
            :total-records="total"
            :rows-per-page-options="[25, 50, 100, 200]"
            data-key="suggestion_id"
            responsive-layout="scroll"
            row-group-mode="subheader"
            group-rows-by="device_label"
            sort-mode="single"
            sort-field="device_label"
            :sort-order="1"
            @page="onPage"
        >
            <template #empty>
                <div class="text-center text-500 p-4">No suggestions match the current filters.</div>
            </template>

            <!-- Device group header: Vendor — Product (VID/PID), aggregated -->
            <template #groupheader="{ data }">
                <div class="flex align-items-center gap-1">
                    <span class="font-bold text-sm">{{ data.device_label || 'Unknown device' }}</span>
                    <Tag v-if="data.chipset" :value="data.chipset" severity="secondary" />
                </div>
            </template>

            <Column header="Scan / Job" style="min-width: 9rem">
                <template #body="{ data }">
                    <div class="scan-job-cell">
                        <a
                            class="scan-link text-sm font-medium text-primary"
                            :title="`Run ${data.run_id} · SHA ${data.firmware_sha256 || ''}`"
                            @click="openScanDetail(data)"
                        >
                            {{ shortRunId(data.run_id) }}
                        </a>
                        <span class="text-xs text-500 mx-1">·</span>
                        <span class="text-xs text-500">{{ formatDate(data.analyzed_at) }}</span>
                    </div>
                </template>
            </Column>

            <Column header="Section" field="section_id" style="min-width: 6rem">
                <template #body="{ data }">
                    <code class="text-xs">{{ data.section_id }}</code>
                </template>
            </Column>

            <Column header="Type" style="min-width: 6rem">
                <template #body="{ data }">
                    <div class="type-cell">
                        <Tag
                            :value="data.item_type === 'issue' ? 'Issue' : 'KB'"
                            :severity="typeSeverity(data.item_type)"
                        />
                        <span v-if="data.payload" class="text-xs text-500 ml-1">
                            {{ data.item_type === 'kb_suggestion' ? data.payload.kind : data.payload.category }}
                        </span>
                    </div>
                </template>
            </Column>

            <Column header="Suggestion" style="min-width: 18rem">
                <template #body="{ data }">
                    <div class="suggestion-cell">
                        <span
                            class="suggestion-text"
                            :title="changeText(data)"
                        >{{ changeText(data) }}</span>
                        <Button
                            icon="pi pi-eye"
                            class="p-button-text p-button-sm suggestion-detail-btn"
                            v-tooltip.top="'View details'"
                            @click="openDetail(data)"
                        />
                    </div>
                </template>
            </Column>

            <Column header="Status" style="min-width: 6rem">
                <template #body="{ data }">
                    <Tag
                        :value="data.status"
                        :severity="statusSeverity(data.status)"
                        v-tooltip.top="data.decided_at
                            ? `By ${data.reviewer || '—'} at ${formatTime(data.decided_at)}`
                            : ''"
                    />
                </template>
            </Column>

            <Column header="Decision" style="min-width: 4rem">
                <template #body="{ data }">
                    <div class="flex gap-1">
                        <Button
                            icon="pi pi-check"
                            size="small"
                            class="p-button-text"
                            severity="success"
                            :outlined="data.status !== 'accepted'"
                            :loading="!!deciding[data.suggestion_id]"
                            v-tooltip.top="'Accept'"
                            @click.stop="decide(data, 'accepted')"
                        />
                        <Button
                            icon="pi pi-times"
                            size="small"
                            class="p-button-text"
                            severity="danger"
                            :outlined="data.status !== 'rejected'"
                            :loading="!!deciding[data.suggestion_id]"
                            v-tooltip.top="'Reject'"
                            @click.stop="decide(data, 'rejected')"
                        />
                        <Button
                            v-if="data.status !== 'pending'"
                            icon="pi pi-undo"
                            size="small"
                            class="p-button-text"
                            severity="secondary"
                            text
                            v-tooltip.top="'Reset to pending'"
                            :loading="!!deciding[data.suggestion_id]"
                            @click.stop="decide(data, 'pending')"
                        />
                    </div>
                </template>
            </Column>
        </DataTable>

        <!-- Detail dialog -->
        <Dialog
            :visible="detailVisible"
            modal
            dismissable-mask
            :style="{ width: '52rem', maxWidth: '94vw' }"
            @update:visible="detailVisible = $event"
        >
            <template #header>
                <div class="flex align-items-center gap-2">
                    <i class="pi pi-comment text-amber-500"></i>
                    <span class="font-medium">Suggestion detail</span>
                </div>
            </template>
            <div v-if="detail">
                <div class="flex flex-wrap gap-2 mb-3">
                    <Tag :value="detail.item_type === 'issue' ? 'Issue' : 'KB Suggestion'" :severity="typeSeverity(detail.item_type)" />
                    <Tag :value="detail.status" :severity="statusSeverity(detail.status)" />
                    <Tag v-if="detail.section_id" :value="detail.section_id" severity="secondary" />
                </div>

                <div class="text-xs text-500 mb-3">
                    <div v-if="detail.device_label"><strong>Device:</strong> {{ detail.device_label }}</div>
                    <div><strong>SHA:</strong> <code>{{ detail.firmware_sha256 }}</code></div>
                    <div v-if="detail.chipset"><strong>Chipset:</strong> {{ detail.chipset }}</div>
                    <div v-if="detail.review_summary"><strong>Run self-review:</strong> {{ detail.review_summary }}</div>
                </div>

                <!-- KB suggestion fields -->
                <template v-if="detail.item_type === 'kb_suggestion' && detail.payload">
                    <div class="mb-2"><strong>Path:</strong> <code class="text-blue-600">{{ detail.payload.path }}</code></div>
                    <div class="mb-2"><strong>Kind:</strong> <Tag :value="detail.payload.kind || 'amend'" :severity="suggestionKindSeverity(detail.payload.kind)" /></div>
                    <div class="mb-2"><strong>Change:</strong> {{ detail.payload.suggestion }}</div>
                    <div v-if="detail.payload.rationale" class="mb-2 text-600 italic"><strong>Why:</strong> {{ detail.payload.rationale }}</div>
                </template>

                <!-- Issue fields -->
                <template v-else-if="detail.payload">
                    <div class="mb-2"><strong>Category:</strong> <Tag :value="detail.payload.category || 'other'" :severity="issueCategorySeverity(detail.payload.category)" /></div>
                    <div class="mb-2"><strong>What:</strong> {{ detail.payload.detail }}</div>
                    <div v-if="detail.payload.suggestion" class="mb-2 text-600 italic"><strong>Fix idea:</strong> {{ detail.payload.suggestion }}</div>
                </template>

                <div class="field mt-3">
                    <label class="text-xs font-bold text-500 uppercase block mb-1">Reviewer note</label>
                    <Textarea v-model="detail.note" rows="2" class="w-full" placeholder="Optional note saved with your decision" />
                </div>

                <div class="flex gap-2 mt-3">
                    <Button label="Accept" icon="pi pi-check" severity="success" :loading="!!deciding[detail.suggestion_id]" @click="decide(detail, 'accepted')" />
                    <Button label="Reject" icon="pi pi-times" severity="danger" :loading="!!deciding[detail.suggestion_id]" @click="decide(detail, 'rejected')" />
                    <Button v-if="detail.status !== 'pending'" label="Reset" icon="pi pi-undo" severity="secondary" text :loading="!!deciding[detail.suggestion_id]" @click="decide(detail, 'pending')" />
                </div>
                <div v-if="detail.decided_at" class="text-xs text-500 mt-2">
                    Last decided by {{ detail.reviewer || '—' }} at {{ formatTime(detail.decided_at) }}
                </div>
            </div>
        </Dialog>

        <!-- Scan / job detail dialog -->
        <Dialog
            :visible="scanDetailVisible"
            modal
            dismissable-mask
            :style="{ width: '64rem', maxWidth: '96vw' }"
            @update:visible="scanDetailVisible = $event"
        >
            <template #header>
                <div class="flex align-items-center gap-2">
                    <i class="pi pi-server text-blue-500"></i>
                    <span class="font-medium">Scan detail</span>
                    <Tag v-if="scanDetail" :value="shortRunId(scanDetail.run_id)" severity="secondary" />
                </div>
            </template>
            <div v-if="scanDetail">
                <div class="text-xs text-500 mb-3">
                    <div v-if="scanDetail.device_label"><strong>Device:</strong> {{ scanDetail.device_label }}</div>
                    <div v-if="scanDetail.chipset"><strong>Chipset:</strong> {{ scanDetail.chipset }}</div>
                    <div><strong>Run:</strong> <code>{{ scanDetail.run_id }}</code></div>
                    <div><strong>SHA:</strong> <code>{{ scanDetail.firmware_sha256 }}</code></div>
                    <div><strong>Analyzed:</strong> {{ formatTime(scanDetail.analyzed_at) }}</div>
                </div>

                <div v-if="scanDetailLoading" class="text-center p-4">
                    <ProgressSpinner style="width:36px;height:36px" />
                    <div class="text-sm text-500 mt-2">Loading scan report…</div>
                </div>
                <Message v-else-if="scanDetailError" severity="error" :closable="false">
                    Couldn't load scan report: {{ scanDetailError }}
                </Message>
                <DataTable
                    v-else
                    :value="scanDetail.sections"
                    responsive-layout="scroll"
                    class="p-datatable-sm"
                    :rows="50"
                >
                    <template #empty>
                        <div class="text-center text-500 p-3">No section results in this scan's report.</div>
                    </template>
                    <Column header="Section" field="section_id" style="min-width: 10rem">
                        <template #body="{ data }"><code class="text-xs">{{ data.section_id }}</code></template>
                    </Column>
                    <Column header="Status" style="width: 9rem">
                        <template #body="{ data }">
                            <Tag :value="data.status" :severity="sectionStatusSeverity(data.status)" />
                        </template>
                    </Column>
                    <Column header="Verdict" field="verdict" style="min-width: 10rem">
                        <template #body="{ data }">
                            <span class="text-sm">{{ data.verdict || '—' }}</span>
                            <span v-if="data.confidence" class="text-xs text-500"> ({{ data.confidence }})</span>
                        </template>
                    </Column>
                    <Column header="Detail" field="detail" style="min-width: 20rem">
                        <template #body="{ data }">
                            <div class="text-xs text-600 detail-cell">{{ data.detail || '' }}</div>
                        </template>
                    </Column>
                </DataTable>
            </div>
        </Dialog>
    </div>
</template>

<style scoped>
/* --- Single-line cell layouts --- */
.scan-job-cell {
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.2rem;
}

.suggestion-cell {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
}

.suggestion-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.82rem;
    flex: 1;
    min-width: 0;
}

.suggestion-detail-btn {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
}

.type-cell {
    display: flex;
    align-items: center;
    white-space: nowrap;
    gap: 0.2rem;
}

/* --- Scan link --- */
.scan-link {
    text-decoration: none;
    cursor: pointer;
}
.scan-link:hover {
    text-decoration: underline;
}

/* --- Detail dialog content --- */
.detail-cell {
    line-height: 1.4;
    max-width: 32rem;
    max-height: 6rem;
    overflow: auto;
}

/* --- Compact paginator and group headers --- */
.ai-suggestions-review :deep(.p-paginator) {
    padding: 0.25rem 0;
}
.ai-suggestions-review :deep(.p-paginator .p-paginator-page) {
    min-width: 2rem;
    height: 2rem;
}
.ai-suggestions-review :deep(.p-rowgroup-header td) {
    padding: 0.25rem 0.5rem;
}
</style>
