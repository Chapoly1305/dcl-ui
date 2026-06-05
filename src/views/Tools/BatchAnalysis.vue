<template>
  <div class="p-3 batch-analysis-page">
    <div class="grid mb-2">
      <div class="col-12 md:col-6 lg:col-3" v-for="stat in stats" :key="stat.label">
        <div class="card mb-0 stat-tile shadow-1 border-round-xl p-3 flex align-items-center justify-content-between surface-card">
          <div>
            <div class="stat-label text-500 font-medium mb-1">{{ stat.label }}</div>
            <div class="stat-value text-2xl font-bold">{{ stat.value }}</div>
          </div>
          <div :class="['stat-icon flex align-items-center justify-content-center border-round', stat.bgClass]" style="width: 2.5rem; height: 2.5rem">
            <i :class="['text-xl', stat.icon, stat.textClass]"></i>
          </div>
        </div>
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
                <Button icon="pi pi-refresh" class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading" v-tooltip.top="'Reload'" @click="loadInventory" />
              </div>
            </div>
          </template>
          <template #content>
            <!-- Filter & Search -->
            <div class="table-filters mb-4 p-4 surface-card border-round-xl shadow-2 border-1 border-blue-100">
              <div class="flex align-items-center gap-2 mb-4">
                <div class="bg-blue-100 border-round-sm flex align-items-center justify-content-center" style="width: 1.5rem; height: 1.5rem">
                  <i class="pi pi-filter text-blue-600 text-sm" />
                </div>
                <span class="font-bold text-sm uppercase tracking-wider text-700">Filter & Search</span>
              </div>
              <div class="grid">
                <div class="col-12 md:col-6 py-1">
                  <label class="filter-label">General Search</label>
                  <InputText v-model="filters.q" placeholder="Search by SHA, product, or description..." class="w-full p-inputtext-sm" @keyup.enter="applyFilters" />
                </div>
                <div class="col-12 md:col-3 py-1">
                  <label class="filter-label">Chipset Family</label>
                  <Dropdown v-model="filters.chipset" class="w-full p-inputtext-sm" :options="chipsetFamilies"
                    placeholder="Any Chipset" showClear @change="applyFilters" />
                </div>
                <div class="col-12 md:col-3 py-1">
                  <label class="filter-label">Scan Status</label>
                  <Dropdown v-model="filters.status" class="w-full p-inputtext-sm" :options="statusOptions"
                    optionLabel="label" optionValue="value" @change="applyFilters" />
                </div>
                <div class="col-12 md:col-4 py-1">
                  <label class="filter-label">Vendor Name</label>
                  <InputText v-model="filters.vendor" class="w-full p-inputtext-sm" placeholder="Search vendor..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 py-1">
                  <label class="filter-label">VID</label>
                  <InputText v-model="filters.vid" class="w-full p-inputtext-sm" placeholder="0x..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 py-1">
                  <label class="filter-label">PID</label>
                  <InputText v-model="filters.pid" class="w-full p-inputtext-sm" placeholder="0x..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 py-1">
                  <label class="filter-label">Block Height</label>
                  <InputText v-model="filters.blockHeight" class="w-full p-inputtext-sm" placeholder="Exact..." @keyup.enter="applyFilters" />
                </div>
                <div class="col-6 md:col-2 py-1">
                  <label class="filter-label">TX Hash (first 8)</label>
                  <InputText v-model="filters.txHashFirst8" class="w-full p-inputtext-sm" placeholder="e.g. A1B2C3D4" @keyup.enter="applyFilters" />
                </div>
              </div>
              <div class="flex align-items-center justify-content-end gap-3 mt-3 pt-3 border-top-1 surface-border">
                <Button label="Clear Filters" icon="pi pi-filter-slash" class="p-button-text p-button-sm" @click="clearFilters" />
                <Button label="Apply Filters" icon="pi pi-search" class="p-button-sm px-4" @click="applyFilters" />
                <Button :label="selectedRows.length > 0 ? `Design Analysis (${selectedRows.length} items)` : 'Design Analysis'" 
                  icon="pi pi-cog" class="p-button-primary p-button-sm px-4 shadow-2" @click="openBuilder" />
              </div>
            </div>

            <Message v-if="error" severity="error" :closable="true" @close="error = null" class="mb-3">{{ error }}</Message>
            <Message v-else-if="actionNote" severity="success" :closable="true" @close="actionNote = null" class="mb-3">{{ actionNote }}</Message>

            <DataTable :value="rows" :lazy="true" :loading="loading" paginator :rows="pageSize" :first="pageFirst"
              :totalRecords="totalCount" @page="onPage" v-model:selection="selectedRows" dataKey="row_key"
              sortMode="single" :sortField="sortField" :sortOrder="sortOrder" @sort="onSort"
              responsiveLayout="scroll" class="p-datatable-sm">
              <Column selectionMode="multiple" headerStyle="width: 3rem"></Column>
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

    <FirmwareJobProgressModal :visible="progressDialogVisible" :job-id="progressJobId" :api-base="metadataApiBase"
      @update:visible="progressDialogVisible = $event" />

    <!-- Analysis Builder Modal -->
    <PipelineBuilderDialog
      v-model:visible="builderVisible"
      mode="batch"
      :apiBase="metadataApiBase"
      :selectedNetwork="selectedNetwork"
      :selectedCount="selectedRows.length"
      :totalCount="totalCount"
      :selectedShas="selectedRows.map(r => r.firmware_sha256).filter(Boolean)"
      :activeFilter="activeFilter()"
      @execute="onBuilderExecute"
      @cancel="builderVisible = false"
    />
  </div>
