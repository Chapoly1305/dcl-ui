<script>
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';
import AiTranscriptDialog from '@/components/AiTranscriptDialog.vue';
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';
import BatchRunsTab from '@/components/BatchRunsTab.vue';

// Display config lives in utils/pipelineDisplay.js (shared with the live
// progress modal). Edit there to rename, add, or reorder stages — every UI
// surface picks up the change.
import { displayStagesRef, loadPipeline, aggregateDisplayStatus } from '@/utils/pipelineDisplay';
import PipelineStageTimeline from '@/components/PipelineStageTimeline.vue';

export default {
    name: 'FirmwareScanResults',
    components: { AiTranscriptDialog, FirmwareJobProgressModal, PipelineStageTimeline, BatchRunsTab },
    data() {
        const { requestBase } = resolveMatteroverwatchApiBase();
        return {
            apiBase: requestBase,
            topTabIndex: 0,
            loading: false,
            error: null,
            rows: [],
            totalCount: 0,
            pageSize: 20,
            pageFirst: 0,

            uiSortField: 'analyzed_at',
            sortOrder: -1,
            filters: {
                q: '',
                verdict: null,
                status: null,
                chipset: '',
                fromTime: null,
                toTime: null
            },
            verdictOptions: [
                { label: 'Pass', value: 'pass' },
                { label: 'Fail', value: 'fail' },
                { label: 'Pending', value: 'pending' },
                { label: 'Warning', value: 'warning' },
                { label: 'Unknown', value: 'unknown' }
            ],
            statusOptions: [
                { label: 'Success', value: 'success' },
                { label: 'Partial', value: 'partial' },
                { label: 'Failed', value: 'failed' }
            ],
            selectedResultId: '',
            detailLoading: false,
            detailError: null,

            detailPayload: {
                result: null,
                attempts: []
            },
            tableFiltersExpanded: false,
            detailTabIndex: 0,
            reportSidebarVisible: false,
            transcriptDialogVisible: false,
            transcriptSectionId: '',
            jobs: { pending: [], running: [], done: [], failed: [] },
            jobProgressDialogVisible: false,
            jobProgressJobId: ''
        };
    },
    computed: {
        selectedNetwork() {
            return this.normalizeNetwork(this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || 'testnet');
        },
        analysisJobs() {
            const filterFn = (j) => j.job_type === 'analyze' || j.job_type === 'rerun';
            return {
                pending: this.jobs.pending.filter(filterFn),
                running: this.jobs.running.filter(filterFn),
                done: this.jobs.done.filter(filterFn),
                failed: this.jobs.failed.filter(filterFn)
            };
        },
        analysisStats() {
            const { running, pending, done, failed } = this.analysisJobs;
            return { outstanding: running.length + pending.length, running: running.length, pending: pending.length, done: done.length, failed: failed.length };
        },
        analysisStatCards() {
            const s = this.analysisStats;
            return [
                { label: 'Active', value: s.running, icon: 'pi-spin pi-spinner', iconColor: 'text-purple-500', iconBg: 'bg-purple-100' },
                { label: 'Queued', value: s.pending, icon: 'pi-clock', iconColor: 'text-orange-500', iconBg: 'bg-orange-100' },
                { label: 'Completed', value: s.done, icon: 'pi-check-circle', iconColor: 'text-green-500', iconBg: 'bg-green-100' },
                { label: 'Failed', value: s.failed, icon: 'pi-exclamation-circle', iconColor: 'text-red-500', iconBg: 'bg-red-100' }
            ];
        },
        selectedResult() {
            return this.detailPayload?.result || null;
        },
        sanitizedReport() {
            return this.selectedResult?.sanitized_report || {};
        },
        reportOutputs() {
            return this.sanitizedReport?.outputs || {};
        },
        phaseIiReport() {
            return this.reportOutputs?.phase_ii || {};
        },
        dagData() {
            return this.phaseIiReport?.dag || null;
        },
        // Merge DCL provenance from Phase II Section provenance, filename parse, and backend enrichment
        dclProvenance() {
            const r = this.selectedResult;

            // Phase II Section provenance DCL records — richest source, use as-is
            const secA = this.checklistResults['provenance'];
            if (secA && secA.status === 'success' && secA.output && secA.output.dcl_records && secA.output.dcl_records.length > 0) {
                const dcl = secA.output.dcl_records[0];
                return {
                    vid: dcl.vid,
                    pid: dcl.pid,
                    vendor_name: dcl.vendor_name || null,
                    product_name: dcl.product_name || null,
                    software_version: dcl.software_version,
                    software_version_string: dcl.software_version_string,
                    block_height: dcl.block_height,
                    tx_hash: dcl.tx_hash,
                    network: dcl.network,
                    release_time: dcl.release_time
                };
            }

            // Merge filename parse + backend enrichment (both may contribute different fields)
            let vid = null,
                pid = null,
                swVer = null,
                txHash = null;

            const src = r?.source_rel_path;
            if (src) {
                const match = String(src).match(/ota[a-z]?_(\d+)_(\d+)_(\d+)_([0-9a-fA-F]{8})/);
                if (match) {
                    vid = parseInt(match[1]);
                    pid = parseInt(match[2]);
                    swVer = parseInt(match[3]);
                    txHash = match[4].toUpperCase();
                }
            }

            // Backend enrichment fills in vendor/product names and any missing IDs
            const vendorName = r?.vendor_name || null;
            const productName = r?.product_name || null;
            const finalVid = vid ?? r?.vid ?? null;
            const finalPid = pid ?? r?.pid ?? null;

            if (!vendorName && !productName && finalVid == null && finalPid == null) return null;

            return {
                vid: finalVid,
                pid: finalPid,
                vendor_name: vendorName,
                product_name: productName,
                software_version: swVer,
                software_version_string: null,
                block_height: r?.block_height ?? null,
                tx_hash: txHash ?? r?.tx_hash_first8 ?? null,
                network: r?.source_network || null,
                release_time: null
            };
        },

        bannerTitle() {
            const p = this.dclProvenance;
            if (p?.vendor_name && p?.product_name) return `${p.vendor_name} — ${p.product_name}`;
            if (p?.product_name) return p.product_name;
            if (p?.vendor_name) return p.vendor_name;
            if (this.selectedResult?.result_id) return `Job ${this.shortId(this.selectedResult.result_id)}`;
            return 'Firmware Report';
        },

        checklistResults() {
            return this.phaseIiReport?.results || {};
        },
        verdictCards() {
            const r = this.selectedResult || {};
            const cards = [
                {
                    label: 'Authenticity',
                    value: r.verdict_authenticity || '-',
                    icon: 'pi-shield',
                    iconColor: this.verdictIconColor(r.verdict_authenticity),
                    iconBg: this.verdictIconBg(r.verdict_authenticity)
                },
                {
                    label: 'Integrity',
                    value: r.verdict_integrity || '-',
                    icon: 'pi-check-circle',
                    iconColor: this.verdictIconColor(r.verdict_integrity),
                    iconBg: this.verdictIconBg(r.verdict_integrity)
                },
                {
                    label: 'Validation',
                    value: r.verdict_validation_path || '-',
                    icon: 'pi-sitemap',
                    iconColor: this.verdictIconColor(r.verdict_validation_path),
                    iconBg: this.verdictIconBg(r.verdict_validation_path)
                }
            ];
            return cards;
        },
        otaRows() {
            const ota = this.reportOutputs?.matter_ota || {};
            const header = ota?.header || {};
            const data = [
                ['Is Matter OTA', this.boolLabel(ota?.is_matter_ota)],
                ['Hash Verified', this.boolLabel(ota?.hash_verified)],
                ['VID', header?.vid],
                ['PID', header?.pid],
                ['Software Version', header?.software_version],
                ['Software Version String', header?.software_version_string],
                ['Hash Algorithm', header?.hash_algorithm],
                ['Digest Type', header?.digest_type],
                ['Payload Size', header?.payload_size],
                ['Total Size', header?.total_size],
                ['Payload Hash', header?.payload_hash]
            ];
            return data.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => ({ label, value: String(value) }));
        },
        isMatterOta() {
            const ota = this.reportOutputs?.matter_ota || {};
            return ota?.is_matter_ota === true;
        },
        isHashVerified() {
            const ota = this.reportOutputs?.matter_ota || {};
            return ota?.hash_verified === true;
        },
        otaSizePayload() {
            const header = this.reportOutputs?.matter_ota?.header || {};
            return Number(header?.payload_size) || 0;
        },
        otaSizeTotal() {
            const header = this.reportOutputs?.matter_ota?.header || {};
            return Number(header?.total_size) || 0;
        },
        otaSizeRatio() {
            if (this.otaSizeTotal <= 0) return 0;
            return Math.round((this.otaSizePayload / this.otaSizeTotal) * 100);
        },
        sdkResult() {
            return this.reportOutputs?.sdk_result || {};
        },
        sdkBestGuess() {
            return this.sdkResult?.best_guess_base || this.selectedResult?.sdk_primary_version || this.selectedResult?.sdk_best_guess_base || null;
        },
        sdkDecodedVersion() {
            const decoded = this.sdkResult?.decoded_specification_version?.decoded || null;
            return decoded?.version_4tuple || this.selectedResult?.sdk_decoded_version || null;
        },
        sdkInferredVersion() {
            return this.sdkResult?.inferred_best_guess_base || this.selectedResult?.sdk_inferred_version || null;
        },
        sdkConsistency() {
            return this.sdkResult?.decoded_inferred_consistency || this.selectedResult?.sdk_version_consistency || null;
        },
        sdkInferredSource() {
            return this.sdkResult?.inferred_source || null;
        },
        sdkPossible() {
            return Array.isArray(this.sdkResult?.possible_versions) ? this.sdkResult.possible_versions : [];
        },
        sdkImpossible() {
            return Array.isArray(this.sdkResult?.impossible_versions) ? this.sdkResult.impossible_versions : [];
        },
        sdkWarnings() {
            return Array.isArray(this.sdkResult?.attribution_warnings) ? this.sdkResult.attribution_warnings : [];
        },
        stageRows() {
            const backendStages = Array.isArray(this.sanitizedReport?.stages) ? this.sanitizedReport.stages : [];
            const byName = new Map(backendStages.map((s) => [String(s?.name || ''), s]));
            const phaseIiResults = this.phaseIiReport?.results || {};
            return displayStagesRef.value.map((display) => {
                const linked = display.backend.map((name) => byName.get(name)).filter(Boolean);
                const starts = linked.map((s) => s?.started_at).filter(Boolean);
                const ends = linked.map((s) => s?.ended_at).filter(Boolean);
                // Merge Phase II section timing into the envelope so display stages
                // that include LLM sections (e.g. custom_auth) show the full wall-clock span.
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
                const error =
                    linked
                        .map((s) => s?.details?.error)
                        .filter(Boolean)
                        .join('; ') || null;
                // Prefer backend-computed duration_ms (microsecond precision from
                // time.monotonic()) when there is a single backend stage and no Phase
                // II sections contribute timing to the envelope.
                const backendDurationMs = linked.length === 1 && linked[0]?.duration_ms != null ? Number(linked[0].duration_ms) : null;
                const hasPhaseIiTiming = (display.sections || []).some((s) => {
                    const r = phaseIiResults[s.id];
                    return r && (r.started_at || r.ended_at);
                });
                return {
                    id: display.id,
                    name: display.id,
                    label: display.label,
                    status: aggregateDisplayStatus(display, linked, this.checklistResults),
                    started_at,
                    ended_at,
                    duration: this.displayDuration(started_at, ended_at, hasPhaseIiTiming ? null : backendDurationMs),
                    error
                };
            });
        },
    },
    methods: {
        openTranscriptDialog(secId) {
            this.transcriptSectionId = secId;
            this.transcriptDialogVisible = true;
        },
        onTopTabChange(event) {
            const idx = Number(event?.index ?? 0);
            this.topTabIndex = idx;
            const tab = idx === 1 ? 'batch-runs' : 'all-scans';
            // Keep the active tab in the URL so it survives refresh / is shareable.
            if (String(this.$route?.query?.tab || '') !== tab) {
                this.$router.replace({ query: { ...this.$route.query, tab } }).catch(() => {});
            }
        },
        normalizeNetwork(value) {
            const key = String(value || '')
                .trim()
                .toLowerCase();
            return key === 'mainnet' || key === 'testnet' ? key : 'testnet';
        },

        onPage(event) {
            this.pageFirst = event.first;
            this.pageSize = event.rows;
            this.loadResults();
        },
        onSort(event) {
            this.uiSortField = event.sortField || 'analyzed_at';
            this.sortOrder = event.sortOrder || -1;
            this.pageFirst = 0;
            this.loadResults();
        },
        sortFieldApi(value) {
            const key = String(value || '').trim();
            const allowed = new Set(['analyzed_at', 'chipset', 'status', 'verdict_integrity', 'verdict_validation_path', 'verdict_authenticity']);
            return allowed.has(key) ? key : 'analyzed_at';
        },
        buildQuery() {
            const params = new URLSearchParams({
                network: this.selectedNetwork,
                scope: 'all',
                limit: String(this.pageSize),
                offset: String(this.pageFirst),
                sort_by: this.sortFieldApi(this.uiSortField),
                sort_dir: this.sortOrder === 1 ? 'asc' : 'desc'
            });
            const map = [
                ['q', this.filters.q],
                ['verdict', this.filters.verdict],
                ['status', this.filters.status],
                ['chipset', this.filters.chipset]
            ];
            for (const [k, v] of map) {
                if (v !== null && v !== undefined && String(v).trim() !== '') {
                    params.set(k, String(v).trim());
                }
            }
            if (this.filters.fromTime instanceof Date) params.set('from_time', this.filters.fromTime.toISOString());
            if (this.filters.toTime instanceof Date) params.set('to_time', this.filters.toTime.toISOString());
            return params.toString();
        },
        async refreshNow() {
            await Promise.all([this.loadResults(), this.loadJobs()]);
        },
        async loadJobs() {
            if (!this.apiBase) return;
            try {
                const query = new URLSearchParams({ network: this.selectedNetwork });
                const response = await fetch(`${this.apiBase}/api/v1/jobs?${query.toString()}`);
                if (!response.ok) return;
                const payload = await response.json();
                this.jobs = {
                    pending: Array.isArray(payload.pending) ? payload.pending : [],
                    running: Array.isArray(payload.running) ? payload.running : [],
                    done: Array.isArray(payload.done) ? payload.done : [],
                    failed: Array.isArray(payload.failed) ? payload.failed : []
                };
            } catch (_) {
                /* non-critical */
            }
        },
        openJobProgress(jobId) {
            if (!jobId) return;
            this.jobProgressJobId = jobId;
            this.jobProgressDialogVisible = true;
        },
        jobStatusSeverity(status) {
            const key = String(status || '').toLowerCase();
            if (key === 'done') return 'success';
            if (key === 'failed') return 'danger';
            if (key === 'running') return 'info';
            return 'warning';
        },
        async loadResults() {
            this.loading = true;
            this.error = null;
            if (!this.apiBase) {
                this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
                this.rows = [];
                this.totalCount = 0;
                this.loading = false;
                return;
            }
            try {
                const response = await fetch(`${this.apiBase}/api/v1/results?${this.buildQuery()}`);
                if (!response.ok) throw new Error(`Results request failed (${response.status})`);
                const payload = await response.json();
                this.rows = Array.isArray(payload.items) ? payload.items : [];
                this.totalCount = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : this.rows.length;

                const currentSelected = String(this.selectedResultId || '').trim();
                const hasCurrent = this.rows.some((row) => row.result_id === currentSelected);
                if (!hasCurrent) {
                    const first = this.rows[0];
                    if (first?.result_id) {
                        this.selectedResultId = first.result_id;
                        this.detailTabIndex = 0;
                        await this.loadResultDetail(first.result_id);
                    } else {
                        this.selectedResultId = '';
                        this.detailPayload = { result: null, attempts: [] };
                    }
                }
            } catch (err) {
                this.error = err instanceof Error ? err.message : 'Failed to load results';
                this.rows = [];
                this.totalCount = 0;
            } finally {
                this.loading = false;
            }
        },
        clearFilters() {
            this.filters = {
                q: '',
                verdict: null,
                status: null,
                chipset: '',
                fromTime: null,
                toTime: null
            };
            this.pageFirst = 0;
            this.loadResults();
        },
        applyFilters() {
            this.pageFirst = 0;
            this.loadResults();
        },
        async onRowClick(event) {
            await this.openReport(event?.data);
        },
        async openReport(row) {
            const resultId = String(row?.result_id || '').trim();
            if (!resultId) return;
            this.selectedResultId = resultId;
            this.detailTabIndex = 0;
            this.reportSidebarVisible = true;
            // Seed with table row data so banner shows vendor/product immediately
            if (row) {
                this.detailPayload = { result: { ...row }, attempts: [] };
            }
            await this.loadResultDetail(resultId);
        },
        async reloadSelectedDetail() {
            if (!this.selectedResultId) return;
            await this.loadResultDetail(this.selectedResultId);
        },
        async selectAttempt(resultId) {
            const id = String(resultId || '').trim();
            if (!id || id === this.selectedResultId) return;
            this.selectedResultId = id;
            await this.loadResultDetail(id);
        },
        async loadResultDetail(resultId) {
            this.detailLoading = true;
            this.detailError = null;
            if (!this.apiBase) {
                this.detailError = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
                this.detailLoading = false;
                return;
            }
            try {
                const query = new URLSearchParams({ network: this.selectedNetwork });
                const response = await fetch(`${this.apiBase}/api/v1/results/${encodeURIComponent(resultId)}?${query.toString()}`);
                if (!response.ok) throw new Error(`Result detail request failed (${response.status})`);
                const payload = await response.json();
                // Merge API response over any seeded row data — preserves vendor/product
                // fields from the list endpoint when the detail endpoint doesn't include them.
                const seeded = this.detailPayload?.result;
                const merged = payload?.result ? { ...payload.result } : null;
                if (merged && seeded) {
                    for (const field of ['vendor_name', 'product_name', 'vid', 'pid', 'block_height', 'tx_hash_first8']) {
                        if (merged[field] == null && seeded[field] != null) {
                            merged[field] = seeded[field];
                        }
                    }
                }
                this.detailPayload = {
                    result: merged,
                    attempts: Array.isArray(payload?.attempts) ? payload.attempts : []
                };
            } catch (err) {
                this.detailError = err instanceof Error ? err.message : 'Failed to load result detail';
            } finally {
                this.detailLoading = false;
            }
        },
        openFirmwareDetail(row) {
            const sha = String(row?.firmware_sha256 || '').trim();
            if (!sha) return;
            this.$router.push(`/firmware-security/firmware/${sha}`);
        },
        confirmDelete(row) {
            const resultId = String(row?.result_id || '').trim();
            if (!resultId) return;
            this.$confirm.require({
                message: `Delete result ${this.shortId(resultId)}?`,
                header: 'Confirm Delete',
                icon: 'pi pi-exclamation-triangle',
                acceptClass: 'p-button-danger',
                acceptLabel: 'Delete',
                rejectLabel: 'Cancel',
                accept: () => this.doDelete(resultId)
            });
        },
        async doDelete(resultId) {
            if (!this.apiBase) return;
            try {
                const query = new URLSearchParams({ network: this.selectedNetwork });
                const response = await fetch(`${this.apiBase}/api/v1/results/${encodeURIComponent(resultId)}?${query.toString()}`, { method: 'DELETE' });
                if (!response.ok) throw new Error(`Delete failed (${response.status})`);
                this.reportSidebarVisible = false;
                this.selectedResultId = '';
                this.detailPayload = { result: null, attempts: [] };
                await this.loadResults();
            } catch (err) {
                this.$toast?.add({ severity: 'error', summary: 'Delete failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
            }
        },
        confirmStopJob(jobId) {
            if (!jobId) return;
            this.$confirm.require({
                message: `Stop job ${this.shortId(jobId)}?`,
                header: 'Confirm Stop',
                icon: 'pi pi-exclamation-triangle',
                acceptClass: 'p-button-warning',
                acceptLabel: 'Stop',
                rejectLabel: 'Cancel',
                accept: () => this.doStopJob(jobId)
            });
        },
        async doStopJob(jobId) {
            if (!this.apiBase) return;
            try {
                const response = await fetch(`${this.apiBase}/api/v1/jobs/${encodeURIComponent(jobId)}/stop`, { method: 'POST' });
                if (!response.ok) throw new Error(`Stop failed (${response.status})`);
                this.$toast?.add({ severity: 'success', summary: 'Job stopped', detail: `Job ${this.shortId(jobId)} has been stopped.`, life: 3000 });
                await this.refreshNow();
            } catch (err) {
                this.$toast?.add({ severity: 'error', summary: 'Stop failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
            }
        },
        confirmDeleteJob(jobId) {
            if (!jobId) return;
            this.$confirm.require({
                message: `Delete job record ${this.shortId(jobId)}?`,
                header: 'Confirm Delete',
                icon: 'pi pi-exclamation-triangle',
                acceptClass: 'p-button-danger',
                acceptLabel: 'Delete',
                rejectLabel: 'Cancel',
                accept: () => this.doDeleteJob(jobId)
            });
        },
        async doDeleteJob(jobId) {
            if (!this.apiBase) return;
            try {
                const response = await fetch(`${this.apiBase}/api/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
                if (!response.ok) throw new Error(`Delete failed (${response.status})`);
                this.$toast?.add({ severity: 'success', summary: 'Job deleted', detail: `Job record ${this.shortId(jobId)} has been removed.`, life: 3000 });
                await this.refreshNow();
            } catch (err) {
                this.$toast?.add({ severity: 'error', summary: 'Delete failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
            }
        },
        otaFieldValue(label) {
            const row = this.otaRows.find((r) => r.label === label);
            return row ? row.value : '-';
        },
        verdictIconColor(value) {
            const key = String(value || '').toLowerCase();
            if (key === 'pass') return 'text-green-500';
            if (key === 'fail') return 'text-red-500';
            if (key === 'warning') return 'text-yellow-500';
            return 'text-blue-500';
        },
        verdictIconBg(value) {
            const key = String(value || '').toLowerCase();
            if (key === 'pass') return 'bg-green-100';
            if (key === 'fail') return 'bg-red-100';
            if (key === 'warning') return 'bg-yellow-100';
            return 'bg-blue-100';
        },
        sdkConsistencySeverity(value) {
            const key = String(value || '').toLowerCase();
            if (key === 'consistent') return 'success';
            if (key === 'inconsistent') return 'danger';
            if (key === 'partial') return 'warning';
            return 'info';
        },
        runStatusSeverity(value) {
            const key = String(value || '').toLowerCase();
            if (key === 'success') return 'success';
            if (key === 'partial') return 'warning';
            if (key === 'failed') return 'danger';
            return 'info';
        },
        verdictSeverity(value) {
            const key = String(value || '').toLowerCase();
            if (key === 'pass') return 'success';
            if (key === 'fail') return 'danger';
            if (key === 'warning') return 'warning';
            return 'info';
        },
        formatTimestamp(value) {
            if (!value) return '';
            const dt = new Date(value);
            if (Number.isNaN(dt.getTime())) return String(value);
            return dt.toLocaleString();
        },
        formatSize(bytes) {
            if (bytes === null || bytes === undefined || bytes === '') return '-';
            const n = Number(bytes);
            if (!Number.isFinite(n) || n < 0) return '-';
            if (n < 1024) return `${n} conformance`;
            if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
            return `${(n / 1048576).toFixed(1)} MB`;
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
        shortSha(value) {
            const text = String(value || '').trim();
            if (!text) return '-';
            return text.length <= 16 ? text : `${text.slice(0, 8)}...${text.slice(-8)}`;
        },
        shortId(value) {
            const text = String(value || '').trim();
            return text ? text.slice(0, 8) : '-';
        },
        formatConfidence(value) {
            const n = Number(value);
            if (!Number.isFinite(n)) return '-';
            return n.toFixed(2);
        },
        boolLabel(value) {
            if (value === true) return 'Yes';
            if (value === false) return 'No';
            return '-';
        },
        displayValue(value) {
            if (value === null || value === undefined || value === '') return '-';
            return value;
        },
        sdkDisplayValue(value) {
            if (value === null || value === undefined || String(value).trim() === '') return 'rng_init/provenance';
            return String(value);
        },
        displayPathTail(value) {
            const text = String(value || '').trim();
            if (!text) return '-';
            const parts = text.split(/[\\/]/).filter(Boolean);
            if (parts.length === 0) return '-';
            return parts[parts.length - 1];
        }
    },
    watch: {
        selectedNetwork(next, prev) {
            if (next === prev) return;
            this.pageFirst = 0;
            this.loadResults();
            this.loadJobs();
        }
    },
    mounted() {
        loadPipeline(this.apiBase);
        const initialQuery = String(this.$route?.query?.q || '').trim();
        if (initialQuery) {
            this.filters.q = initialQuery;
            this.tableFiltersExpanded = true;
        }
        if (String(this.$route?.query?.tab || '') === 'batch-runs') {
            this.topTabIndex = 1;
        }
        this.loadResults();
        this.loadJobs();
    }
};
</script>

<template>
    <div class="p-2 scan-results-page">
        <ConfirmDialog />
        <TabView v-model:activeIndex="topTabIndex" @tab-change="onTopTabChange" class="scan-results-tabs">
        <TabPanel header="All Scans">
        <div class="grid">
            <!-- Analysis Pipeline Status -->
            <div class="col-12">
                <Card class="results-card mb-2">
                    <template #title>
                        <div class="flex align-items-center gap-2">
                            <span>Analysis Pipeline</span>
                            <Badge v-if="analysisStats.outstanding > 0" :value="analysisStats.outstanding" severity="warning" />
                            <Badge v-if="analysisStats.failed > 0" :value="analysisStats.failed" severity="danger" />
                        </div>
                    </template>
                    <template #content>
                        <div class="grid">
                            <div class="col-12 md:col-3" v-for="stat in analysisStatCards" :key="stat.label">
                                <div class="card mb-0 stat-card surface-card border-1 surface-border shadow-1">
                                    <div class="flex justify-content-between mb-1">
                                        <div>
                                            <span class="block text-500 font-medium mb-1 text-xs uppercase">{{ stat.label }}</span>
                                            <div class="text-900 font-bold text-xl">{{ stat.value }}</div>
                                        </div>
                                        <div class="flex align-items-center justify-content-center border-round" :class="stat.iconBg" style="width: 2.2rem; height: 2.2rem">
                                            <i class="pi text-lg" :class="[stat.icon, stat.iconColor]"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </Card>
            </div>

            <div class="col-12">
                <Card class="results-card">
                    <template #title>
                        <div class="flex align-items-center justify-content-between gap-1 flex-wrap">
                            <div class="flex align-items-center gap-1 flex-wrap">
                                <span>Scan Results</span>

                                <Tag :value="`Total: ${totalCount}`" severity="info" />
                                <Tag :value="`Network: ${selectedNetwork}`" severity="warning" />
                            </div>
                            <div class="flex align-items-center gap-1">
                                <span class="text-600 text-sm">Showing {{ totalCount === 0 ? 0 : pageFirst + 1 }} - {{ Math.min(pageFirst + pageSize, totalCount) }}</span>
                                <Button icon="pi pi-filter" class="p-button-text p-button-sm p-button-rounded" v-tooltip.top="'Show/Hide Filters'" @click="tableFiltersExpanded = !tableFiltersExpanded" />
                                <Button icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded" :loading="loading" v-tooltip.top="'Refresh results'" @click="refreshNow" />
                            </div>
                        </div>
                    </template>
                    <template #content>
                        <div v-show="tableFiltersExpanded" class="grid filters mb-2">
                            <div class="col-12 pb-0 mb-1"><span class="text-600 font-medium text-sm uppercase tracking-wide">Search Filters</span></div>
                            <div class="col-12 md:col-3 pt-0">
                                <label class="filter-label">Search</label>
                                <InputText v-model="filters.q" class="w-full p-inputtext-sm" placeholder="run/result/firmware..." @keyup.enter="applyFilters" />
                            </div>
                            <div class="col-6 md:col-2 pt-0">
                                <label class="filter-label">Verdict</label>
                                <Dropdown v-model="filters.verdict" class="w-full p-inputtext-sm" :options="verdictOptions" optionLabel="label" optionValue="value" placeholder="Any" showClear />
                            </div>
                            <div class="col-6 md:col-2 pt-0">
                                <label class="filter-label">Status</label>
                                <Dropdown v-model="filters.status" class="w-full p-inputtext-sm" :options="statusOptions" optionLabel="label" optionValue="value" placeholder="Any" showClear />
                            </div>
                            <div class="col-6 md:col-2 pt-0">
                                <label class="filter-label">Chipset</label>
                                <InputText v-model="filters.chipset" class="w-full p-inputtext-sm" placeholder="e.g. siliconlabs" @keyup.enter="applyFilters" />
                            </div>
                            <div class="col-6 md:col-3 pt-0">
                                <label class="filter-label">Date Range</label>
                                <div class="flex gap-2">
                                    <Calendar v-model="filters.fromTime" class="w-full p-inputtext-sm" placeholder="From" dateFormat="yy-mm-dd" showTime hourFormat="24" />
                                    <Calendar v-model="filters.toTime" class="w-full p-inputtext-sm" placeholder="To" dateFormat="yy-mm-dd" showTime hourFormat="24" />
                                </div>
                            </div>
                            <div class="col-12 md:col-12 flex align-items-center justify-content-end gap-2 mt-2">
                                <Button label="Clear" icon="pi pi-filter-slash" class="p-button-text p-button-sm" @click="clearFilters" />
                                <Button label="Apply Filters" icon="pi pi-search" class="p-button-sm" @click="applyFilters" />
                            </div>
                        </div>

                        <Message v-if="error" severity="error" :closable="false" class="mb-2">{{ error }}</Message>

                        <DataTable
                            :value="rows"
                            :lazy="true"
                            :loading="loading"
                            paginator
                            :rows="pageSize"
                            :rowsPerPageOptions="[20, 50, 100]"
                            :first="pageFirst"
                            :totalRecords="totalCount"
                            @page="onPage"
                            sortMode="single"
                            :sortField="uiSortField"
                            :sortOrder="sortOrder"
                            @sort="onSort"
                            @row-click="onRowClick"
                            scrollable
                            scrollHeight="34rem"
                            responsiveLayout="scroll"
                            class="p-datatable-sm scan-results-table"
                            :pt="{ headerCell: { style: 'justify-content:center;text-align:center' }, bodyCell: { style: 'justify-content:center;text-align:center' } }"
                        >
                            <Column field="analyzed_at" header="Analyzed At" sortable headerClass="scan-col-analyzed" bodyClass="scan-col-analyzed">
                                <template #body="slotProps">{{ formatTimestamp(slotProps.data.analyzed_at) }}</template>
                            </Column>
                            <Column field="result_id" header="Job ID" headerClass="scan-col-id" bodyClass="scan-col-id">
                                <template #body="slotProps"
                                    ><code>{{ shortId(slotProps.data.result_id || slotProps.data.job_id) }}</code></template
                                >
                            </Column>
                            <Column field="vendor_name" header="Vendor Name" headerClass="scan-col-name" bodyClass="scan-col-name">
                                <template #body="slotProps">{{ displayValue(slotProps.data.vendor_name) }}</template>
                            </Column>
                            <Column field="product_name" header="Product Name" headerClass="scan-col-name" bodyClass="scan-col-name">
                                <template #body="slotProps">{{ displayValue(slotProps.data.product_name) }}</template>
                            </Column>
                            <Column field="block_height" header="Block Height" headerClass="scan-col-height" bodyClass="scan-col-height">
                                <template #body="slotProps">{{ displayValue(slotProps.data.block_height) }}</template>
                            </Column>
                            <Column field="tx_hash_first8" header="TxHash (First 8)" headerClass="scan-col-hash" bodyClass="scan-col-hash">
                                <template #body="slotProps"
                                    ><code>{{ displayValue(slotProps.data.tx_hash_first8) }}</code></template
                                >
                            </Column>
                            <Column field="status" header="Run Status" sortable headerClass="scan-col-status" bodyClass="scan-col-status">
                                <template #body="slotProps">
                                    <Tag :value="slotProps.data.status" :severity="runStatusSeverity(slotProps.data.status)" />
                                </template>
                            </Column>
                            <Column header="Actions" headerClass="scan-col-actions" bodyClass="scan-col-actions">
                                <template #body="slotProps">
                                    <div class="flex align-items-center gap-2">
                                        <template v-if="slotProps.data.status === 'running' || slotProps.data.status === 'pending'">
                                            <Button icon="pi pi-chart-line" class="p-button-sm p-button-text" v-tooltip.top="'View Progress'" @click.stop="openJobProgress(slotProps.data.job_id)" />
                                            <Button icon="pi pi-stop-circle" class="p-button-sm p-button-text p-button-warning" v-tooltip.top="'Stop Job'" @click.stop="confirmStopJob(slotProps.data.job_id)" />
                                            <Button icon="pi pi-trash" class="p-button-sm p-button-text p-button-danger" v-tooltip.top="'Delete Job'" @click.stop="confirmDeleteJob(slotProps.data.job_id)" />
                                        </template>
                                        <template v-else>
                                            <Button icon="pi pi-file" class="p-button-sm p-button-text" v-tooltip.top="'View rendered report'" :disabled="!slotProps.data.result_id" @click.stop="openReport(slotProps.data)" />
                                            <Button
                                                icon="pi pi-external-link"
                                                class="p-button-sm p-button-text"
                                                v-tooltip.top="slotProps.data.firmware_sha256 ? 'Open firmware detail' : 'Firmware SHA missing'"
                                                :disabled="!slotProps.data.firmware_sha256"
                                                @click.stop="openFirmwareDetail(slotProps.data)"
                                            />
                                            <Button icon="pi pi-trash" class="p-button-sm p-button-text p-button-danger" v-tooltip.top="'Delete result'" @click.stop="confirmDelete(slotProps.data)" />
                                        </template>
                                    </div>
                                </template>
                            </Column>
                        </DataTable>

                        <div v-if="!loading && totalCount === 0" class="flex flex-column align-items-center justify-content-center p-5 text-500">
                            <i class="pi pi-filter-slash text-4xl mb-3"></i>
                            <span class="text-lg">No scan results found for current filters.</span>
                        </div>
                    </template>
                </Card>
            </div>
        </div>
        </TabPanel>
        <TabPanel header="Batch Runs">
            <BatchRunsTab :api-base="apiBase" :network="selectedNetwork" @open-report="openReport" @open-progress="openJobProgress" />
        </TabPanel>
        </TabView>

        <!-- ===== Rendered Report Sidebar ===== -->
        <Sidebar v-model:visible="reportSidebarVisible" position="right" class="report-sidebar w-full md:w-32rem lg:w-45rem">
            <template #header>
                <div class="flex align-items-center gap-2 w-full">
                    <i class="pi pi-file-check text-xl text-blue-500"></i>
                    <span class="text-xl font-bold">Rendered Report</span>
                    <Tag v-if="selectedResult" :value="shortId(selectedResult.result_id)" severity="info" class="ml-1" />
                    <Button icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded ml-auto" :loading="detailLoading" v-tooltip.top="'Refresh selected report'" :disabled="!selectedResultId" @click="reloadSelectedDetail" />
                </div>
            </template>

            <Message v-if="detailError" severity="error" :closable="false" class="mb-2">{{ detailError }}</Message>

            <div v-if="!selectedResultId && !detailLoading" class="flex flex-column align-items-center justify-content-center p-6 text-400">
                <i class="pi pi-file text-5xl mb-3"></i>
                <span class="text-lg">Select a row to read the report.</span>
            </div>

            <div v-else-if="detailLoading" class="flex align-items-center justify-content-center p-6 text-500 gap-3">
                <ProgressSpinner style="width: 2rem; height: 2rem" strokeWidth="6" />
                <span class="text-lg">Loading report...</span>
            </div>

            <div v-else-if="selectedResult" class="report-content">
                <!-- Firmware identity banner -->
                <div class="report-banner mb-3">
                    <div class="flex align-items-center gap-3 flex-wrap">
                        <i class="pi pi-microchip text-blue-500" style="font-size: 1.3rem"></i>
                        <div>
                            <div class="font-bold text-lg">{{ bannerTitle }}</div>
                            <div class="text-sm text-600 mt-1">
                                <template v-if="dclProvenance?.vid != null || dclProvenance?.pid != null || dclProvenance?.software_version != null || dclProvenance?.software_version_string">
                                    <span v-if="dclProvenance?.vid != null"
                                        >VID <code>{{ dclProvenance.vid }}</code></span
                                    >
                                    <span v-if="dclProvenance?.pid != null" class="ml-2"
                                        >PID <code>{{ dclProvenance.pid }}</code></span
                                    >
                                    <span v-if="dclProvenance?.software_version != null" class="ml-2"
                                        >v<code>{{ dclProvenance.software_version }}</code></span
                                    >
                                    <span v-if="dclProvenance?.software_version_string" class="ml-2">"{{ dclProvenance.software_version_string }}"</span>
                                </template>
                                <span v-else class="text-500">Device identifiers pending DCL lookup</span>
                            </div>
                            <div class="text-xs text-500 mt-1 flex gap-2 flex-wrap">
                                <span v-if="dclProvenance?.network"><Tag :value="dclProvenance.network" :severity="dclProvenance.network === 'mainnet' ? 'danger' : 'info'" /></span>
                                <span v-if="dclProvenance?.block_height">Block {{ dclProvenance.block_height }}</span>
                                <span v-if="dclProvenance?.tx_hash"
                                    >TX <code>{{ dclProvenance.tx_hash.slice(0, 8) }}</code></span
                                >
                                <span v-if="selectedResult.chipset">| {{ selectedResult.chipset }}</span>
                                <span class="ml-auto"><Tag :value="selectedResult.status" :severity="runStatusSeverity(selectedResult.status)" /></span>
                            </div>
                        </div>
                    </div>
                </div>

                <TabView v-model:activeIndex="detailTabIndex">
                    <!-- ===== Tab 1: Overview ===== -->
                    <TabPanel header="Overview">
                        <!-- Verdict stat cards -->
                        <div class="grid mb-2">
                            <div class="col-4" v-for="v in verdictCards" :key="v.label">
                                <div class="stat-card card mb-0">
                                    <div class="flex justify-content-between">
                                        <div>
                                            <span class="stat-label-text block text-500 font-medium mb-1">{{ v.label }}</span>
                                            <div class="text-900 font-bold text-lg">{{ displayValue(v.value) }}</div>
                                        </div>
                                        <div class="flex align-items-center justify-content-center border-round" :class="v.iconBg" style="width: 2.2rem; height: 2.2rem">
                                            <i class="pi" :class="[v.icon, v.iconColor]" style="font-size: 1rem"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Execution Info -->
                        <Card class="report-card mb-2">
                            <template #title><i class="pi pi-clock mr-2 text-green-500"></i>Execution</template>
                            <template #content>
                                <div class="outcome-grid">
                                    <div class="outcome-row">
                                        <span class="outcome-label">SHA-256</span><code class="outcome-value text-xs">{{ selectedResult.firmware_sha256 }}</code>
                                    </div>
                                    <div class="outcome-row">
                                        <span class="outcome-label">Size</span><span class="outcome-value">{{ formatSize(selectedResult.firmware_size) }}</span>
                                    </div>
                                    <div class="outcome-row">
                                        <span class="outcome-label">Analyzed</span><span class="outcome-value">{{ formatTimestamp(selectedResult.analyzed_at) }}</span>
                                    </div>
                                    <div class="outcome-row">
                                        <span class="outcome-label">Run ID</span><code class="outcome-value text-xs">{{ selectedResult.run_id?.slice(0, 16) }}...</code>
                                    </div>
                                </div>
                            </template>
                        </Card>

                        <!-- SDK Summary -->
                        <Card class="report-card mb-0">
                            <template #title><i class="pi pi-code mr-2 text-purple-500"></i>SDK Versions</template>
                            <template #content>
                                <div class="outcome-grid">
                                    <div class="outcome-row">
                                        <span class="outcome-label">Decoded</span><span class="outcome-value">{{ sdkDisplayValue(selectedResult.sdk_decoded_version) }}</span>
                                    </div>
                                    <div class="outcome-row">
                                        <span class="outcome-label">Inferred</span><span class="outcome-value">{{ sdkDisplayValue(selectedResult.sdk_inferred_version) }}</span>
                                    </div>
                                    <div class="outcome-row">
                                        <span class="outcome-label">Primary</span><span class="outcome-value">{{ sdkDisplayValue(selectedResult.sdk_primary_version || selectedResult.sdk_best_guess_base) }}</span>
                                    </div>
                                    <div class="outcome-row">
                                        <span class="outcome-label">Consistency</span
                                        ><span class="outcome-value"><Tag :value="sdkDisplayValue(selectedResult.sdk_version_consistency)" :severity="sdkConsistencySeverity(selectedResult.sdk_version_consistency)" /></span>
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </TabPanel>

                    <!-- ===== Tab 2: OTA/Header ===== -->
                    <TabPanel header="OTA/Header">
                        <div v-if="otaRows.length === 0" class="flex flex-column align-items-center justify-content-center p-4 text-500">
                            <i class="pi pi-info-circle text-3xl mb-2"></i>
                            <span>No OTA header data available.</span>
                        </div>

                        <div v-else>
                            <!-- Status banner -->
                            <div class="flex gap-2 mb-3">
                                <div class="flex-1 ota-banner-card" :class="isMatterOta ? 'banner-pass' : 'banner-fail'">
                                    <i class="pi text-xl" :class="isMatterOta ? 'pi-check-circle' : 'pi-times-circle'"></i>
                                    <div>
                                        <div class="text-sm text-500">Matter OTA</div>
                                        <div class="font-semibold">{{ isMatterOta ? 'Yes' : 'No' }}</div>
                                    </div>
                                </div>
                                <div class="flex-1 ota-banner-card" :class="isHashVerified ? 'banner-pass' : 'banner-fail'">
                                    <i class="pi text-xl" :class="isHashVerified ? 'pi-check-circle' : 'pi-times-circle'"></i>
                                    <div>
                                        <div class="text-sm text-500">Hash Verified</div>
                                        <div class="font-semibold">{{ isHashVerified ? 'Yes' : 'No' }}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Device Identity -->
                            <Card class="report-card mb-2">
                                <template #title><i class="pi pi-mobile mr-2 text-blue-500"></i>Device Identity</template>
                                <template #content>
                                    <div class="outcome-grid">
                                        <div class="outcome-row">
                                            <span class="outcome-label">VID</span
                                            ><span class="outcome-value"
                                                ><code>{{ otaFieldValue('VID') }}</code></span
                                            >
                                        </div>
                                        <div class="outcome-row">
                                            <span class="outcome-label">PID</span
                                            ><span class="outcome-value"
                                                ><code>{{ otaFieldValue('PID') }}</code></span
                                            >
                                        </div>
                                        <div class="outcome-row">
                                            <span class="outcome-label">Software Version</span><span class="outcome-value">{{ otaFieldValue('Software Version') }}</span>
                                        </div>
                                        <div class="outcome-row">
                                            <span class="outcome-label">Version String</span><span class="outcome-value">{{ otaFieldValue('Software Version String') }}</span>
                                        </div>
                                    </div>
                                </template>
                            </Card>

                            <!-- Crypto Details -->
                            <Card class="report-card mb-2">
                                <template #title><i class="pi pi-lock mr-2 text-orange-500"></i>Cryptography</template>
                                <template #content>
                                    <div class="outcome-grid">
                                        <div class="outcome-row">
                                            <span class="outcome-label">Hash Algorithm</span><span class="outcome-value">{{ otaFieldValue('Hash Algorithm') }}</span>
                                        </div>
                                        <div class="outcome-row">
                                            <span class="outcome-label">Digest Type</span><span class="outcome-value">{{ otaFieldValue('Digest Type') }}</span>
                                        </div>
                                        <div class="outcome-row col-span-2">
                                            <span class="outcome-label">Payload Hash</span><code class="outcome-value text-xs">{{ otaFieldValue('Payload Hash') }}</code>
                                        </div>
                                    </div>
                                </template>
                            </Card>

                            <!-- Size Info -->
                            <Card class="report-card mb-0">
                                <template #title><i class="pi pi-chart-bar mr-2 text-green-500"></i>Size</template>
                                <template #content>
                                    <div class="outcome-grid">
                                        <div class="outcome-row">
                                            <span class="outcome-label">Payload Size</span><span class="outcome-value">{{ otaFieldValue('Payload Size') }}</span>
                                        </div>
                                        <div class="outcome-row">
                                            <span class="outcome-label">Total Size</span><span class="outcome-value">{{ otaFieldValue('Total Size') }}</span>
                                        </div>
                                    </div>
                                    <div v-if="otaSizePayload > 0 && otaSizeTotal > 0" class="mt-2">
                                        <div class="text-xs text-500 mb-1">Payload / Overhead ratio</div>
                                        <div class="size-bar">
                                            <div class="size-bar-fill" :style="{ width: otaSizeRatio + '%' }"></div>
                                        </div>
                                        <div class="flex justify-content-between text-xs text-500 mt-1">
                                            <span>Payload {{ otaSizeRatio }}%</span>
                                            <span>Overhead {{ 100 - otaSizeRatio }}%</span>
                                        </div>
                                    </div>
                                </template>
                            </Card>
                        </div>
                    </TabPanel>

                    <!-- ===== Tab 3: SDK Evidence ===== -->
                    <TabPanel header="SDK Evidence">
                        <!-- Version flow -->
                        <div class="sdk-flow mb-3">
                            <div class="sdk-flow-node">
                                <div class="text-xs text-500 uppercase mb-1">Decoded</div>
                                <div class="font-semibold">{{ sdkDisplayValue(sdkDecodedVersion) }}</div>
                            </div>
                            <div class="sdk-flow-arrow"><i class="pi pi-arrow-right text-400"></i></div>
                            <div class="sdk-flow-node">
                                <div class="text-xs text-500 uppercase mb-1">Inferred</div>
                                <div class="font-semibold">{{ sdkDisplayValue(sdkInferredVersion) }}</div>
                            </div>
                            <div class="sdk-flow-arrow"><i class="pi pi-arrow-right text-400"></i></div>
                            <div class="sdk-flow-node sdk-flow-best">
                                <div class="text-xs text-500 uppercase mb-1">Best Guess</div>
                                <div class="font-semibold text-blue-600">{{ sdkDisplayValue(sdkBestGuess) }}</div>
                            </div>
                        </div>

                        <!-- Consistency + Source -->
                        <Card class="report-card mb-2">
                            <template #title><i class="pi pi-balance mr-2 text-blue-500"></i>Consistency</template>
                            <template #content>
                                <div class="outcome-row mb-2">
                                    <span class="outcome-label">Verdict</span>
                                    <span class="outcome-value"><Tag :value="sdkDisplayValue(sdkConsistency)" :severity="sdkConsistencySeverity(sdkConsistency)" /></span>
                                </div>
                                <div class="outcome-row">
                                    <span class="outcome-label">Inferred Source</span>
                                    <span class="outcome-value">{{ sdkDisplayValue(sdkInferredSource) }}</span>
                                </div>
                            </template>
                        </Card>

                        <!-- Version Classification -->
                        <Card class="report-card mb-2">
                            <template #title><i class="pi pi-tags mr-2 text-green-500"></i>Version Classification</template>
                            <template #content>
                                <div class="mb-2">
                                    <div class="text-sm font-semibold text-green-600 mb-1">Possible Versions</div>
                                    <div v-if="sdkPossible.length === 0" class="text-500 text-sm">None identified</div>
                                    <div v-else class="flex flex-wrap gap-1">
                                        <Tag v-for="v in sdkPossible" :key="`possible-${v}`" :value="v" severity="success" />
                                    </div>
                                </div>
                                <Divider class="my-2" />
                                <div>
                                    <div class="text-sm font-semibold text-red-600 mb-1">Impossible Versions</div>
                                    <div v-if="sdkImpossible.length === 0" class="text-500 text-sm">None excluded</div>
                                    <div v-else class="flex flex-wrap gap-1">
                                        <Tag v-for="v in sdkImpossible" :key="`impossible-${v}`" :value="v" severity="danger" />
                                    </div>
                                </div>
                            </template>
                        </Card>

                        <!-- Warnings -->
                        <Message v-if="sdkWarnings.length > 0" severity="warn" :closable="false">
                            <template #default>
                                <div class="text-sm font-semibold mb-1">Attribution Warnings</div>
                                <div v-for="(w, idx) in sdkWarnings" :key="`warn-${idx}`" class="text-sm">{{ w }}</div>
                            </template>
                        </Message>
                    </TabPanel>

                    <!-- ===== Tab 4: Stages ===== -->
                    <TabPanel header="Stages">
                        <PipelineStageTimeline
                            :key="selectedResultId"
                            :stage-rows="stageRows"
                            :phase-ii-sections="checklistResults"
                            :backend-stages="sanitizedReport?.stages || []"
                            :dag="dagData"
                            :show-transcript-button="true"
                            @open-transcript="openTranscriptDialog"
                        />
                    </TabPanel>

                    <!-- ===== Tab 5: Provenance ===== -->
                    <TabPanel header="Provenance">
                        <Card class="report-card mb-2">
                            <template #title><i class="pi pi-globe mr-2 text-blue-500"></i>Source</template>
                            <template #content>
                                <div class="outcome-grid">
                                    <div class="outcome-row">
                                        <span class="outcome-label">Network</span><span class="outcome-value"><Tag :value="displayValue(selectedResult.source_network)" severity="warning" /></span>
                                    </div>
                                    <div class="outcome-row col-span-2">
                                        <span class="outcome-label">Source Path</span><code class="outcome-value text-xs">{{ displayValue(selectedResult.source_rel_path) }}</code>
                                    </div>
                                </div>
                            </template>
                        </Card>

                        <Card class="report-card mb-2">
                            <template #title><i class="pi pi-folder-open mr-2 text-orange-500"></i>Files</template>
                            <template #content>
                                <div class="outcome-row mb-2">
                                    <span class="outcome-label">Firmware Store</span>
                                    <span class="outcome-value text-sm" v-tooltip.top="selectedResult.firmware_store_path">{{ displayPathTail(selectedResult.firmware_store_path) }}</span>
                                </div>
                                <div class="outcome-row">
                                    <span class="outcome-label">Report File</span>
                                    <span class="outcome-value text-sm" v-tooltip.top="selectedResult.report_path">{{ displayPathTail(selectedResult.report_path) }}</span>
                                </div>
                            </template>
                        </Card>

                        <Card class="report-card mb-0">
                            <template #title><i class="pi pi-link mr-2 text-purple-500"></i>Parent Run</template>
                            <template #content>
                                <div class="outcome-row">
                                    <span class="outcome-label">Parent Run ID</span>
                                    <code class="outcome-value text-xs">{{ displayValue(selectedResult.parent_run_id) }}</code>
                                </div>
                            </template>
                        </Card>
                    </TabPanel>
                </TabView>
            </div>
        </Sidebar>

        <AiTranscriptDialog v-if="selectedResultId" :visible="transcriptDialogVisible" :result-id="selectedResultId" :section-id="transcriptSectionId" @update:visible="transcriptDialogVisible = $event" />

        <FirmwareJobProgressModal :visible="jobProgressDialogVisible" :job-id="jobProgressJobId" :api-base="apiBase" @update:visible="jobProgressDialogVisible = $event" />
    </div>
</template>

<style scoped>
/* Safari: DataTable scroll container creates a stacking context that
   swallows mouseenter on child elements. translateZ(0) forces the button
   onto its own compositing layer so Safari delivers pointer events. */
button[data-pd-tooltip] {
    transform: translateZ(0);
}

/* ---- Page & Card ---- */
.scan-results-page .results-card,
.scan-results-page .report-card {
    border-radius: 12px;
}

.scan-results-page :deep(.results-card .p-card-body),
.scan-results-page :deep(.report-card .p-card-body) {
    padding: 0.8rem;
}

.scan-results-page :deep(.results-card .p-card-title),
.scan-results-page :deep(.report-card .p-card-title) {
    margin-bottom: 0.35rem;
}

.scan-results-page :deep(.results-card .p-card-content),
.scan-results-page :deep(.report-card .p-card-content) {
    padding-top: 0.35rem;
}

.scan-results-page .filters {
    padding: 0.55rem;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #f9fafb;
}

.scan-results-page .filter-label {
    display: block;
    font-size: 0.82rem;
    color: #6b7280;
    margin-bottom: 0.2rem;
}

/* ---- Sidebar ---- */
:deep(.report-sidebar.p-sidebar) {
    background: #f8fafc;
}
:deep(.report-sidebar .p-sidebar-header) {
    padding: 1rem 1.2rem 0.5rem;
}
:deep(.report-sidebar .p-sidebar-content) {
    padding: 0.5rem 1.2rem 1.2rem;
}

/* ---- Report Content ---- */
.report-content {
    font-size: 0.88rem;
}

.report-banner {
    padding: 1rem 1.2rem;
    background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
    border: 1px solid #dbeafe;
    border-radius: 10px;
}

/* ---- TabView ---- */
.scan-results-page :deep(.p-tabview .p-tabview-nav li .p-tabview-nav-link) {
    padding: 0.45rem 0.75rem;
}

.scan-results-page :deep(.p-tabview .p-tabview-panels) {
    padding: 0.65rem 0.1rem;
}

.scan-results-page :deep(.scan-results-table .p-datatable-table) {
    min-width: 68rem;
}

.scan-results-page :deep(.scan-col-analyzed) {
    white-space: nowrap;
    min-width: 10.5rem;
}

.scan-results-page :deep(.scan-col-id),
.scan-results-page :deep(.scan-col-height) {
    white-space: nowrap;
    min-width: 5.25rem;
}

.scan-results-page :deep(.scan-col-hash) {
    white-space: nowrap;
    min-width: 7.5rem;
}

.scan-results-page :deep(.scan-col-name) {
    min-width: 10rem;
}

.scan-results-page :deep(.scan-col-status),
.scan-results-page :deep(.scan-col-actions) {
    white-space: nowrap;
    min-width: 7rem;
}

/* ---- Verdict Stat Cards ---- */
.stat-card {
    min-height: 66px;
    padding: 0.55rem 0.7rem;
    border-radius: 10px;
    background: #fff;
    border: 1px solid #e5e7eb;
}
.stat-label-text {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

/* ---- Outcome Grid ---- */
.outcome-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    column-gap: 1.2rem;
    row-gap: 0.55rem;
}

.outcome-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px dashed #e5e7eb;
    padding-bottom: 0.3rem;
}

.outcome-label {
    color: #6b7280;
    font-weight: 600;
    font-size: 0.85rem;
    padding-right: 0.75rem;
    white-space: nowrap;
}

.outcome-value {
    color: #111827;
    font-size: 0.9rem;
    text-align: right;
    word-break: break-word;
}

.col-span-2 {
    grid-column: span 2;
}

/* ---- OTA Banner ---- */
.ota-banner-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background: #fff;
}
.banner-pass {
    border-left: 3px solid #22c55e;
}
.banner-pass i {
    color: #22c55e;
}
.banner-fail {
    border-left: 3px solid #ef4444;
}
.banner-fail i {
    color: #ef4444;
}

/* ---- Size Bar ---- */
.size-bar {
    height: 6px;
    border-radius: 3px;
    background: #fee2e2;
    overflow: hidden;
}
.size-bar-fill {
    height: 100%;
    border-radius: 3px;
    background: #22c55e;
    transition: width 0.3s ease;
}

/* ---- SDK Flow ---- */
.sdk-flow {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
}
.sdk-flow-node {
    flex: 1;
    min-width: 80px;
    text-align: center;
    padding: 0.5rem 0.4rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
}
.sdk-flow-best {
    border-color: #93c5fd;
    background: #eff6ff;
}
.sdk-flow-arrow {
    flex-shrink: 0;
    padding: 0 0.15rem;
}

</style>
