<template>
  <Dialog :visible="visible" modal header="Design Analysis Pipeline" :style="{ width: '85vw', maxWidth: '1200px' }"
    @update:visible="$emit('update:visible', $event)" class="builder-dialog">
    <template #header>
      <div class="flex align-items-center gap-3">
        <i class="pi pi-cog text-primary text-2xl"></i>
        <div>
          <div class="text-xl font-bold">Design Analysis Pipeline</div>
          <div class="text-sm text-500">Choose analysis stages and manage execution options.</div>
        </div>
      </div>
    </template>

    <div class="grid">
      <!-- Left Column: Pipeline Builder -->
      <div :class="mode === 'batch' ? 'col-12 lg:col-8' : 'col-12'">
        <!-- Presets -->
        <div class="flex align-items-center gap-2 mb-4 pb-3 border-bottom-1 surface-border overflow-x-auto">
          <span class="text-sm font-bold text-700 mr-2">PRESETS:</span>
          <Button label="Chipset Scan" icon="pi pi-bolt" class="p-button-outlined p-button-sm border-round-lg" @click="applyPreset('chipset')" />
          <Button label="Standard" icon="pi pi-check-circle" class="p-button-outlined p-button-sm border-round-lg" @click="applyPreset('standard')" />
          <Button label="Full Deep-Dive" icon="pi pi-shield" class="p-button-outlined p-button-sm border-round-lg" @click="applyPreset('full')" />
          <Button label="Clear All" icon="pi pi-refresh" class="p-button-text p-button-sm" @click="applyPreset('clear')" />
        </div>

        <!-- Pipeline Visualization -->
        <div class="pipeline-grid pr-2">
          <div v-for="stage in pipelineStages" :key="stage.id" :class="['stage-group p-3 border-round-xl mb-4 transition-all', isStageActive(stage.id) ? 'bg-blue-50 border-1 border-blue-200' : 'surface-100 opacity-60 grayscale']">
            <div class="flex align-items-center justify-content-between mb-3">
              <div class="flex align-items-center gap-2">
                <Checkbox :modelValue="isStageActive(stage.id)" :binary="true" @update:modelValue="toggleStage(stage.id)" />
                <span class="font-bold text-sm uppercase tracking-wider">{{ stage.label }}</span>
              </div>
              <Tag v-if="isStageActive(stage.id)" value="ACTIVE" severity="success" class="px-2" />
              <Tag v-else value="SKIPPED" severity="secondary" class="px-2" />
            </div>

            <div class="grid">
              <div v-for="section in stage.sections" :key="section.id" class="col-12 md:col-6">
                <div :class="['analysis-card p-3 border-round-lg h-full transition-all cursor-pointer shadow-1 border-1',
                  isSectionActive(section.id) ? 'surface-card border-blue-500' : 'surface-200 border-300 opacity-50']"
                  @click="toggleSection(section.id, stage.id)">
                  <div class="flex align-items-center justify-content-between mb-2">
                    <span class="font-bold text-xs">{{ section.name }}</span>
                    <i :class="['pi', isSectionActive(section.id) ? 'pi-check-circle text-blue-500' : 'pi-circle text-400']"></i>
                  </div>
                  <div class="text-xs text-500 line-height-3">{{ section.desc }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Options & Summary (batch mode only) -->
      <div v-if="mode === 'batch'" class="col-12 lg:col-4 border-left-1 surface-border pl-4">
        <div class="flex flex-column gap-4">
          <!-- Target Selection -->
          <div>
            <label class="text-xs font-bold uppercase tracking-wider text-500 block mb-3">Target Selection</label>
            <div class="flex flex-column gap-3">
              <div class="field-radiobutton mb-0 flex align-items-center gap-2 p-3 border-round-lg border-1 surface-border cursor-pointer hover:surface-50"
                @click="run.target = 'selected'">
                <RadioButton v-model="run.target" inputId="builder-tgt-selected" value="selected" />
                <label for="builder-tgt-selected" class="text-sm font-bold flex-grow-1 cursor-pointer">Selected Rows ({{ selectedCount }})</label>
              </div>
              <div class="field-radiobutton mb-0 flex align-items-center gap-2 p-3 border-round-lg border-1 surface-border cursor-pointer hover:surface-50"
                @click="run.target = 'filtered'">
                <RadioButton v-model="run.target" inputId="builder-tgt-filtered" value="filtered" />
                <label for="builder-tgt-filtered" class="text-sm font-bold flex-grow-1 cursor-pointer">All Staged ({{ totalCount }})</label>
              </div>
            </div>
          </div>

          <!-- Estimate / Status -->
          <div class="surface-50 p-3 border-round-lg border-1 surface-border">
            <div class="flex align-items-center justify-content-between mb-3">
              <span class="text-sm font-bold text-700">EXECUTION PLAN:</span>
              <Button v-if="!estimating" icon="pi pi-sync" class="p-button-text p-button-sm p-button-rounded" v-tooltip.top="'Refresh Estimate'" @click="refreshEstimate" />
              <i v-else class="pi pi-spin pi-spinner text-primary"></i>
            </div>
            <div v-if="estimate" class="grid text-center">
              <div class="col-4">
                <div class="text-500 text-xs uppercase mb-1">Staged</div>
                <div class="text-xl font-bold">{{ estimate.staged }}</div>
              </div>
              <div class="col-4">
                <div class="text-blue-600 text-xs uppercase mb-1">Will Run</div>
                <div class="text-xl font-bold text-blue-600">{{ estimate.to_run }}</div>
              </div>
              <div class="col-4">
                <div class="text-500 text-xs uppercase mb-1">Skipped</div>
                <div class="text-xl font-bold">{{ estimate.skip }}</div>
              </div>
            </div>
            <div v-else class="text-center p-3 text-500 text-sm">
              Pipeline selection changed.<br>Refresh estimate to see details.
            </div>
            <div v-if="estimate && estimate.skip > 0" class="mt-3 text-xs text-600 line-height-3 bg-white p-2 border-round">
              {{ estimate.skip }} skipped — {{ estimate.skip_reason }}.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Shared options row -->
    <div class="flex align-items-center gap-4 mt-3 pt-3 border-top-1 surface-border flex-wrap">
      <div class="flex align-items-center gap-3 p-3 border-round-lg bg-yellow-50 border-1 border-yellow-200">
        <Checkbox v-model="run.force" :binary="true" inputId="builder-force" />
        <label for="builder-force" class="text-sm font-bold text-yellow-800 cursor-pointer">Force Re-run (Overwrites existing results)</label>
      </div>
      <div class="flex align-items-center gap-2">
        <label for="builder-parallel" class="text-sm font-bold text-700">Parallel Jobs</label>
        <InputNumber v-model="run.parallel" inputId="builder-parallel" :min="1" :max="64" class="w-5rem" />
      </div>
    </div>

    <template #footer>
      <div class="flex align-items-center justify-content-between w-full pt-3">
        <div class="text-sm text-600">
          <i class="pi pi-info-circle mr-1"></i>
          Custom pipeline is validated before execution.
        </div>
        <div class="flex gap-2">
          <Button label="Cancel" class="p-button-text" @click="$emit('cancel')" />
          <Button label="Execute Analysis" icon="pi pi-play" class="p-button-primary px-5 shadow-2"
            :loading="running" :disabled="!canExecute" @click="emitExecute" />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script>
import { displayStagesRef, pipelinePrereqsRef, loadPipeline } from '@/utils/pipelineDisplay';

export default {
  name: 'PipelineBuilderDialog',
  props: {
    visible: { type: Boolean, default: false },
    mode: { type: String, default: 'single', validator: v => ['single', 'batch'].includes(v) },
    selectedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    apiBase: { type: String, required: true },
    selectedNetwork: { type: String, default: 'testnet' },
    // Batch-mode: filter object for estimate
    activeFilter: { type: Object, default: () => ({}) },
    // Batch-mode: selected SHAs
    selectedShas: { type: Array, default: () => [] },
  },
  emits: ['update:visible', 'cancel', 'execute'],
  data() {
    return {
      estimating: false,
      running: false,
      estimate: null,
      run: {
        analysis: 'default',
        sections: [],
        target: 'selected',
        force: false,
        parallel: 4,
        activeStages: displayStagesRef.value.filter(s => s.id !== 'analysis').map(s => s.id)
      },
    };
  },
  computed: {
    pipelineStages() {
      return displayStagesRef.value;
    },
    canExecute() {
      if (this.mode === 'batch') {
        const hasTarget = this.run.target === 'selected' ? this.selectedCount > 0 : this.totalCount > 0;
        return hasTarget && this.run.activeStages.length > 0;
      }
      return this.run.activeStages.length > 0;
    },
  },
  methods: {
    isStageActive(id) { return this.run.activeStages.includes(id); },
    isSectionActive(id) { return this.run.sections.includes(id); },
    toggleStage(id) {
      const stage = this.pipelineStages.find(s => s.id === id);
      const idx = this.run.activeStages.indexOf(id);
      this.run.analysis = 'custom';
      this.estimate = null;
      if (idx > -1) {
        this.run.activeStages.splice(idx, 1);
        if (stage && stage.sections) {
          stage.sections.forEach(sec => {
            const sIdx = this.run.sections.indexOf(sec.id);
            if (sIdx > -1) this.run.sections.splice(sIdx, 1);
          });
        }
      } else {
        this.run.activeStages.push(id);
        if (stage && stage.sections) {
          stage.sections.forEach(sec => {
            if (!this.run.sections.includes(sec.id)) this.run.sections.push(sec.id);
          });
        }
        this.ensurePrerequisites(id);
      }
    },
    toggleSection(id, stageId) {
      const stage = this.pipelineStages.find(s => s.id === stageId);
      const idx = this.run.sections.indexOf(id);
      this.run.analysis = 'custom';
      this.estimate = null;
      if (idx > -1) {
        this.run.sections.splice(idx, 1);
        if (stage && stage.sections) {
          const anyLeft = stage.sections.some(sec => this.run.sections.includes(sec.id));
          if (!anyLeft) {
            const sIdx = this.run.activeStages.indexOf(stageId);
            if (sIdx > -1) this.run.activeStages.splice(sIdx, 1);
          }
        }
      } else {
        this.run.sections.push(id);
        if (!this.isStageActive(stageId)) this.run.activeStages.push(stageId);
        this.ensurePrerequisites(stageId);
      }
    },
    ensurePrerequisites(stageId) {
      const deps = pipelinePrereqsRef.value || {
        'chipset': ['ota_image'],
        'firmware_encryption': ['chipset'],
        'extract_executable': ['chipset'],
        'disassembly_db': ['extract_executable'],
        'ota_authenticity': ['ota_image'],
        'sidekick_re': ['disassembly_db'],
        'sdk_version': ['disassembly_db'],
        'modular_analysis': ['disassembly_db'],
        'finalize': ['ota_image', 'chipset', 'extract_executable']
      };
      const prereqs = deps[stageId] || [];
      prereqs.forEach(p => {
        if (!this.isStageActive(p)) this.toggleStage(p);
      });
    },
    applyPreset(name) {
      this.estimate = null;
      if (name === 'clear') {
        this.run.activeStages = [];
        this.run.sections = [];
        this.run.analysis = 'default';
      } else if (name === 'chipset') {
        this.run.activeStages = ['classify'];
        this.run.sections = ['chipset_identify', 'chipset_inference', 'manifest_integrity'];
        this.run.analysis = 'custom';
      } else if (name === 'standard') {
        this.run.activeStages = this.pipelineStages.filter(s => s.id !== 'analysis').map(s => s.id);
        this.run.sections = [];
        this.pipelineStages.forEach(s => {
          if (s.id !== 'analysis') {
            s.sections.forEach(sec => this.run.sections.push(sec.id));
          }
        });
        this.run.analysis = 'default';
      } else if (name === 'full') {
        this.run.activeStages = this.pipelineStages.map(s => s.id);
        this.run.sections = [];
        this.pipelineStages.forEach(s => s.sections.forEach(sec => this.run.sections.push(sec.id)));
        this.run.analysis = 'full_security';
      }
      if (this.mode === 'batch') this.refreshEstimate();
    },
    effectiveAnalysis() {
      if (this.run.analysis === 'custom' || this.run.sections.length > 0) return 'custom';
      return this.run.analysis || 'default';
    },
    buildPayload() {
      const payload = {
        analysis_profile: this.effectiveAnalysis() === 'custom' ? 'default' : this.effectiveAnalysis(),
        force: this.run.force,
        worker_parallel: this.run.parallel,
      };
      if (this.run.sections && this.run.sections.length) {
        payload.phase_ii_section_filter = this.run.sections;
      }
      return payload;
    },
    emitExecute() {
      const payload = this.buildPayload();
      if (this.mode === 'batch') {
        payload.target = this.run.target;
        if (this.run.target === 'selected') {
          payload.firmware_sha256 = [...new Set(this.selectedShas.filter(Boolean))];
        } else {
          payload.filter = { ...this.activeFilter };
        }
      }
      this.$emit('execute', payload);
    },
    async refreshEstimate() {
      if (!this.apiBase || this.mode !== 'batch') return;
      const hasTarget = this.run.target === 'selected' ? this.selectedCount > 0 : this.totalCount > 0;
      if (!hasTarget) return;
      this.estimating = true;
      try {
        const filter = this.run.target === 'selected'
          ? { firmware_sha256: [...new Set(this.selectedShas.filter(Boolean))] }
          : { filter: { ...this.activeFilter } };
        const payload = {
          network: this.selectedNetwork,
          analysis: this.effectiveAnalysis(),
          force: this.run.force,
          ...filter
        };
        const res = await fetch(`${this.apiBase}/api/v1/firmware/pool/estimate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (res.ok) this.estimate = await res.json();
      } catch (err) { /* silent */ }
      finally { this.estimating = false; }
    },
  },
  async mounted() {
    await loadPipeline(this.apiBase);
    this.run.activeStages = this.pipelineStages
      .filter(s => s.id !== 'analysis')
      .map(s => s.id);
  },
};
</script>

<style scoped>
.builder-dialog .stage-group { border: 1px solid transparent; }
.builder-dialog .stage-group.grayscale { filter: grayscale(1); opacity: 0.5; }
.builder-dialog .analysis-card { position: relative; border: 2px solid transparent; }
.builder-dialog .analysis-card:hover { border-color: var(--primary-color) !important; }
</style>
