<template>
  <div class="p-3 batch-analysis-page">
    <div class="grid">
      <div class="col-6 md:col-3" v-for="stat in stats" :key="stat.label">
        <div class="card mb-0 stat-card">
          <div class="stat-label">{{ stat.label }}</div>
          <div class="stat-value">{{ stat.value }}</div>
        </div>
      </div>

      <div class="col-12">
        <Card class="table-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Batch Analysis</span>
                <Tag :value="`Network: ${selectedNetwork}`" severity="info" />
              </div>
              <div class="flex align-items-center gap-2 flex-wrap">
                <div class="table-meta text-600 text-sm">
                  Showing {{ totalCount === 0 ? 0 : pageFirst + 1 }} - {{ Math.min(pageFirst + pageSize, totalCount) }} of {{ totalCount }} staged
                </div>
                <Button icon="pi pi-filter" class="p-button-text p-button-sm p-button-rounded"
                  v-tooltip.top="'Show/Hide Filters'" @click="tableFiltersExpanded = !tableFiltersExpanded" />
                <Button icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading" v-tooltip.top="'Reload'" @click="loadInventory" />
              </div>
            </div>
          </template>
          <template #content>
            <!-- Filters -->
            <div v-show="tableFiltersExpanded" class="table-filters mb-3">
              <div class="grid">
                <div class="col-6 md:col-2 pt-0">
                  <label class="filter-label">Chipset Family</label>
                  <Dropdown v-model="filters.chipset" class="w-full p-inputtext-sm" :options="chipsetFamilies"
                    placeholder="Any" showClear @change="applyFilters" />
                </div>
                <div class="col-6 md:col-2 pt-0">
                  <label class="filter-label">Scan Status</label>
                  <Dropdown v-model="filters.status" class="w-full p-inputtext-sm" :options="statusOptions"
                    optionLabel="label" optionValue="value" @change="applyFilters" />
                </div>
                <div class="col-6 md:col-2 pt-0">
                  <label class="filter-label">Vendor</label>
                  <InputText v-model="filters.vendor" class="w-full p-inputtext-sm" placeholder="Contains..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 pt-0">
                  <label class="filter-label">VID</label>
                  <InputText v-model="filters.vid" class="w-full p-inputtext-sm" placeholder="Exact" @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 pt-0">
                  <label class="filter-label">PID</label>
                  <InputText v-model="filters.pid" class="w-full p-inputtext-sm" placeholder="Exact" @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 pt-0">
                  <label class="filter-label">Search</label>
                  <InputText v-model="filters.q" class="w-full p-inputtext-sm" placeholder="SHA / product..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-12 flex align-items-center justify-content-end gap-2 mt-2">
                  <Button label="Clear" icon="pi pi-filter-slash" class="p-button-text p-button-sm" @click="clearFilters" />
                  <Button label="Apply Filters" icon="pi pi-search" class="p-button-sm" @click="applyFilters" />
                </div>
              </div>
            </div>

            <Message v-if="error" severity="error" :closable="true" @close="error = null" class="mb-3">{{ error }}</Message>
            <Message v-else-if="actionNote" severity="success" :closable="true" @close="actionNote = null" class="mb-3">{{ actionNote }}</Message>

            <!-- Run panel -->
            <div class="batch-panel surface-100 border-round p-3 mb-3">
              <div class="grid align-items-end">
                <div class="col-12 md:col-3">
                  <label class="filter-label">Analysis</label>
                  <Dropdown v-model="run.analysis" class="w-full p-inputtext-sm" :options="analysisOptions"
                    optionLabel="label" optionValue="value" />
                </div>
                <div class="col-12 md:col-4" v-if="run.analysis !== 'chipset_scan'">
                  <label class="filter-label">Advanced sections (overrides profile)</label>
                  <MultiSelect v-model="run.sections" class="w-full p-inputtext-sm" :options="sectionOptions"
                    optionLabel="name" optionValue="id" display="chip" filter placeholder="Use profile" :maxSelectedLabels="3" />
                </div>
                <div class="col-12 md:col-3">
                  <label class="filter-label">Target</label>
                  <div class="flex align-items-center gap-3 mt-1 flex-wrap">
                    <div class="flex align-items-center gap-1">
                      <RadioButton v-model="run.target" inputId="tgt-filtered" value="filtered" />
                      <label for="tgt-filtered" class="text-sm">All staged ({{ totalCount }})</label>
                    </div>
                    <div class="flex align-items-center gap-1">
                      <RadioButton v-model="run.target" inputId="tgt-selected" value="selected" />
                      <label for="tgt-selected" class="text-sm">Selected ({{ selectedRows.length }})</label>
                    </div>
                  </div>
                </div>
                <div class="col-12 md:col-2">
                  <div class="flex align-items-center gap-2 mb-2">
                    <Checkbox v-model="run.force" :binary="true" inputId="force" />
                    <label for="force" class="text-sm">Force re-run</label>
                  </div>
                  <Button label="Run Analysis" icon="pi pi-play" class="p-button-sm w-full"
                    :loading="estimating" :disabled="!canRun" @click="prepareRun" />
                </div>
              </div>
            </div>

            <DataTable :value="rows" :lazy="true" :loading="loading" paginator :rows="pageSize" :first="pageFirst"
              :totalRecords="totalCount" @page="onPage" v-model:selection="selectedRows" dataKey="row_key"
              sortMode="single" :sortField="sortField" :sortOrder="sortOrder" @sort="onSort"
              responsiveLayout="scroll" class="p-datatable-sm">
              <Column selectionMode="multiple" headerStyle="width: 3rem"></Column>
              <Column field="firmware_sha256" header="SHA-256">
                <template #body="s">
                  <span class="font-mono text-sm">{{ (s.data.firmware_sha256 || '—').slice(0, 12) }}<template v-if="s.data.firmware_sha256">…</template></span>
                </template>
              </Column>
              <Column field="chipset_family" header="Chipset" sortable>
                <template #body="s">
                  <Tag v-if="s.data.chipset_family" :value="s.data.chipset_family" :severity="tierSeverity(s.data.chipset_confidence_tier)" />
                  <span v-else class="text-500">not scanned</span>
                </template>
              </Column>
              <Column field="vid" header="VID" sortable></Column>
              <Column field="pid" header="PID" sortable></Column>
              <Column field="software_version" header="SW Version" sortable>
                <template #body="s">{{ s.data.software_version_string || s.data.software_version || '—' }}</template>
              </Column>
              <Column field="vendor_name" header="Vendor" sortable>
                <template #body="s">{{ s.data.vendor_name || '—' }}</template>
              </Column>
              <Column field="product_name" header="Product">
                <template #body="s">{{ s.data.product_name || '—' }}</template>
              </Column>
              <Column field="formality_conformance" header="Conformance" headerClass="text-center" bodyClass="text-center">
                <template #body="s">
                  <Tag v-if="s.data.formality_conformance" :value="s.data.formality_conformance" :severity="conformanceSeverity(s.data.formality_conformance)" />
                  <span v-else class="text-500">—</span>
                </template>
              </Column>
              <Column field="scanned" header="Scan" headerClass="text-center" bodyClass="text-center">
                <template #body="s">
                  <Tag :value="s.data.scanned ? 'Scanned' : 'Pending'" :severity="s.data.scanned ? 'success' : 'secondary'" />
                </template>
              </Column>
            </DataTable>
            <div v-if="!loading && !error && totalCount === 0" class="flex flex-column align-items-center justify-content-center p-5 text-500">
              <i class="pi pi-inbox text-4xl mb-3"></i>
              <span class="text-lg">No downloaded firmware for this network (or none match the filter).</span>
            </div>
          </template>
        </Card>
      </div>
    </div>

    <!-- Confirm dialog -->
    <Dialog :visible="confirmVisible" modal header="Confirm Analysis" :style="{ width: '34rem' }"
      @update:visible="confirmVisible = $event">
      <div v-if="estimate" class="confirm-body">
        <p class="mb-3">
          Run <b>{{ analysisLabel(run.analysis) }}</b>
          <span v-if="run.analysis !== 'chipset_scan' && run.sections.length"> (sections: {{ run.sections.join(', ') }})</span>
          on <b>{{ estimate.staged }}</b> downloaded firmware
          <span class="text-600">({{ run.target === 'selected' ? 'selected rows' : 'all staged' }}, network {{ selectedNetwork }})</span>.
        </p>
        <div class="grid text-center">
          <div class="col-4"><div class="text-500 text-sm">Staged</div><div class="text-2xl font-bold">{{ estimate.staged }}</div></div>
          <div class="col-4"><div class="text-green-600 text-sm">Will run</div><div class="text-2xl font-bold">{{ estimate.to_run }}</div></div>
          <div class="col-4"><div class="text-500 text-sm">Skipped</div><div class="text-2xl font-bold">{{ estimate.skip }}</div></div>
        </div>
        <p v-if="estimate.skip > 0" class="text-600 text-sm mt-2">{{ estimate.skip }} skipped — {{ estimate.skip_reason }}. Enable "Force re-run" to include them.</p>
        <p v-if="estimate.to_run === 0" class="text-orange-600 text-sm mt-2">Nothing to run with the current selection.</p>
      </div>
      <template #footer>
        <Button label="Cancel" icon="pi pi-times" class="p-button-text" @click="confirmVisible = false" />
        <Button label="Proceed" icon="pi pi-check" :loading="running" :disabled="!estimate || estimate.to_run === 0" @click="executeRun" />
      </template>
    </Dialog>

    <FirmwareJobProgressModal :visible="progressDialogVisible" :job-id="progressJobId" :api-base="metadataApiBase"
      @update:visible="progressDialogVisible = $event" />
  </div>
