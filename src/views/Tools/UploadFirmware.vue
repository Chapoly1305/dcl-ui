<template>
  <div class="p-3 upload-firmware-page">
    <Card>
      <template #title>
        <div class="flex align-items-center gap-2 flex-wrap">
          <i class="pi pi-upload text-primary"></i>
          <span>Custom Firmware</span>
        </div>
      </template>
      <template #content>
        <TabView v-model:activeIndex="activeTab">
          <!-- ── Upload tab ─────────────────────────────────────────── -->
          <TabPanel header="Upload">
            <Message severity="info" :closable="false" class="mb-4">
              Upload an arbitrary firmware image to run through the full analysis pipeline.
              No VID/PID/version or DCL record is required — this is for firmware that is
              <b>not on the DCL</b>, including vendor pre-release builds, retail dumps, and
              non-Matter images such as <b>Zigbee</b> GBL/ELF. Uploaded firmware stays here on
              this page and is <b>not</b> mixed into the DCL firmware pool.
            </Message>

            <div
              class="dropzone border-round-xl mb-4"
              :class="{ 'dropzone-active': dragging, 'dropzone-filled': !!selectedFile }"
              @dragover.prevent="dragging = true"
              @dragleave.prevent="dragging = false"
              @drop.prevent="onDrop"
              @click="triggerPicker"
            >
              <input ref="fileInput" type="file" class="hidden" @change="onPick" />
              <div v-if="!selectedFile" class="flex flex-column align-items-center justify-content-center gap-2 py-5 text-500">
                <i class="pi pi-cloud-upload text-4xl"></i>
                <span class="text-lg font-medium">Drop a firmware file here, or click to browse</span>
                <span class="text-sm">Any format — .ota, .gbl, .bin, .elf, .img, … (max {{ maxSizeLabel }})</span>
              </div>
              <div v-else class="flex align-items-center justify-content-between gap-3 py-4 px-2">
                <div class="flex align-items-center gap-3 min-w-0">
                  <i class="pi pi-file text-3xl text-primary"></i>
                  <div class="min-w-0">
                    <div class="font-bold text-900 white-space-nowrap overflow-hidden text-overflow-ellipsis">{{ selectedFile.name }}</div>
                    <div class="text-500 text-sm">{{ formatSize(selectedFile.size) }}</div>
                  </div>
                </div>
                <Button icon="pi pi-times" class="p-button-text p-button-rounded p-button-sm"
                  v-tooltip.left="'Remove'" @click.stop="clearFile" />
              </div>
            </div>

            <div class="grid mb-2">
              <div class="col-12 md:col-8">
                <label class="opt-label">Analysis Profile</label>
                <Dropdown v-model="analysisProfile" class="w-full" :options="profileOptions"
                  optionLabel="label" optionValue="value" placeholder="Select a profile" />
              </div>
              <div class="col-12 md:col-4 flex align-items-end">
                <div class="flex align-items-center gap-2 pb-2">
                  <Checkbox v-model="codeOnly" :binary="true" inputId="codeOnly" />
                  <label for="codeOnly" class="text-700 text-sm cursor-pointer">Code-only (skip LLM sections)</label>
                </div>
              </div>
            </div>

            <Message v-if="error" severity="error" :closable="true" @close="error = null" class="mb-3">{{ error }}</Message>

            <div class="flex align-items-center justify-content-between gap-2 flex-wrap mt-2">
              <div class="text-500 text-sm">
                Files are stored keyed by SHA-256; re-uploading the same image reuses the existing copy.
              </div>
              <Button label="Upload & Analyze" icon="pi pi-play" class="px-4 shadow-2"
                :loading="uploading" :disabled="!selectedFile || uploading" @click="submit" />
            </div>
          </TabPanel>

          <!-- ── Results tab ────────────────────────────────────────── -->
          <TabPanel header="Results">
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
              <span class="text-600 text-sm">
                {{ results.length }} uploaded firmware {{ results.length === 1 ? 'result' : 'results' }}
              </span>
              <Button icon="pi pi-refresh" label="Refresh" class="p-button-text p-button-sm"
                :loading="resultsLoading" @click="loadResults" />
            </div>

            <Message v-if="resultsError" severity="error" :closable="true" @close="resultsError = null" class="mb-3">{{ resultsError }}</Message>

            <DataTable :value="results" :loading="resultsLoading" class="p-datatable-sm" responsiveLayout="scroll" dataKey="row_key">
              <Column field="input_firmware_name" header="File">
                <template #body="s">
                  <span class="font-medium">{{ displayName(s.data) }}</span>
                </template>
              </Column>
              <Column field="firmware_sha256" header="SHA-256">
                <template #body="s"><code class="text-sm">{{ shortSha(s.data.firmware_sha256) }}</code></template>
              </Column>
              <Column field="chipset" header="Chipset">
                <template #body="s">
                  <Tag v-if="s.data.chipset && s.data.chipset !== 'unknown'" :value="s.data.chipset" severity="info" />
                  <span v-else class="text-500">—</span>
                </template>
              </Column>
              <Column field="sdk_primary_version" header="SDK Version">
                <template #body="s">
                  <span v-if="s.data.sdk_primary_version === 'undetermined'" class="text-500" v-tooltip.top="'No Matter data model detected'">not Matter</span>
                  <span v-else>{{ displayValue(s.data.sdk_primary_version) }}</span>
                </template>
              </Column>
              <Column field="status" header="Status" bodyClass="text-center" headerClass="text-center">
                <template #body="s">
                  <Tag :value="s.data.status || '—'" :severity="statusSeverity(s.data.status)" />
                </template>
              </Column>
              <Column field="analyzed_at" header="Analyzed At">
                <template #body="s">{{ formatTimestamp(s.data.analyzed_at) }}</template>
              </Column>
              <Column header="Actions" headerClass="text-right" bodyClass="text-right">
                <template #body="s">
                  <Button v-if="s.data.job_id" label="Progress" icon="pi pi-chart-line" class="p-button-text p-button-sm"
                    @click="openJobProgress(s.data.job_id)" />
                  <Button v-if="s.data.result_id" label="Details" icon="pi pi-search" class="p-button-text p-button-sm"
                    @click="viewResults(s.data.firmware_sha256)" />
                </template>
              </Column>
            </DataTable>
            <div v-if="!resultsLoading && !resultsError && results.length === 0"
              class="flex flex-column align-items-center justify-content-center p-5 text-500">
              <i class="pi pi-inbox text-4xl mb-3"></i>
              <span class="text-lg">No uploaded firmware yet. Use the Upload tab to add one.</span>
            </div>
          </TabPanel>
        </TabView>
      </template>
    </Card>

    <FirmwareJobProgressModal :visible="progressDialogVisible" :job-id="progressJobId" :api-base="metadataApiBase"
      @update:visible="onProgressVisibleChange" />
  </div>
