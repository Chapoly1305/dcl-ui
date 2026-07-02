<template>
  <div class="p-3 upload-firmware-page">
    <div class="grid">
      <div class="col-12 lg:col-8 lg:col-offset-2">
        <Card class="upload-card">
          <template #title>
            <div class="flex align-items-center gap-2 flex-wrap">
              <i class="pi pi-upload text-primary"></i>
              <span>Custom Firmware Upload</span>
            </div>
          </template>
          <template #content>
            <Message severity="info" :closable="false" class="mb-4">
              Upload an arbitrary firmware image to run through the full analysis pipeline.
              No VID/PID/version or DCL record is required — this path is for firmware that is
              <b>not on the DCL</b>, including vendor pre-release builds, retail dumps, and
              non-Matter images such as <b>Zigbee</b> GBL. Conformance checks that need declared
              DCL metadata are automatically skipped.
            </Message>

            <!-- Drop zone -->
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
                <span class="text-sm">Any format — .ota, .gbl, .bin, .img, … (max {{ maxSizeLabel }})</span>
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

            <!-- Options -->
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
          </template>
        </Card>

        <!-- Recent uploads (persisted in this browser) -->
        <Card v-if="recent.length" class="mt-3">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2">
              <span class="text-lg">Your Uploads</span>
              <Button label="Clear list" icon="pi pi-trash" class="p-button-text p-button-sm p-button-secondary"
                @click="clearRecent" />
            </div>
          </template>
          <template #content>
            <DataTable :value="recent" class="p-datatable-sm" responsiveLayout="scroll">
              <Column field="name" header="File">
                <template #body="s">
                  <span class="font-medium">{{ s.data.name }}</span>
                </template>
              </Column>
              <Column field="sha" header="SHA-256">
                <template #body="s"><code class="text-sm">{{ shortSha(s.data.sha) }}</code></template>
              </Column>
              <Column header="Actions" headerClass="text-right" bodyClass="text-right">
                <template #body="s">
                  <Button label="Progress" icon="pi pi-chart-line" class="p-button-text p-button-sm"
                    @click="openJobProgress(s.data.jobId)" />
                  <Button label="Results" icon="pi pi-search" class="p-button-text p-button-sm"
                    @click="viewResults(s.data.sha)" />
                </template>
              </Column>
            </DataTable>
          </template>
        </Card>
      </div>
    </div>

    <FirmwareJobProgressModal :visible="progressDialogVisible" :job-id="progressJobId" :api-base="metadataApiBase"
      @update:visible="progressDialogVisible = $event" />
  </div>
</template>

<script>
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

const MAX_BYTES = 256 * 1024 * 1024;
const RECENT_KEY = 'mo.uploadFirmware.recent';
const RECENT_MAX = 50;

export default {
  name: 'UploadFirmware',
  components: { FirmwareJobProgressModal },
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      metadataApiBase: requestBase,
      dragging: false,
      selectedFile: null,
      analysisProfile: 'full',
      codeOnly: false,
      profiles: [],
      uploading: false,
      error: null,
      recent: [],
      progressDialogVisible: false,
      progressJobId: ''
    };
  },
  computed: {
    maxSizeLabel() {
      return this.formatSize(MAX_BYTES);
    },
    profileOptions() {
      const opts = this.profiles.map((p) => ({ label: p.label, value: p.id }));
      if (!opts.find((o) => o.value === 'full')) opts.unshift({ label: 'Full Analysis', value: 'full' });
      return opts;
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
        const sha = String(d?.firmware_sha256 || '');
        this.recent.unshift({ name: this.selectedFile.name, sha, jobId });
        this.persistRecent();
        this.selectedFile = null;
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
    openJobProgress(jobId) {
      const id = String(jobId || '').trim();
      if (!id) return;
      this.progressJobId = id;
      this.progressDialogVisible = true;
    },
    viewResults(sha) {
      const id = String(sha || '').trim();
      if (id) this.$router.push(`/firmware-security/firmware/${id}`);
    },
    shortSha(value) {
      const text = String(value || '').trim();
      if (text.length <= 16) return text || '-';
      return `${text.slice(0, 8)}...${text.slice(-8)}`;
    },
    formatSize(bytes) {
      const n = Number(bytes || 0);
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    },
    // Uploaded firmware persists in the catalog, but the corpus-oriented Scan
    // Results view mixes it among thousands of DCL entries. Keep a local list
    // of this browser's uploads so they survive a page refresh and give a
    // direct link back to each result.
    loadRecent() {
      try {
        const raw = window.localStorage.getItem(RECENT_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        this.recent = Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
      } catch (_e) { this.recent = []; }
    },
    persistRecent() {
      try {
        this.recent = this.recent.slice(0, RECENT_MAX);
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(this.recent));
      } catch (_e) { /* storage unavailable/full — list stays in-memory only */ }
    },
    clearRecent() {
      this.recent = [];
      try { window.localStorage.removeItem(RECENT_KEY); } catch (_e) { /* ignore */ }
    }
  },
  mounted() {
    this.loadRecent();
    this.loadProfiles();
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