</template>

<script>
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'BatchAnalysis',
  components: { FirmwareJobProgressModal },
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      metadataApiBase: requestBase,
      loading: false,
      estimating: false,
      running: false,
      error: null,
      actionNote: null,
      rows: [],
      totalCount: 0,
      poolTotal: 0,
      scannedCount: 0,
      pageSize: 50,
      pageFirst: 0,
      sortField: 'block_height',
      sortOrder: -1,
      tableFiltersExpanded: false,
      filters: this.defaultFilters(),
      statusOptions: [
        { label: 'Any', value: 'any' },
        { label: 'Scanned', value: 'scanned' },
        { label: 'Unscanned', value: 'unscanned' }
      ],
      chipsetFamilies: [],
      profiles: [],
      sectionOptions: [],
      selectedRows: [],
      run: { analysis: 'chipset_scan', sections: [], target: 'filtered', force: false },
      confirmVisible: false,
      estimate: null,
      progressDialogVisible: false,
      progressJobId: ''
    };
  },
  computed: {
    selectedNetwork() {
      const key = String(
        this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || 'testnet'
      ).trim().toLowerCase();
      return key === 'mainnet' || key === 'testnet' ? key : 'testnet';
    },
    stats() {
      return [
        { label: 'Total Firmware', value: this.poolTotal },
        { label: 'Staged (filter)', value: this.totalCount },
        { label: 'Scanned (in view)', value: this.scannedCount },
        { label: 'Selected', value: this.selectedRows.length }
      ];
    },
    analysisOptions() {
      const base = [{ label: 'Chipset Scan (fast)', value: 'chipset_scan' }];
      const profs = this.profiles.map((p) => ({ label: p.label, value: p.id }));
      return base.concat(profs);
    },
    canRun() {
      if (this.run.target === 'selected') return this.selectedRows.length > 0;
      return this.totalCount > 0;
    }
  },
  methods: {
    defaultFilters() {
      return { chipset: null, status: 'any', vendor: '', vid: '', pid: '', q: '' };
    },
    clearFilters() { this.filters = this.defaultFilters(); this.pageFirst = 0; this.loadInventory(); },
    applyFilters() { this.pageFirst = 0; this.loadInventory(); },
    onPage(event) { this.pageFirst = event.first; this.pageSize = event.rows; this.loadInventory(); },
    onSort(event) { this.sortField = event.sortField || 'block_height'; this.sortOrder = event.sortOrder || -1; this.pageFirst = 0; this.loadInventory(); },
    tierSeverity(tier) {
      const k = String(tier || '').toLowerCase();
      if (k === 'confirmed') return 'success';
      if (k === 'inferred') return 'warning';
      return 'secondary';
    },
    conformanceSeverity(value) {
      const k = String(value || '').toLowerCase();
      if (k === 'pass') return 'success';
      if (k === 'violation') return 'danger';
      if (k === 'pending') return 'warning';
      return 'secondary';
    },
    analysisLabel(value) {
      const o = this.analysisOptions.find((x) => x.value === value);
      return o ? o.label : value;
    },
    activeFilter() {
      const f = {};
      if (this.filters.chipset) f.chipset = this.filters.chipset;
      if (this.filters.status && this.filters.status !== 'any') f.status = this.filters.status;
      if (this.filters.vendor) f.vendor = this.filters.vendor;
      if (this.filters.vid) f.vid = Number(this.filters.vid);
      if (this.filters.pid) f.pid = Number(this.filters.pid);
      if (this.filters.q) f.q = this.filters.q;
      return f;
    },
    buildInventoryQuery() {
      const params = new URLSearchParams({
        network: this.selectedNetwork,
        limit: String(this.pageSize),
        offset: String(this.pageFirst),
        status: this.filters.status || 'any',
        sort_by: this.sortField || 'block_height',
        sort_dir: this.sortOrder === 1 ? 'asc' : 'desc'
      });
      const map = [['chipset', this.filters.chipset], ['vendor', this.filters.vendor],
        ['vid', this.filters.vid], ['pid', this.filters.pid], ['q', this.filters.q]];
      for (const [k, v] of map) {
        if (v !== null && v !== undefined && String(v).trim() !== '') params.set(k, String(v).trim());
      }
      return params.toString();
    },
    async loadInventory() {
      if (!this.metadataApiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        return;
      }
      this.loading = true; this.error = null;
      try {
        const url = `${this.metadataApiBase}/api/v1/firmware/pool/inventory?${this.buildInventoryQuery()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Inventory load failed (${res.status})`);
        const d = await res.json();
        // dataKey needs a stable unique value per row (sha may repeat across records).
        this.rows = (d.items || []).map((it, i) => ({ ...it, row_key: `${it.vid}-${it.pid}-${it.block_height}-${it.tx_hash_first8 || i}` }));
        this.totalCount = Number(d.total_count || 0);
        this.poolTotal = Number(d.pool_total || 0);
        this.scannedCount = Number(d.scanned_count || 0);
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load inventory';
      } finally {
        this.loading = false;
      }
    },
    async loadMeta() {
      if (!this.metadataApiBase) return;
      try {
        const r = await fetch(`${this.metadataApiBase}/api/v1/analysis/profiles`);
        if (r.ok) {
          const d = await r.json();
          this.profiles = Array.isArray(d.profiles) ? d.profiles : [];
          this.sectionOptions = Array.isArray(d.sections) ? d.sections : [];
          this.chipsetFamilies = Array.isArray(d.chipset_families) ? d.chipset_families : [];
        }
      } catch (err) { /* non-fatal */ }
    },
    targetPayload() {
      // Selected rows resolve to distinct SHAs; otherwise pass the active filter.
      if (this.run.target === 'selected') {
        const shas = [...new Set(this.selectedRows.map((r) => r.firmware_sha256).filter(Boolean))];
        return { firmware_sha256: shas };
      }
      return { filter: this.activeFilter() };
    },
    effectiveAnalysis() {
      if (this.run.analysis === 'chipset_scan') return 'chipset_scan';
      return (this.run.sections && this.run.sections.length) ? 'custom' : this.run.analysis;
    },
    async prepareRun() {
      if (!this.metadataApiBase || !this.canRun) return;
      this.estimating = true; this.error = null;
      try {
        const payload = { network: this.selectedNetwork, analysis: this.effectiveAnalysis(), force: this.run.force, ...this.targetPayload() };
        const res = await fetch(`${this.metadataApiBase}/api/v1/firmware/pool/estimate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Estimate failed (${res.status})`);
        this.estimate = await res.json();
        this.confirmVisible = true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to estimate run';
      } finally {
        this.estimating = false;
      }
    },
    async executeRun() {
      if (!this.metadataApiBase) return;
      this.running = true; this.error = null;
      try {
        const target = this.targetPayload();
        let jobId = '';
        if (this.run.analysis === 'chipset_scan') {
          const res = await fetch(`${this.metadataApiBase}/api/v1/firmware/pool/scan`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ network: this.selectedNetwork, force: this.run.force, ...target })
          });
          if (!res.ok) throw new Error(`Scan enqueue failed (${res.status})`);
          jobId = String((await res.json())?.job?.job_id || '');
          this.actionNote = 'Chipset scan queued.';
        } else {
          const payload = { network: this.selectedNetwork, analysis_profile: this.run.analysis, ...target };
          if (this.run.sections && this.run.sections.length) payload.phase_ii_section_filter = this.run.sections;
          const res = await fetch(`${this.metadataApiBase}/api/v1/firmware/pool/analyze`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error(`Analyze enqueue failed (${res.status})`);
          const d = await res.json();
          jobId = String((d.enqueued || [])[0] || '');
          this.actionNote = `Queued ${(d.enqueued || []).length} analysis job(s); ${(d.skipped_existing || []).length} already queued.`;
        }
        this.confirmVisible = false;
        if (jobId) this.openJobProgress(jobId);
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to start run';
      } finally {
        this.running = false;
      }
    },
    openJobProgress(jobId) {
      const id = String(jobId || '').trim();
      if (!id) return;
      this.progressJobId = id;
      this.progressDialogVisible = true;
    }
  },
  watch: {
    selectedNetwork() { this.pageFirst = 0; this.selectedRows = []; this.loadInventory(); }
  },
  mounted() { this.loadMeta(); this.loadInventory(); }
};
</script>

<style scoped>
.batch-analysis-page .stat-card { padding: 0.75rem 1rem; }
.batch-analysis-page .stat-label { font-size: 0.75rem; color: var(--text-color-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
.batch-analysis-page .stat-value { font-size: 1.4rem; font-weight: 600; }
.batch-analysis-page .filter-label { display: block; font-size: 0.75rem; color: var(--text-color-secondary); margin-bottom: 0.25rem; }
.batch-analysis-page .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