</template>

<script>
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

const MAX_BYTES = 256 * 1024 * 1024;

export default {
  name: 'UploadFirmware',
  components: { FirmwareJobProgressModal },
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      metadataApiBase: requestBase,
      activeTab: 0,
      // Upload tab
      dragging: false,
      selectedFile: null,
      analysisProfile: 'full',
      codeOnly: false,
      profiles: [],
      uploading: false,
      error: null,
      // Results tab
      results: [],
      resultsLoading: false,
      resultsError: null,
      pollHandle: null,
      // Progress modal
      progressDialogVisible: false,
      progressJobId: ''
    };
  },
  computed: {
    selectedNetwork() {
      const key = String(
        this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || 'testnet'
      ).trim().toLowerCase();
      return key === 'mainnet' ? 'mainnet' : 'testnet';
    },
    maxSizeLabel() {
      return this.formatSize(MAX_BYTES);
    },
    profileOptions() {
      const opts = this.profiles.map((p) => ({ label: p.label, value: p.id }));
      if (!opts.find((o) => o.value === 'full')) opts.unshift({ label: 'Full Analysis', value: 'full' });
      return opts;
    },
    hasInProgress() {
      return this.results.some((r) => ['pending', 'running'].includes(String(r.status || '').toLowerCase()));
    }
  },
  methods: {
    triggerPicker() {
      this.$refs.fileInput && this.$refs.fileInput.click();
    },
    onPick(event) {
      const f = event.target.files && event.target.files[0];
      if (f) this.setFile(f);
      event.target.value = '';
    },
    onDrop(event) {
      this.dragging = false;
      const f = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (f) this.setFile(f);
    },
    setFile(f) {
      this.error = null;
      if (f.size > MAX_BYTES) {
        this.error = `File is too large (${this.formatSize(f.size)}). Max is ${this.maxSizeLabel}.`;
        return;
      }
      this.selectedFile = f;
    },
    clearFile() {
      this.selectedFile = null;
    },
    async submit() {
      if (!this.selectedFile) return;
      if (!this.metadataApiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        return;
      }
      this.uploading = true;
      this.error = null;
      try {
        const form = new FormData();
        form.append('file', this.selectedFile);
        form.append('analysis_profile', this.analysisProfile || 'full');
        form.append('phase_ii_code_only', this.codeOnly ? 'true' : 'false');
        const res = await fetch(`${this.metadataApiBase}/api/v1/firmware/upload`, { method: 'POST', body: form });
        if (!res.ok) {
          let detail = `Upload failed (${res.status})`;
          try { detail = (await res.json())?.detail || detail; } catch (_e) { /* ignore */ }
          throw new Error(detail);
        }
        const d = await res.json();
        const jobId = String(d?.job?.job_id || '');
        this.selectedFile = null;
        // Jump to the Results tab and surface progress for the new job.
        this.activeTab = 1;
        await this.loadResults();
        if (jobId) this.openJobProgress(jobId);
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Upload failed';
      } finally {
        this.uploading = false;
      }
    },
    async loadProfiles() {
      if (!this.metadataApiBase) return;
      try {
        const r = await fetch(`${this.metadataApiBase}/api/v1/analysis/profiles`);
        if (r.ok) {
          const d = await r.json();
          this.profiles = Array.isArray(d.profiles) ? d.profiles : [];
        }
      } catch (_e) { /* non-fatal — 'full' default remains available */ }
    },
    async loadResults() {
      if (!this.metadataApiBase) {
        this.resultsError = 'Missing MatterOverwatch API base.';
        return;
      }
      this.resultsLoading = true;
      this.resultsError = null;
      try {
        const params = new URLSearchParams({
          network: this.selectedNetwork,
          origin: 'upload',
          scope: 'latest',
          limit: '200',
          offset: '0',
          sort_by: 'analyzed_at',
          sort_dir: 'desc'
        });
        const res = await fetch(`${this.metadataApiBase}/api/v1/results?${params.toString()}`);
        if (!res.ok) throw new Error(`Results request failed (${res.status})`);
        const d = await res.json();
        this.results = (d.items || []).map((it, i) => ({
          ...it,
          row_key: `${it.result_id || it.job_id || 'r'}-${it.firmware_sha256 || i}`
        }));
      } catch (err) {
        this.resultsError = err instanceof Error ? err.message : 'Failed to load results';
      } finally {
        this.resultsLoading = false;
      }
    },
    startPolling() {
      this.stopPolling();
      // Light auto-refresh while uploads are still being analyzed.
      this.pollHandle = setInterval(() => {
        if (this.activeTab === 1 && this.hasInProgress && !this.resultsLoading) {
          this.loadResults();
        }
      }, 4000);
    },
    stopPolling() {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
      }
    },
    openJobProgress(jobId) {
      const id = String(jobId || '').trim();
      if (!id) return;
      this.progressJobId = id;
      this.progressDialogVisible = true;
    },
    onProgressVisibleChange(visible) {
      this.progressDialogVisible = visible;
      // Refresh results when the progress modal closes (job likely advanced).
      if (!visible) this.loadResults();
    },
    viewResults(sha) {
      const id = String(sha || '').trim();
      if (id) this.$router.push(`/firmware-security/firmware/${id}`);
    },
    displayName(row) {
      return row.input_firmware_name || row.source_rel_path || this.shortSha(row.firmware_sha256);
    },
    statusSeverity(status) {
      const k = String(status || '').toLowerCase();
      if (k === 'success' || k === 'done') return 'success';
      if (k === 'failed') return 'danger';
      if (k === 'running') return 'info';
      if (k === 'pending') return 'warning';
      if (k === 'partial') return 'warning';
      return 'secondary';
    },
    shortSha(value) {
      const text = String(value || '').trim();
      if (!text) return '—';
      if (text.length <= 16) return text;
      return `${text.slice(0, 8)}...${text.slice(-8)}`;
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '—';
      return value;
    },
    formatSize(bytes) {
      const n = Number(bytes || 0);
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    },
    formatTimestamp(value) {
      if (!value) return '—';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    }
  },
  watch: {
    activeTab(next) {
      if (next === 1) this.loadResults();
    },
    selectedNetwork() {
      this.loadResults();
    }
  },
  mounted() {
    this.loadProfiles();
    this.loadResults();
    this.startPolling();
  },
  beforeUnmount() {
    this.stopPolling();
  }
};
</script>

<style scoped>
.upload-firmware-page .dropzone {
  border: 2px dashed var(--surface-border);
  background: var(--surface-ground);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  padding: 0 1rem;
}
.upload-firmware-page .dropzone:hover { border-color: var(--primary-color); }
.upload-firmware-page .dropzone-active { border-color: var(--primary-color); background: var(--highlight-bg); }
.upload-firmware-page .dropzone-filled { border-style: solid; cursor: default; }
.upload-firmware-page .opt-label {
  display: block; font-size: 0.7rem; font-weight: 700; color: var(--text-color-secondary);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem;
}
.upload-firmware-page .hidden { display: none; }
</style>
