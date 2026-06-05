<script>
// Batch Runs tab — rolls up the many individual jobs from a single batch
// (e.g. a pool analyze run) into one reviewable group. Read-only in Phase 1:
// list groups, drill into members, open a member's progress/report in the
// parent's shared sidebar. Stop / Delete / Generate Insights land in later
// phases and are rendered as disabled affordances so the layout is stable.
export default {
    name: 'BatchRunsTab',
    props: {
        apiBase: { type: String, default: '' },
        network: { type: String, default: 'testnet' }
    },
    emits: ['open-report', 'open-progress', 'rerun-done'],
    data() {
        return {
            loading: false,
            error: null,
            groups: [],
            statusCounts: {},
            expandedRows: [],
            memberState: {}, // group_id -> { loading, error, members }
            pollTimer: null,
            deleteDialog: { visible: false, group: null, purgeResults: false },
            insights: { visible: false, group: null, loading: false, status: 'none', doc: null, error: null, progress: null, startedAt: null },
            insightsPollTimer: null,
            insightsPollCount: 0,
            showInfoIssues: false,
            nowMs: Date.now()
        };
    },
    computed: {
        hasActive() {
            return this.groups.some((g) => g.status === 'running');
        },
        // v2 insights expose a canonical `issues` array; older docs fall back to
        // the legacy per-perspective tabs.
        useIssuesLayout() {
            return Array.isArray(this.insights.doc?.issues);
        },
        insightIssues() {
            return Array.isArray(this.insights.doc?.issues) ? this.insights.doc.issues : [];
        },
        reviewIssues() {
            return this.insightIssues.filter((i) => i.recommend_review);
        },
        infoIssues() {
            return this.insightIssues.filter((i) => !i.recommend_review);
        },
        insightsElapsedLabel() {
            const started = this.insights.startedAt;
            if (!started) return '';
            const t0 = Date.parse(started);
            if (Number.isNaN(t0)) return '';
            const secs = Math.max(0, Math.round((this.nowMs - t0) / 1000));
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return m > 0 ? `${m}m ${s}s` : `${s}s`;
        },
        insightsStageLabel() {
            const stage = String(this.insights.progress?.stage || '');
            if (stage === 'perspective:fleet') return 'Clustering the fleet…';
            if (stage === 'perspective:pipeline') return 'Reviewing pipeline & KB health…';
            if (stage === 'enrichment') return 'Triaging findings…';
            if (stage === 'synthesis') return 'Synthesising the executive view…';
            if (this.insights.status === 'pending') return 'Queued — waiting for a worker…';
            return 'Generating insights…';
        },
        insightsProgressDetail() {
            const parts = [];
            const p = this.insights.progress;
            if (p && Number.isFinite(p.total) && p.total > 0) {
                const step = Math.min((Number(p.completed) || 0) + 1, p.total);
                parts.push(`Step ${step} of ${p.total}`);
            }
            if (this.insightsElapsedLabel) parts.push(`${this.insightsElapsedLabel} elapsed`);
            return parts.join(' · ');
        }
    },
    watch: {
        network(next, prev) {
            if (next !== prev) {
                this.expandedRows = [];
                this.memberState = {};
                this.loadGroups();
            }
        }
    },
    mounted() {
        this.loadGroups();
        // Light auto-refresh so a running batch's rollup ticks forward. The poll
        // is a no-op for the network unless something is active.
        this.pollTimer = setInterval(() => {
            if (this.hasActive) this.refreshLive();
        }, 5000);
    },
    beforeUnmount() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.clearInsightsPoll();
    },
    methods: {
        // `silent` background refreshes update data in place without toggling the
        // DataTable loading mask / member spinners — otherwise the 5s poll causes
        // a dark overlay to flash on every cycle.
        async loadGroups({ silent = false } = {}) {
            if (!this.apiBase) {
                this.error = 'Missing MatterOverwatch API base.';
                return;
            }
            if (!silent) {
                this.loading = true;
                this.error = null;
            }
            try {
                const query = new URLSearchParams({ network: this.network });
                const response = await fetch(`${this.apiBase}/api/v1/job-groups?${query.toString()}`);
                if (!response.ok) throw new Error(`Job groups request failed (${response.status})`);
                const payload = await response.json();
                this.groups = Array.isArray(payload.items) ? payload.items : [];
                this.statusCounts = payload.status_counts || {};
                if (silent) this.error = null;
            } catch (err) {
                // On a silent poll, keep the current rows instead of wiping them.
                if (!silent) {
                    this.error = err instanceof Error ? err.message : 'Failed to load job groups';
                    this.groups = [];
                }
            } finally {
                if (!silent) this.loading = false;
            }
        },
        async refreshLive() {
            await this.loadGroups({ silent: true });
            // Keep any open expansions in sync with the live rollup (also silent).
            for (const row of this.expandedRows) {
                if (row?.group_id) this.loadGroupDetail(row.group_id, { silent: true });
            }
        },
        async onRowExpand(event) {
            const groupId = event?.data?.group_id;
            if (groupId) await this.loadGroupDetail(groupId);
        },
        async loadGroupDetail(groupId, { silent = false } = {}) {
            if (!this.apiBase || !groupId) return;
            const prev = this.memberState[groupId];
            if (!silent) {
                this.memberState = { ...this.memberState, [groupId]: { loading: true, error: null, members: prev?.members || [] } };
            }
            try {
                const query = new URLSearchParams({ limit: '500' });
                const response = await fetch(`${this.apiBase}/api/v1/job-groups/${encodeURIComponent(groupId)}?${query.toString()}`);
                if (!response.ok) throw new Error(`Group detail request failed (${response.status})`);
                const payload = await response.json();
                this.memberState = {
                    ...this.memberState,
                    [groupId]: { loading: false, error: null, members: Array.isArray(payload.members) ? payload.members : [] }
                };
            } catch (err) {
                // Silent poll failure: keep the members already shown.
                if (!silent) {
                    this.memberState = {
                        ...this.memberState,
                        [groupId]: { loading: false, error: err instanceof Error ? err.message : 'Failed', members: prev?.members || [] }
                    };
                }
            }
        },
        membersFor(groupId) {
            return this.memberState[groupId]?.members || [];
        },
        isMembersLoading(groupId) {
            return !!this.memberState[groupId]?.loading;
        },
        emitOpenReport(member) {
            const resultId = String(member?.output_result_id || '').trim();
            if (!resultId) return;
            this.$emit('open-report', { result_id: resultId, firmware_sha256: member.firmware_sha256, source_rel_path: member.source_rel_path });
        },
        emitOpenProgress(jobId) {
            if (jobId) this.$emit('open-progress', jobId);
        },
        async rerunJob(groupId, member) {
            const jobId = String(member?.job_id || '').trim();
            if (!this.apiBase || !groupId || !jobId) return;
            try {
                const response = await fetch(
                    `${this.apiBase}/api/v1/job-groups/${encodeURIComponent(groupId)}/jobs/${encodeURIComponent(jobId)}/rerun`,
                    { method: 'POST' }
                );
                if (!response.ok) {
                    let detail = `Re-run failed (${response.status})`;
                    try {
                        const body = await response.json();
                        if (body.detail) detail = body.detail;
                    } catch (_) { /* ignore */ }
                    throw new Error(detail);
                }
                this.$toast?.add({ severity: 'success', summary: 'Re-run queued', detail: 'The job has been re-queued within this group.', life: 3000 });
                this.$emit('rerun-done');
                await this.loadGroupDetail(groupId);
                await this.loadGroups();
            } catch (err) {
                this.$toast?.add({ severity: 'error', summary: 'Re-run failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
            }
        },
        confirmStop(group) {
            if (!group?.group_id) return;
            this.$confirm.require({
                message: `Stop all queued and running jobs in "${group.title}"? Finished jobs are kept.`,
                header: 'Stop batch',
                icon: 'pi pi-exclamation-triangle',
                acceptClass: 'p-button-warning',
                acceptLabel: 'Stop batch',
                rejectLabel: 'Cancel',
                accept: () => this.doStop(group)
            });
        },
        async doStop(group) {
            if (!this.apiBase || !group?.group_id) return;
            try {
                const response = await fetch(`${this.apiBase}/api/v1/job-groups/${encodeURIComponent(group.group_id)}/stop`, { method: 'POST' });
                if (!response.ok) throw new Error(`Stop failed (${response.status})`);
                const data = await response.json();
                this.$toast?.add({ severity: 'success', summary: 'Batch stopped', detail: `Stopped ${data.stopped} of ${data.total_members} job(s).`, life: 3000 });
                await this.refreshLive();
            } catch (err) {
                this.$toast?.add({ severity: 'error', summary: 'Stop failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
            }
        },
        openDeleteDialog(group) {
            this.deleteDialog = { visible: true, group, purgeResults: false };
        },
        async doDelete() {
            const group = this.deleteDialog.group;
            if (!this.apiBase || !group?.group_id) return;
            const purge = !!this.deleteDialog.purgeResults;
            try {
                const query = new URLSearchParams({ purge_results: purge ? 'true' : 'false' });
                const response = await fetch(`${this.apiBase}/api/v1/job-groups/${encodeURIComponent(group.group_id)}?${query.toString()}`, { method: 'DELETE' });
                if (!response.ok) throw new Error(`Delete failed (${response.status})`);
                const data = await response.json();
                const extra = purge ? `, purged ${data.purged_results} result(s)` : '';
                this.$toast?.add({ severity: 'success', summary: 'Batch deleted', detail: `Removed ${data.deleted_jobs} job record(s)${extra}.`, life: 3500 });
                this.deleteDialog.visible = false;
                this.expandedRows = this.expandedRows.filter((r) => r.group_id !== group.group_id);
                await this.loadGroups();
            } catch (err) {
                this.$toast?.add({ severity: 'error', summary: 'Delete failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
            }
        },
        async openInsights(group) {
            if (!group?.group_id) return;
            this.showInfoIssues = false;
            this.nowMs = Date.now();
            this.insights = { visible: true, group, loading: true, status: 'none', doc: null, error: null, progress: null, startedAt: null };
            await this.loadInsights(group.group_id);
            if (this.insights.status === 'running' || this.insights.status === 'pending') {
                this.scheduleInsightsPoll(group.group_id);
            }
        },
        async loadInsights(groupId) {
            if (!this.apiBase || !groupId) return;
            try {
                const response = await fetch(`${this.apiBase}/api/v1/job-groups/${encodeURIComponent(groupId)}/insights`);
                if (!response.ok) throw new Error(`Insights request failed (${response.status})`);
                const data = await response.json();
                this.insights.status = data.status;
                this.insights.doc = data.insights;
                this.insights.progress = data.progress || null;
                this.insights.startedAt = data.started_at || null;
                this.insights.loading = false;
            } catch (err) {
                this.insights.loading = false;
                this.insights.error = err instanceof Error ? err.message : 'Failed to load insights';
            }
        },
        scheduleInsightsPoll(groupId) {
            this.clearInsightsPoll();
            this.insightsPollCount = 0;
            // 1s ticker: refresh the elapsed clock every second, hit the server
            // every 4s, and keep polling for as long as the job stays running —
            // generation runs server-side with no time limit, so there is no
            // premature client timeout. A generous safety stop only guards against
            // a zombie timer if the backend dies without ever updating status.
            const SAFETY_TICKS = 10800; // ~3h at 1s
            this.insightsPollTimer = setInterval(async () => {
                if (!this.insights.visible) {
                    this.clearInsightsPoll();
                    return;
                }
                this.nowMs = Date.now();
                this.insightsPollCount += 1;
                if (this.insightsPollCount > SAFETY_TICKS) {
                    this.clearInsightsPoll();
                    this.insights.error = 'Still running after a long time — check the worker process or the job transcripts.';
                    return;
                }
                if (this.insightsPollCount % 4 !== 0) return; // server poll every 4s
                await this.loadInsights(groupId);
                if (this.insights.status !== 'running' && this.insights.status !== 'pending') {
                    this.clearInsightsPoll();
                }
            }, 1000);
        },
        clearInsightsPoll() {
            if (this.insightsPollTimer) {
                clearInterval(this.insightsPollTimer);
                this.insightsPollTimer = null;
            }
            this.insightsPollCount = 0;
        },
        async generateInsights(group) {
            const g = group || this.insights.group;
            if (!this.apiBase || !g?.group_id) return;
            this.insights.loading = true;
            this.insights.error = null;
            try {
                const response = await fetch(`${this.apiBase}/api/v1/job-groups/${encodeURIComponent(g.group_id)}/insights`, { method: 'POST' });
                if (!response.ok) {
                    let detail = `Generate failed (${response.status})`;
                    try {
                        const body = await response.json();
                        if (body.detail === 'no_completed_scans') detail = 'This batch has no completed scans to analyze yet.';
                    } catch (_) { /* ignore */ }
                    throw new Error(detail);
                }
                this.insights.status = 'running';
                this.$toast?.add({ severity: 'info', summary: 'Generating insights', detail: 'Analyzing the batch across multiple perspectives…', life: 3000 });
                this.scheduleInsightsPoll(g.group_id);
                await this.loadGroups();
            } catch (err) {
                this.insights.loading = false;
                this.insights.error = err instanceof Error ? err.message : 'Failed to start insights';
                this.$toast?.add({ severity: 'warn', summary: 'Could not generate insights', detail: this.insights.error, life: 5000 });
            }
        },
        findingSeverity(sev) {
            const k = String(sev || '').toLowerCase();
            if (k === 'critical' || k === 'high') return 'danger';
            if (k === 'medium') return 'warning';
            if (k === 'low') return 'info';
            return 'secondary';
        },
        issueTitle(issue) {
            return String(issue?.summary || issue?.verdict || issue?.section_id || 'finding');
        },
        shortRid(rid) {
            const s = String(rid || '');
            return s.length > 10 ? `${s.slice(0, 8)}…` : s;
        },
        // Click-through from an issue's affected list: hand the result_id to the
        // parent's report sidebar and close the modal so the report is visible.
        openResultFromInsights(resultId) {
            const id = String(resultId || '').trim();
            if (!id) return;
            this.$emit('open-report', { result_id: id });
            this.insights.visible = false;
        },
        groupStatusSeverity(status) {
            const key = String(status || '').toLowerCase();
            if (key === 'completed') return 'success';
            if (key === 'running') return 'info';
            if (key === 'completed_with_failures') return 'warning';
            if (key === 'failed') return 'danger';
            return 'secondary'; // stopped / empty
        },
        groupStatusLabel(status) {
            const map = {
                running: 'Running',
                completed: 'Completed',
                completed_with_failures: 'Completed · failures',
                failed: 'Failed',
                stopped: 'Stopped',
                empty: 'Empty'
            };
            return map[String(status || '').toLowerCase()] || status || '-';
        },
        memberStatusSeverity(status) {
            const key = String(status || '').toLowerCase();
            if (key === 'done') return 'success';
            if (key === 'failed') return 'danger';
            if (key === 'running') return 'info';
            return 'warning';
        },
        isActive(status) {
            return String(status || '').toLowerCase() === 'running';
        },
        formatTimestamp(value) {
            if (!value) return '-';
            const dt = new Date(value);
            if (Number.isNaN(dt.getTime())) return String(value);
            return dt.toLocaleString();
        },
        shortId(value) {
            const text = String(value || '').trim();
            return text ? text.slice(0, 8) : '-';
        },
        shortSha(value) {
            const text = String(value || '').trim();
            if (!text) return '-';
            return text.length <= 16 ? text : `${text.slice(0, 8)}…${text.slice(-6)}`;
        },
        pathTail(value) {
            const text = String(value || '').trim();
            if (!text) return '-';
            const parts = text.split(/[\\/]/).filter(Boolean);
            return parts.length ? parts[parts.length - 1] : '-';
        },
        findingBadgeClass(counts) {
            if (!counts) return '';
            if (counts.critical || counts.high) return 'finding-badge--danger';
            if (counts.medium) return 'finding-badge--warning';
            return 'finding-badge--info';
        },
        findingTooltip(counts) {
            if (!counts) return '';
            const parts = [];
            if (counts.total) parts.push(`${counts.total} finding${counts.total === 1 ? '' : 's'}`);
            const sev = [];
            if (counts.critical) sev.push(`${counts.critical} critical`);
            if (counts.high) sev.push(`${counts.high} high`);
            if (counts.medium) sev.push(`${counts.medium} medium`);
            if (counts.low) sev.push(`${counts.low} low`);
            if (counts.info) sev.push(`${counts.info} info`);
            if (sev.length) parts.push(`(${sev.join(', ')})`);
            return parts.join(' ');
        }
    }
};
</script>

<template>
    <div class="batch-runs-tab">
        <div class="flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
            <div class="flex align-items-center gap-2 flex-wrap">
                <span class="font-semibold text-lg">Batch Runs</span>
                <Tag :value="`${groups.length} group${groups.length === 1 ? '' : 's'}`" severity="info" />
                <Tag v-if="statusCounts.running" :value="`${statusCounts.running} running`" severity="info" />
                <Tag v-if="statusCounts.completed_with_failures" :value="`${statusCounts.completed_with_failures} w/ failures`" severity="warning" />
                <Tag v-if="statusCounts.failed" :value="`${statusCounts.failed} failed`" severity="danger" />
            </div>
            <Button icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded" :loading="loading" v-tooltip.top="'Refresh batch runs'" @click="loadGroups" />
        </div>

        <Message v-if="error" severity="error" :closable="false" class="mb-2">{{ error }}</Message>

        <DataTable
            :value="groups"
            v-model:expandedRows="expandedRows"
            dataKey="group_id"
            :loading="loading"
            @row-expand="onRowExpand"
            responsiveLayout="scroll"
            class="p-datatable-sm batch-runs-table"
        >
            <Column :expander="true" headerStyle="width:3rem" />

            <Column header="Batch">
                <template #body="{ data }">
                    <div class="flex flex-column">
                        <span class="font-medium">{{ data.title }}</span>
                        <span class="text-xs text-500 font-mono select-all">{{ data.group_id }}</span>
                        <span class="text-xs text-500">
                            {{ formatTimestamp(data.created_at || data.first_requested_at) }}
                            <span v-if="data.is_synthetic" class="ml-1" v-tooltip.top="'Grouped automatically from legacy jobs'">· auto</span>
                        </span>
                    </div>
                </template>
            </Column>

            <Column header="Progress" headerStyle="min-width:12rem">
                <template #body="{ data }">
                    <div class="progress-cell">
                        <ProgressBar :value="data.progress_percent" :showValue="false" style="height: 8px" />
                        <span class="text-xs text-600">{{ data.counts.done + data.counts.failed }} / {{ data.total }}</span>
                    </div>
                </template>
            </Column>

            <Column header="Status">
                <template #body="{ data }">
                    <Tag :value="groupStatusLabel(data.status)" :severity="groupStatusSeverity(data.status)" />
                </template>
            </Column>

            <Column header="Breakdown" headerStyle="min-width:12rem">
                <template #body="{ data }">
                    <div class="flex align-items-center gap-2 text-sm count-chips">
                        <span class="chip-done" v-tooltip.top="'Finished'"><i class="pi pi-check-circle"></i> {{ data.counts.done }}</span>
                        <span class="chip-run" v-tooltip.top="'Running'"><i class="pi pi-spin pi-spinner"></i> {{ data.counts.running }}</span>
                        <span class="chip-pend" v-tooltip.top="'Pending'"><i class="pi pi-clock"></i> {{ data.counts.pending }}</span>
                        <span class="chip-fail" v-tooltip.top="'Failed'"><i class="pi pi-times-circle"></i> {{ data.counts.failed }}</span>
                    </div>
                </template>
            </Column>

            <Column header="Actions" headerStyle="min-width:9rem">
                <template #body="{ data }">
                    <div class="flex align-items-center gap-1">
                        <Button
                            icon="pi pi-bolt"
                            class="p-button-sm p-button-text"
                            :class="data.insights_status === 'done' ? 'p-button-success' : ''"
                            v-tooltip.top="data.insights_status === 'done' ? 'View AI insights' : (data.insights_status === 'running' || data.insights_status === 'pending' ? 'Insights generating…' : 'Generate AI insights')"
                            @click.stop="openInsights(data)"
                        />
                        <Button
                            v-if="data.status === 'running'"
                            icon="pi pi-stop-circle"
                            class="p-button-sm p-button-text p-button-warning"
                            v-tooltip.top="'Stop batch'"
                            @click.stop="confirmStop(data)"
                        />
                        <Button
                            icon="pi pi-trash"
                            class="p-button-sm p-button-text p-button-danger"
                            v-tooltip.top="'Delete batch'"
                            @click.stop="openDeleteDialog(data)"
                        />
                    </div>
                </template>
            </Column>

            <template #expansion="{ data }">
                <div class="member-panel">
                    <div v-if="isMembersLoading(data.group_id)" class="flex align-items-center gap-2 p-2 text-500">
                        <ProgressSpinner style="width: 1.2rem; height: 1.2rem" strokeWidth="6" />
                        <span>Loading jobs…</span>
                    </div>
                    <DataTable
                        v-else
                        :value="membersFor(data.group_id)"
                        responsiveLayout="scroll"
                        class="p-datatable-sm member-table"
                        :rows="20"
                        paginator
                        :rowsPerPageOptions="[20, 50, 100]"
                    >
                        <Column header="Status" headerStyle="width:7rem">
                            <template #body="{ data: m }">
                                <Tag :value="m.status" :severity="memberStatusSeverity(m.status)" />
                            </template>
                        </Column>
                        <Column header="Firmware">
                            <template #body="{ data: m }">
                                <div class="flex align-items-center gap-1 flex-wrap">
                                    <code class="text-xs">{{ shortSha(m.firmware_sha256) }}</code>
                                    <Tag v-if="m.replaced_by_job_id" value="superseded" severity="warning" class="version-tag" v-tooltip.top="`Replaced by ${shortId(m.replaced_by_job_id)}`" />
                                    <Tag v-else-if="m.replaces_job_id" value="re-run" severity="info" class="version-tag" v-tooltip.top="`Re-run of ${shortId(m.replaces_job_id)}`" />
                                </div>
                                <span v-if="m.source_rel_path" class="text-xs text-500 ml-2">{{ pathTail(m.source_rel_path) }}</span>
                            </template>
                        </Column>
                        <Column header="Job" headerStyle="width:6rem">
                            <template #body="{ data: m }"><code class="text-xs">{{ shortId(m.job_id) }}</code></template>
                        </Column>
                        <Column header="Updated" headerStyle="min-width:10rem">
                            <template #body="{ data: m }">{{ formatTimestamp(m.finished_at || m.started_at || m.requested_at) }}</template>
                        </Column>
                        <Column header="Actions" headerStyle="width:11rem">
                            <template #body="{ data: m }">
                                <div class="flex align-items-center gap-1">
                                    <Button
                                        v-if="m.status === 'running' || m.status === 'pending'"
                                        icon="pi pi-chart-line"
                                        class="p-button-sm p-button-text"
                                        v-tooltip.top="'View progress'"
                                        @click="emitOpenProgress(m.job_id)"
                                    />
                                    <template v-else>
                                        <!-- Finding count badge -->
                                        <span
                                            v-if="m.finding_counts && m.finding_counts.total > 0"
                                            class="finding-badge"
                                            :class="findingBadgeClass(m.finding_counts)"
                                            v-tooltip.top="findingTooltip(m.finding_counts)"
                                        >
                                            <i class="pi pi-exclamation-triangle" />
                                            <span>{{ m.finding_counts.total }}</span>
                                        </span>
                                        <Button
                                            icon="pi pi-file"
                                            class="p-button-sm p-button-text"
                                            :disabled="!m.output_result_id"
                                            v-tooltip.top="m.output_result_id ? 'View report' : 'No report (job did not finish)'"
                                            @click="emitOpenReport(m)"
                                        />
                                        <Button
                                            icon="pi pi-refresh"
                                            class="p-button-sm p-button-text p-button-info"
                                            v-tooltip.top="'Re-run this job within the group'"
                                            @click="rerunJob(data.group_id, m)"
                                        />
                                    </template>
                                </div>
                            </template>
                        </Column>
                    </DataTable>
                    <div v-if="!isMembersLoading(data.group_id) && membersFor(data.group_id).length === 0" class="p-2 text-500 text-sm">No jobs in this batch.</div>
                </div>
            </template>
        </DataTable>

        <div v-if="!loading && groups.length === 0 && !error" class="flex flex-column align-items-center justify-content-center p-5 text-500">
            <i class="pi pi-inbox text-4xl mb-3"></i>
            <span class="text-lg">No batch runs yet.</span>
            <span class="text-sm">Batches you launch from the firmware pool will roll up here.</span>
        </div>

        <Dialog v-model:visible="deleteDialog.visible" modal header="Delete batch" :style="{ width: '32rem' }">
            <p class="mt-0">
                Delete <strong>{{ deleteDialog.group?.title }}</strong>?
            </p>
            <p class="text-sm text-600">
                This removes the batch's job records from the queue. By default the underlying scan results are kept and remain visible under
                <strong>All Scans</strong>.
            </p>
            <Message v-if="deleteDialog.group?.status === 'running'" severity="warn" :closable="false" class="mb-2">
                This batch is still running. Active jobs will be stopped before deletion; a job mid-analysis may leave one final "stopped" record.
            </Message>
            <div class="flex align-items-center gap-2 mt-2">
                <Checkbox v-model="deleteDialog.purgeResults" :binary="true" inputId="purgeResults" />
                <label for="purgeResults" class="text-sm">Also delete the underlying scan results (cannot be undone)</label>
            </div>
            <template #footer>
                <Button label="Cancel" class="p-button-text" @click="deleteDialog.visible = false" />
                <Button
                    :label="deleteDialog.purgeResults ? 'Delete batch + results' : 'Delete batch'"
                    icon="pi pi-trash"
                    class="p-button-danger"
                    @click="doDelete"
                />
            </template>
        </Dialog>

        <!-- ===== AI Insights panel ===== -->
        <Dialog
            v-model:visible="insights.visible"
            modal
            :style="{ width: '52rem' }"
            :breakpoints="{ '960px': '95vw' }"
            @hide="clearInsightsPoll"
        >
            <template #header>
                <div class="flex align-items-center gap-2">
                    <i class="pi pi-bolt text-yellow-500"></i>
                    <span class="font-bold">AI Insights</span>
                    <span class="text-sm text-500">{{ insights.group?.title }}</span>
                </div>
            </template>

            <Message v-if="insights.error" severity="warn" :closable="false" class="mb-2">{{ insights.error }}</Message>

            <div v-if="insights.loading || insights.status === 'running' || insights.status === 'pending'" class="flex flex-column align-items-center justify-content-center p-5 gap-2 text-500">
                <ProgressSpinner style="width: 2.5rem; height: 2.5rem" strokeWidth="6" />
                <span class="text-lg">{{ insightsStageLabel }}</span>
                <span v-if="insightsProgressDetail" class="text-sm">{{ insightsProgressDetail }}</span>
                <span class="text-xs text-400 mt-2 text-center">Runs in the background — you can close this dialog; progress is kept and resumes when you reopen it.</span>
            </div>

            <div v-else-if="insights.status === 'none'" class="flex flex-column align-items-center justify-content-center p-5 gap-3 text-500">
                <i class="pi pi-bolt text-4xl text-yellow-500"></i>
                <span class="text-lg">No insights generated yet.</span>
                <span class="text-sm text-center">Generate an AI review of this batch: a deduplicated, severity-ranked list of issues worth manual review, plus fleet clustering and pipeline / KB health.</span>
                <Button label="Generate insights" icon="pi pi-bolt" @click="generateInsights(insights.group)" />
            </div>

            <div v-else-if="insights.doc">
                <!-- Synthesis -->
                <div v-if="insights.doc.synthesis && insights.doc.synthesis.headline" class="synthesis-card mb-3">
                    <div class="flex align-items-center gap-2 mb-2">
                        <Tag :value="(insights.doc.synthesis.risk_level || 'info').toUpperCase()" :severity="findingSeverity(insights.doc.synthesis.risk_level)" />
                        <span class="font-bold text-lg">{{ insights.doc.synthesis.headline }}</span>
                    </div>
                    <div v-if="(insights.doc.synthesis.key_takeaways || []).length" class="mb-2">
                        <div class="text-xs uppercase text-500 mb-1">Key takeaways</div>
                        <ul class="m-0 pl-3">
                            <li v-for="(t, i) in insights.doc.synthesis.key_takeaways" :key="`kt-${i}`" class="text-sm">{{ t }}</li>
                        </ul>
                    </div>
                    <div v-if="(insights.doc.synthesis.prioritized_actions || []).length">
                        <div class="text-xs uppercase text-500 mb-1">Prioritized actions</div>
                        <ol class="m-0 pl-3">
                            <li v-for="(a, i) in insights.doc.synthesis.prioritized_actions" :key="`pa-${i}`" class="text-sm">{{ a }}</li>
                        </ol>
                    </div>
                </div>

                <!-- Issues to review (v2 canonical list) + cohort perspective tabs -->
                <TabView>
                    <TabPanel v-if="useIssuesLayout" :header="reviewIssues.length ? `Issues to review (${reviewIssues.length})` : 'Issues to review'">
                        <Message v-if="insights.doc.issues_status === 'failed'" severity="warn" :closable="false" class="mb-2">
                            AI triage was unavailable — showing deterministic findings with mapped severity.
                        </Message>
                        <Message v-else-if="insights.doc.issues_status === 'partial'" severity="info" :closable="false" class="mb-2">
                            AI triage partially completed — some findings show mapped severity only.
                        </Message>

                        <div v-if="insightIssues.length === 0" class="text-500 text-sm">No findings extracted from this batch.</div>

                        <!-- review-worthy issues, highest severity / prevalence first -->
                        <div v-for="(it, i) in reviewIssues" :key="`iss-${it.finding_id || i}`" class="finding-row">
                            <div class="flex align-items-center gap-2 mb-1 flex-wrap">
                                <Tag :value="(it.severity || 'info').toUpperCase()" :severity="findingSeverity(it.severity)" />
                                <span class="font-semibold text-sm">{{ issueTitle(it) }}</span>
                                <Tag v-if="it.affected_count > 1" :value="`${it.affected_count} firmwares`" severity="info" class="affected-count-tag" />
                                <Tag v-if="it.section_id" :value="it.section_id" severity="secondary" class="section-tag" />
                            </div>
                            <div v-if="it.why" class="text-sm text-700">{{ it.why }}</div>
                            <div v-else-if="it.detail" class="text-sm text-700 issue-detail">{{ it.detail }}</div>
                            <div v-if="(it.affected_result_ids || []).length" class="flex flex-wrap gap-1 mt-1 align-items-center">
                                <span class="text-xs text-500 mr-1">Affected:</span>
                                <Chip
                                    v-for="(rid, j) in it.affected_result_ids.slice(0, 12)"
                                    :key="`ar-${it.finding_id}-${j}`"
                                    :label="shortRid(rid)"
                                    class="text-xs affected-chip"
                                    @click="openResultFromInsights(rid)"
                                />
                                <span v-if="it.affected_result_ids.length > 12" class="text-xs text-500">+{{ it.affected_result_ids.length - 12 }} more</span>
                            </div>
                            <div v-if="(it.correlates_with || []).length" class="text-xs text-500 mt-1">
                                Correlates with: {{ it.correlates_with.join(', ') }}
                            </div>
                        </div>
                        <div v-if="reviewIssues.length === 0 && insightIssues.length" class="text-500 text-sm">Nothing flagged for manual review.</div>

                        <!-- informational / benign findings, collapsed by default -->
                        <div v-if="infoIssues.length" class="mt-3">
                            <Button
                                :label="`${showInfoIssues ? 'Hide' : 'Show'} ${infoIssues.length} informational finding${infoIssues.length === 1 ? '' : 's'}`"
                                :icon="showInfoIssues ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                                class="p-button-text p-button-sm"
                                @click="showInfoIssues = !showInfoIssues"
                            />
                            <template v-if="showInfoIssues">
                                <div v-for="(it, i) in infoIssues" :key="`info-${it.finding_id || i}`" class="finding-row finding-row--muted">
                                    <div class="flex align-items-center gap-2 mb-1 flex-wrap">
                                        <Tag :value="(it.severity || 'info').toUpperCase()" :severity="findingSeverity(it.severity)" />
                                        <span class="font-semibold text-sm">{{ issueTitle(it) }}</span>
                                        <Tag v-if="it.affected_count > 1" :value="`${it.affected_count} firmwares`" severity="info" class="affected-count-tag" />
                                        <Tag v-if="it.section_id" :value="it.section_id" severity="secondary" class="section-tag" />
                                    </div>
                                    <div v-if="it.detail" class="text-sm text-700 issue-detail">{{ it.detail }}</div>
                                    <div v-if="(it.affected_result_ids || []).length" class="flex flex-wrap gap-1 mt-1 align-items-center">
                                        <span class="text-xs text-500 mr-1">Affected:</span>
                                        <Chip
                                            v-for="(rid, j) in it.affected_result_ids.slice(0, 12)"
                                            :key="`info-ar-${it.finding_id}-${j}`"
                                            :label="shortRid(rid)"
                                            class="text-xs affected-chip"
                                            @click="openResultFromInsights(rid)"
                                        />
                                        <span v-if="it.affected_result_ids.length > 12" class="text-xs text-500">+{{ it.affected_result_ids.length - 12 }} more</span>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </TabPanel>

                    <TabPanel v-for="(persp, key) in insights.doc.perspectives" :key="key" :header="persp.label || key">
                        <Message v-if="persp.status === 'failed'" severity="error" :closable="false">
                            This perspective failed to generate: {{ persp.error }}
                        </Message>
                        <template v-else>
                            <p class="text-sm">{{ persp.summary }}</p>
                            <div v-if="(persp.findings || []).length === 0" class="text-500 text-sm">No findings.</div>
                            <div v-for="(f, i) in (persp.findings || [])" :key="`f-${key}-${i}`" class="finding-row">
                                <div class="flex align-items-center gap-2 mb-1">
                                    <Tag :value="(f.severity || 'info').toUpperCase()" :severity="findingSeverity(f.severity)" />
                                    <span class="font-semibold text-sm">{{ f.title }}</span>
                                    <Tag v-if="f.affected_count && f.affected_count > 1" :value="`${f.affected_count} firmwares`" severity="info" class="affected-count-tag" />
                                </div>
                                <div class="text-sm text-700">{{ f.detail }}</div>
                                <div v-if="(f.affected || []).length" class="flex flex-wrap gap-1 mt-1">
                                    <Chip v-for="(a, j) in f.affected" :key="`a-${key}-${i}-${j}`" :label="String(a)" class="text-xs" />
                                </div>
                            </div>
                        </template>
                    </TabPanel>
                </TabView>

                <div v-if="insights.doc.generated_at" class="text-xs text-500 mt-2">Generated {{ formatTimestamp(insights.doc.generated_at) }}</div>
            </div>

            <template #footer>
                <Button label="Close" class="p-button-text" @click="insights.visible = false" />
                <Button
                    v-if="insights.status === 'done' || insights.status === 'failed'"
                    label="Regenerate"
                    icon="pi pi-refresh"
                    class="p-button-outlined"
                    @click="generateInsights(insights.group)"
                />
            </template>
        </Dialog>
    </div>
</template>

<style scoped>
.batch-runs-tab :deep(.batch-runs-table .p-datatable-table) {
    min-width: 60rem;
}
.progress-cell {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.count-chips span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
}
.count-chips .chip-done {
    color: #16a34a;
}
.count-chips .chip-run {
    color: #2563eb;
}
.count-chips .chip-pend {
    color: #d97706;
}
.count-chips .chip-fail {
    color: #dc2626;
}
.member-panel {
    padding: 0.5rem 0.75rem;
    background: #f8fafc;
    border-radius: 8px;
}
.member-panel :deep(.member-table .p-datatable-table) {
    min-width: 40rem;
}
.synthesis-card {
    padding: 0.9rem 1rem;
    border: 1px solid #dbeafe;
    border-radius: 10px;
    background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
}
.finding-row {
    padding: 0.5rem 0;
    border-bottom: 1px dashed #e5e7eb;
}
.finding-row:last-child {
    border-bottom: none;
}
.finding-row--muted {
    opacity: 0.78;
}
.issue-detail {
    white-space: pre-line;
}
.section-tag {
    font-size: 0.7rem;
}
.affected-chip {
    cursor: pointer;
}
.affected-chip:hover {
    filter: brightness(0.95);
    text-decoration: underline;
}
.finding-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.4rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: default;
    white-space: nowrap;
}
.finding-badge--danger {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
}
.finding-badge--warning {
    background: #fffbeb;
    color: #d97706;
    border: 1px solid #fde68a;
}
.finding-badge--info {
    background: #f0f9ff;
    color: #0284c7;
    border: 1px solid #bae6fd;
}
</style>