</template>

<script>
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';
import PipelineBuilderDialog from '@/components/PipelineBuilderDialog.vue';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'BatchAnalysis',
  components: { FirmwareJobProgressModal, PipelineBuilderDialog },
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
      filters: this.defaultFilters(),
      statusOptions: [
        { label: 'All Statuses', value: 'any' },
        { label: 'Analysis Complete', value: 'scanned' },
        { label: 'Need Analysis', value: 'unscanned' }
      ],
      chipsetFamilies: [],
      profiles: [],
      sectionOptions: [],
      selectedRows: [],
      builderVisible: false,
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
        { label: 'Total in Pool', value: this.poolTotal, icon: 'pi pi-database', bgClass: 'bg-blue-100', textClass: 'text-blue-600' },
        { label: 'Ready for Analysis', value: this.totalCount, icon: 'pi pi-filter', bgClass: 'bg-orange-100', textClass: 'text-orange-600' },
        { label: 'Analysis Complete', value: this.scannedCount, icon: 'pi pi-check-circle', bgClass: 'bg-green-100', textClass: 'text-green-600' },
        { label: 'Selected Items', value: this.selectedRows.length, icon: 'pi pi-list', bgClass: 'bg-purple-100', textClass: 'text-purple-600' }
      ];
    },
    analysisOptions() {
      const base = [{ label: 'Chipset Scan (fast)', value: 'chipset_scan' }];
      const profs = this.profiles.map((p) => ({ label: p.label, value: p.id }));
      return base.concat(profs);
    },
  },
  methods: {
    defaultFilters() {
      return { chipset: null, status: 'any', vendor: '', vid: '', pid: '', blockHeight: '', txHashFirst8: '', q: '' };
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
    openBuilder() {
      this.builderVisible = true;
    },
    activeFilter() {
      const f = {};
      if (this.filters.chipset) f.chipset = this.filters.chipset;
      if (this.filters.status && this.filters.status !== 'any') f.status = this.filters.status;
      if (this.filters.vendor) f.vendor = this.filters.vendor;
      if (this.filters.vid) f.vid = Number(this.filters.vid);
      if (this.filters.pid) f.pid = Number(this.filters.pid);
      if (this.filters.blockHeight) f.block_height = Number(this.filters.blockHeight);
      if (this.filters.txHashFirst8) f.tx_hash_first8 = this.filters.txHashFirst8.trim().toUpperCase();
      if (this.filters.q) f.q = this.filters.q;
      return f;
    },
    async onBuilderExecute(payload) {
      this.running = true; this.error = null;
      try {
        const target = payload.target === 'selected'
          ? { firmware_sha256: payload.firmware_sha256 }
          : { filter: payload.filter || this.activeFilter() };
        let jobId = '';

        if (payload.analysis_profile === 'chipset_scan') {
          const res = await fetch(`${this.metadataApiBase}/api/v1/firmware/pool/scan`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ network: this.selectedNetwork, force: payload.force, ...target })
          });
          if (!res.ok) throw new Error(`Scan enqueue failed (${res.status})`);
          jobId = String((await res.json())?.job?.job_id || '');
          this.actionNote = 'Chipset scan queued.';
        } else {
          const body = {
            network: this.selectedNetwork,
            analysis_profile: payload.analysis_profile,
            worker_parallel: payload.worker_parallel,
            force: payload.force,
            ...target
          };
          if (payload.phase_ii_section_filter && payload.phase_ii_section_filter.length) {
            body.phase_ii_section_filter = payload.phase_ii_section_filter;
          }
          const res = await fetch(`${this.metadataApiBase}/api/v1/firmware/pool/analyze`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          if (!res.ok) throw new Error(`Analyze enqueue failed (${res.status})`);
          const d = await res.json();
          jobId = String((d.enqueued || [])[0] || '');
          this.actionNote = `Queued ${(d.enqueued || []).length} analysis job(s); ${(d.skipped_existing || []).length} already queued.`;
        }
        this.builderVisible = false;
        if (jobId) this.openJobProgress(jobId);
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to start run';
      } finally {
        this.running = false;
      }
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
        ['vid', this.filters.vid], ['pid', this.filters.pid],
        ['block_height', this.filters.blockHeight], ['tx_hash_first8', this.filters.txHashFirst8],
        ['q', this.filters.q]];
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
  async mounted() {
    this.loadMeta();
    this.loadInventory();
  }
};
</script>

<style scoped>
.batch-analysis-page .stat-tile { transition: transform 0.2s, box-shadow 0.2s; border: 1px solid var(--surface-border); }
.batch-analysis-page .stat-tile:hover { transform: translateY(-2px); box-shadow: var(--card-shadow); }
.batch-analysis-page .filter-label { display: block; font-size: 0.7rem; font-weight: 700; color: var(--text-color-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
.batch-action-bar { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.batch-action-bar.bg-blue-50 { border-color: var(--blue-500) !important; }

/* Builder Dialog Styles */
.builder-dialog .stage-group { border: 1px solid transparent; }
.builder-dialog .stage-group.grayscale { filter: grayscale(1); opacity: 0.5; }
.builder-dialog .analysis-card { position: relative; border: 2px solid transparent; }
.builder-dialog .analysis-card:hover { transform: translateY(-2px); box-shadow: var(--card-shadow); }
.builder-dialog .analysis-card.surface-card { border-color: var(--blue-400); }
.builder-dialog .pipeline-grid { max-height: 60vh; overflow-y: auto; padding-right: 0.5rem; }
</style>
