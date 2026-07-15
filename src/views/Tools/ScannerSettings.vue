<template>
  <div class="p-3 scanner-settings-page">
    <div class="grid">
      <div class="col-12 lg:col-8 lg:col-offset-2">
        <Card class="settings-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Scanner Settings</span>
                <Tag :value="`Editing Network: ${scopeNetworkLabel}`" severity="warning" />
                <Tag :value="`Active Network: ${activeNetwork || 'unknown'}`" severity="info" />
              </div>
              <Button
                icon="pi pi-refresh"
                class="p-button-text p-button-sm p-button-rounded"
                :loading="loading"
                v-tooltip.top="'Reload settings'"
                @click="loadSettings"
              />
            </div>
          </template>
          <template #content>
            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
            <Message v-else-if="statusNote" severity="success" :closable="false">{{ statusNote }}</Message>

            <div class="surface-ground p-3 border-round mb-4">
              <div class="flex align-items-start gap-3">
                <i class="pi pi-info-circle text-blue-500 mt-1" style="font-size: 1.2rem"></i>
                <div class="text-sm line-height-3 text-700">
                  Configure analysis profile, Phase II section selection, LLM provider, and worker parallelism defaults
                  for firmware scanner reruns. Saved settings become the defaults when enqueuing jobs from the UI.
                </div>
              </div>
            </div>

            <!-- Section 1: Runtime Profile -->
            <div class="section-title mb-3">Runtime Profile</div>
            <div class="formgrid grid mb-3">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="analysis-profile">Analysis Profile</label>
                <Dropdown
                  id="analysis-profile"
                  v-model="form.analysis_profile"
                  :options="profileOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                  @change="onProfileChange"
                />
                <small class="text-500">{{ selectedProfileDescription }}</small>
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label">Phase II Code-Only</label>
                <div class="flex align-items-center gap-3 p-2 border-round surface-100" style="width: fit-content; min-width: 180px;">
                  <InputSwitch id="code-only" v-model="form.phase_ii_code_only" />
                  <span :class="form.phase_ii_code_only ? 'text-blue-700 font-bold' : 'text-600 font-medium'" class="text-sm uppercase tracking-wider">
                    {{ form.phase_ii_code_only ? 'Code Only' : 'Full Pipeline' }}
                  </span>
                </div>
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12">
                <label class="form-label">Phase II Section Filter</label>
                <MultiSelect
                  v-model="form.phase_ii_section_filter"
                  :options="sectionOptions"
                  optionLabel="label"
                  optionValue="value"
                  :filter="true"
                  class="w-full"
                  placeholder="Select sections to run (empty = all)"
                  display="chip"
                />
                <small class="text-500">Leave empty to run all sections; or pick specific sections for targeted reruns.</small>
              </div>
            </div>

            <div class="formgrid grid mb-2">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="max-workers">Phase II Max Workers</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-users"></i></span>
                  <InputNumber id="max-workers" v-model="form.phase_ii_max_workers" :min="1" :max="32" :useGrouping="false" class="w-full" />
                </div>
                <small class="text-500">Max concurrent section workers within a single firmware analysis job.</small>
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="worker-parallel">Worker Parallel</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-cog"></i></span>
                  <InputNumber id="worker-parallel" v-model="form.worker_parallel" :min="1" :max="64" :useGrouping="false" class="w-full" />
                </div>
                <small class="text-500">Max concurrent firmware images to analyze in parallel.</small>
              </div>
            </div>

            <Divider />

            <!-- Section 2: Platform Selection -->
            <div class="section-title mb-3">Platform Selection</div>
            <div class="formgrid grid mb-3">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="chipset-mode">Chipset Override Mode</label>
                <Dropdown
                  id="chipset-mode"
                  v-model="form.chipset_override_mode"
                  :options="chipsetModeOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                />
              </div>
              <div class="field col-12 md:col-6" v-if="form.chipset_override_mode === 'force_family'">
                <label class="form-label" for="chipset-value">Chipset Family</label>
                <Dropdown
                  id="chipset-value"
                  v-model="form.chipset_override_value"
                  :options="chipsetFamilyOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                  :filter="true"
                  placeholder="Select chipset family"
                />
              </div>
            </div>
            <Message v-if="form.chipset_override_mode === 'force_family'" severity="warn" :closable="false" class="mb-3">
              <strong>Warning:</strong> Force-overriding the chipset family bypasses auto-detection for ALL firmware in the run.
              Use only when you are confident about the target platform and auto-detection is failing.
            </Message>
            <Message v-if="form.chipset_override_mode === 'manual_review_only'" severity="info" :closable="false" class="mb-3">
              Manual review mode: chipset identification will be flagged for human review instead of being auto-applied.
            </Message>

            <Divider />

            <!-- Section 3: LLM Provider -->
            <div class="section-title mb-3">LLM Provider</div>
            <div class="formgrid grid mb-3">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="llm-harness">LLM Harness</label>
                <Dropdown
                  id="llm-harness"
                  v-model="form.llm_harness"
                  :options="harnessOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                />
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="llm-model">Model</label>
                <InputText id="llm-model" v-model="form.llm_model" class="w-full" placeholder="openai/gpt-4.1-mini" />
                <small class="text-500">e.g. openai/gpt-4.1-mini, deepseek-v4-flash, anthropic/claude-sonnet-4-20250514</small>
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12">
                <label class="form-label" for="llm-api-base">API Base URL</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-link"></i></span>
                  <InputText id="llm-api-base" v-model="form.llm_api_base" class="w-full" placeholder="https://openrouter.ai/api/v1" />
                </div>
                <small class="text-500">OpenAI-compatible Chat Completions endpoint. For OpenRouter: https://openrouter.ai/api/v1</small>
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="secret-mode">Secret Mode</label>
                <Dropdown
                  id="secret-mode"
                  v-model="form.llm_secret_mode"
                  :options="secretModeOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                />
                <small class="text-500" v-if="form.llm_secret_mode === 'env'">
                  The API key is read from the environment variable. Never stored in the database.
                </small>
                <small class="text-500" v-else-if="form.llm_secret_mode === 'session'">
                  Token is accepted for test-llm only and never persisted.
                </small>
              </div>
              <div class="field col-12 md:col-6" v-if="form.llm_secret_mode === 'env'">
                <label class="form-label" for="env-var">Environment Variable Name</label>
                <InputText id="env-var" v-model="form.llm_secret_env_var" class="w-full" placeholder="MO_AGENT_LLM_API_KEY" />
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="session-token">Session Token (test only)</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-key"></i></span>
                  <Password
                    id="session-token"
                    v-model="sessionToken"
                    class="w-full"
                    placeholder="Paste key for test, never saved"
                    :feedback="false"
                    toggleMask
                  />
                </div>
                <small class="text-500">Paste an API key to test connectivity. Never persisted to database.</small>
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="default-backend">Default Backend</label>
                <Dropdown
                  id="default-backend"
                  v-model="form.default_backend"
                  :options="backendOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                />
              </div>
            </div>

            <div class="formgrid grid mb-2">
              <div class="field col-6 md:col-3">
                <label class="form-label" for="llm-timeout">LLM Timeout (sec)</label>
                <InputNumber id="llm-timeout" v-model="form.llm_timeout_sec" :min="5" :max="3600" :useGrouping="false" class="w-full" />
              </div>
              <div class="field col-6 md:col-3">
                <label class="form-label" for="audit-timeout">Audit Timeout (sec)</label>
                <InputNumber id="audit-timeout" v-model="form.audit_timeout_sec" :min="60" :max="7200" :useGrouping="false" class="w-full" />
              </div>
              <div class="field col-6 md:col-3">
                <label class="form-label" for="max-llm-calls">Max LLM Calls</label>
                <InputNumber id="max-llm-calls" v-model="form.max_llm_calls" :min="1" :max="500" :useGrouping="false" class="w-full" />
              </div>
              <div class="field col-6 md:col-3">
                <label class="form-label" for="max-decompile">Max Decompile</label>
                <InputNumber id="max-decompile" v-model="form.max_decompile" :min="1" :max="2000" :useGrouping="false" class="w-full" />
              </div>
            </div>

            <Divider />

            <!-- Section 4: Effective Config Preview -->
            <div class="section-title mb-3">Effective Config Preview</div>
            <Card class="surface-ground border-1 border-round mb-3">
              <template #content>
                <pre class="env-preview m-0 text-sm" style="max-height: 250px; overflow-y: auto;"><code>{{ envPreview }}</code></pre>
              </template>
            </Card>

            <!-- LLM test result -->
            <Message v-if="llmTestResult" :severity="llmTestResult.status === 'ok' ? 'success' : 'error'" :closable="true" @close="llmTestResult = null" class="mb-3">
              <template v-if="llmTestResult.status === 'ok'">
                <div><strong>Connected!</strong> Latency: {{ llmTestResult.latency_ms }}ms. Model: {{ llmTestResult.response_model }}.</div>
                <div class="text-sm mt-1">Response: {{ llmTestResult.message }}</div>
              </template>
              <template v-else>
                <div><strong>Test failed:</strong> {{ llmTestResult.detail }}</div>
              </template>
            </Message>

            <!-- Section 5: Actions -->
            <div class="flex align-items-center justify-content-end gap-2 mt-3">
              <Button
                label="Test LLM"
                icon="pi pi-send"
                class="p-button-outlined p-button-sm"
                :loading="testingLlm"
                @click="testLlm"
              />
              <Button label="Reset to Saved" icon="pi pi-undo" class="p-button-text p-button-sm" :disabled="saving || testingLlm" @click="loadSettings" />
              <Button label="Save Settings" icon="pi pi-save" class="p-button-sm px-4" :loading="saving" @click="saveSettings" />
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script>
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'ScannerSettings',
  data() {
    const { requestBase, displayBase } = resolveMatteroverwatchApiBase();
    return {
      apiBase: requestBase,
      apiDisplayBase: displayBase,
      loading: false,
      saving: false,
      testingLlm: false,
      error: null,
      statusNote: null,
      llmTestResult: null,
      activeNetwork: '',
      scopeNetwork: '',
      sessionToken: '',
      // Metadata loaded from profiles endpoint
      availableProfiles: [],
      availableSections: [],
      availableChipsetFamilies: [],
      form: {
        analysis_profile: 'authenticity',
        phase_ii_section_filter: null,
        phase_ii_code_only: false,
        phase_ii_max_workers: null,
        worker_parallel: null,
        chipset_override_mode: 'auto',
        chipset_override_value: null,
        llm_harness: 'pydantic_ai',
        llm_api_base: '',
        llm_model: '',
        llm_secret_mode: 'env',
        llm_secret_env_var: 'MO_AGENT_LLM_API_KEY',
        llm_api_key_masked: null,
        default_backend: 'bn',
        llm_timeout_sec: 600,
        audit_timeout_sec: 1800,
        max_llm_calls: 32,
        max_decompile: 64,
      },
      envPreview: '',
    };
  },
  methods: {
    normalizeNetwork(value) {
      const key = String(value || '').trim().toLowerCase();
      return key === 'mainnet' || key === 'testnet' ? key : '';
    },
    resolveScopeNetwork() {
      const selected = this.normalizeNetwork(this.selectedNetwork);
      if (selected) return selected;
      const scoped = this.normalizeNetwork(this.scopeNetwork);
      if (scoped) return scoped;
      const active = this.normalizeNetwork(this.activeNetwork);
      return active || 'testnet';
    },
    networkLabel(value) {
      return this.normalizeNetwork(value) === 'mainnet' ? 'Mainnet' : 'Testnet';
    },
    settingsEndpoint() {
      const network = this.resolveScopeNetwork();
      const query = new URLSearchParams({ network });
      return `${this.apiBase}/api/v1/settings/scanner?${query.toString()}`;
    },
    applyPayload(payload) {
      const s = payload.settings || payload;
      this.form.analysis_profile = s.analysis_profile || 'authenticity';
      this.form.phase_ii_section_filter = s.phase_ii_section_filter || null;
      this.form.phase_ii_code_only = Boolean(s.phase_ii_code_only);
      this.form.phase_ii_max_workers = s.phase_ii_max_workers != null ? Number(s.phase_ii_max_workers) : null;
      this.form.worker_parallel = s.worker_parallel != null ? Number(s.worker_parallel) : null;
      this.form.chipset_override_mode = s.chipset_override_mode || 'auto';
      this.form.chipset_override_value = s.chipset_override_value || null;
      this.form.llm_harness = s.llm_harness || 'pydantic_ai';
      this.form.llm_api_base = s.llm_api_base || '';
      this.form.llm_model = s.llm_model || '';
      this.form.llm_secret_mode = s.llm_secret_mode || 'env';
      this.form.llm_secret_env_var = s.llm_secret_env_var || 'MO_AGENT_LLM_API_KEY';
      this.form.llm_api_key_masked = s.llm_api_key_masked || null;
      this.form.default_backend = s.default_backend || 'bn';
      this.form.llm_timeout_sec = s.llm_timeout_sec != null ? Number(s.llm_timeout_sec) : 600;
      this.form.audit_timeout_sec = s.audit_timeout_sec != null ? Number(s.audit_timeout_sec) : 1800;
      this.form.max_llm_calls = s.max_llm_calls != null ? Number(s.max_llm_calls) : 32;
      this.form.max_decompile = s.max_decompile != null ? Number(s.max_decompile) : 64;
      this.activeNetwork = String(payload.active_network || '');
      this.scopeNetwork = this.normalizeNetwork(payload.network) || this.resolveScopeNetwork();
      this.envPreview = payload.env_preview || this.buildEnvPreview();
    },
    buildEnvPreview() {
      const lines = [`MO_AGENT_LLM_HARNESS=${this.form.llm_harness}`];
      if (this.form.llm_api_base) lines.push(`MO_AGENT_LLM_API_BASE=${this.form.llm_api_base}`);
      if (this.form.llm_model) lines.push(`MO_AGENT_LLM_MODEL=${this.form.llm_model}`);
      if (this.form.llm_secret_mode === 'env') {
        lines.push(`MO_AGENT_LLM_API_KEY=$${this.form.llm_secret_env_var}`);
      } else if (this.form.llm_api_key_masked) {
        lines.push(`MO_AGENT_LLM_API_KEY=${this.form.llm_api_key_masked}`);
      }
      if (this.form.default_backend) lines.push(`MO_AGENT_DEFAULT_BACKEND=${this.form.default_backend}`);
      if (this.form.llm_timeout_sec) lines.push(`MO_AGENT_LLM_TIMEOUT_SEC=${this.form.llm_timeout_sec}`);
      if (this.form.audit_timeout_sec) lines.push(`MO_AGENT_AUDIT_TIMEOUT_SEC=${this.form.audit_timeout_sec}`);
      if (this.form.max_llm_calls) lines.push(`MO_AGENT_MAX_LLM_CALLS=${this.form.max_llm_calls}`);
      if (this.form.max_decompile) lines.push(`MO_AGENT_MAX_DECOMPILE=${this.form.max_decompile}`);
      return lines.join('\n') + '\n';
    },
    async loadMetadata() {
      try {
        const resp = await fetch(`${this.apiBase}/api/v1/analysis/profiles`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (resp.ok) {
          const data = await resp.json();
          this.availableProfiles = (data.profiles || []).map(p => ({
            label: `${p.label} (${p.id})`,
            value: p.id,
            description: p.description || '',
            section_filter: p.section_filter
          }));
          this.availableSections = (data.sections || []).map(s => ({
            label: s.name || s.id,
            value: s.id,
            description: s.description || ''
          }));
          this.availableChipsetFamilies = (data.chipset_families || []).map(f => ({
            label: f,
            value: f
          }));
        }
      } catch (err) {
        console.error('Failed to load analysis metadata:', err);
      }
    },
    async loadSettings() {
      this.loading = true;
      this.error = null;
      this.statusNote = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.loading = false;
        return;
      }
      try {
        await this.loadMetadata();
        const response = await fetch(`${this.settingsEndpoint()}&_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) {
          throw new Error(`Failed to load scanner settings (HTTP ${response.status})`);
        }
        const payload = await response.json();
        this.applyPayload(payload);
      } catch (err) {
        console.error('Scanner settings fetch error:', err);
        this.error = `Failed to connect to API at ${this.apiDisplayBase || this.apiBase}. Ensure the MatterOverwatch service is running.`;
      } finally {
        this.loading = false;
      }
    },
    async saveSettings() {
      this.saving = true;
      this.error = null;
      this.statusNote = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base.';
        this.saving = false;
        return;
      }
      try {
        const body = { ...this.form };
        // Convert empty string to null for optional fields
        if (body.chipset_override_value === '') body.chipset_override_value = null;
        if (body.llm_api_base === '') body.llm_api_base = null;
        if (body.llm_model === '') body.llm_model = null;

        const response = await fetch(this.settingsEndpoint(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Failed to save scanner settings (${response.status}): ${detail}`);
        }
        const payload = await response.json();
        this.applyPayload({
          ...(payload.settings || {}),
          network: payload.network,
          active_network: payload.active_network,
          env_preview: payload.env_preview
        });
        this.statusNote = `Scanner settings saved for ${this.networkLabel(this.scopeNetwork)}.`;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to save';
      } finally {
        this.saving = false;
      }
    },
    async testLlm() {
      this.testingLlm = true;
      this.llmTestResult = null;
      this.error = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base.';
        this.testingLlm = false;
        return;
      }
      try {
        const body = {
          llm_harness: this.form.llm_harness,
          llm_api_base: this.form.llm_api_base || null,
          llm_model: this.form.llm_model || null,
          llm_timeout_sec: this.form.llm_timeout_sec,
          llm_api_key: this.sessionToken || null,
        };
        const network = this.resolveScopeNetwork();
        const query = new URLSearchParams({ network });
        const response = await fetch(`${this.apiBase}/api/v1/settings/scanner/test-llm?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const payload = await response.json();
        if (response.ok) {
          this.llmTestResult = payload;
        } else {
          this.llmTestResult = { status: 'error', detail: payload.detail || `HTTP ${response.status}` };
        }
      } catch (err) {
        this.llmTestResult = { status: 'error', detail: err instanceof Error ? err.message : 'Network error' };
      } finally {
        this.testingLlm = false;
      }
    },
    onProfileChange() {
      // When user changes profile, optionally pre-fill the section filter
      const profile = this.availableProfiles.find(p => p.value === this.form.analysis_profile);
      if (profile && profile.section_filter) {
        this.form.phase_ii_section_filter = [...profile.section_filter];
      }
    },
  },
  computed: {
    selectedNetwork() {
      return this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || '';
    },
    scopeNetworkLabel() {
      return this.networkLabel(this.scopeNetwork);
    },
    selectedProfileDescription() {
      const profile = this.availableProfiles.find(p => p.value === this.form.analysis_profile);
      return profile?.description || '';
    },
    profileOptions() {
      if (this.availableProfiles.length > 0) return this.availableProfiles;
      return [
        { label: 'Full', value: 'full', description: 'Complete Phase I + Phase II pipeline' },
        { label: 'Authenticity-only', value: 'authenticity', description: 'Secure-boot, OTA authenticity, weak keys, custom auth' },
        { label: 'Chipset-only', value: 'chipset', description: 'Deterministic + AI-assisted chipset identification' },
        { label: 'Secrets', value: 'secrets', description: 'Embedded secrets scan' },
      ];
    },
    sectionOptions() {
      return this.availableSections.length > 0
        ? this.availableSections
        : [];
    },
    chipsetFamilyOptions() {
      return this.availableChipsetFamilies.length > 0
        ? this.availableChipsetFamilies
        : [];
    },
    chipsetModeOptions() {
      return [
        { label: 'Auto (default)', value: 'auto' },
        { label: 'Force Family', value: 'force_family' },
        { label: 'Manual Review Only', value: 'manual_review_only' },
      ];
    },
    harnessOptions() {
      return [
        { label: 'Pydantic AI (OpenAI-compatible)', value: 'pydantic_ai' },
        { label: 'Claude Agent SDK', value: 'claude_agent' },
      ];
    },
    secretModeOptions() {
      return [
        { label: 'Environment Variable', value: 'env' },
        { label: 'Session Only (test-llm)', value: 'session' },
      ];
    },
    backendOptions() {
      return [
        { label: 'Binary Ninja (bn)', value: 'bn' },
        { label: 'IDA Pro (ida)', value: 'ida' },
      ];
    },
  },
  watch: {
    selectedNetwork(next, prev) {
      const a = this.normalizeNetwork(next);
      const b = this.normalizeNetwork(prev);
      if (!a || a === b) return;
      this.scopeNetwork = a;
      this.loadSettings();
    },
    'form.llm_harness': function () { this.envPreview = this.buildEnvPreview(); },
    'form.llm_api_base': function () { this.envPreview = this.buildEnvPreview(); },
    'form.llm_model': function () { this.envPreview = this.buildEnvPreview(); },
    'form.llm_secret_mode': function () { this.envPreview = this.buildEnvPreview(); },
    'form.llm_secret_env_var': function () { this.envPreview = this.buildEnvPreview(); },
    'form.default_backend': function () { this.envPreview = this.buildEnvPreview(); },
    'form.llm_timeout_sec': function () { this.envPreview = this.buildEnvPreview(); },
    'form.audit_timeout_sec': function () { this.envPreview = this.buildEnvPreview(); },
    'form.max_llm_calls': function () { this.envPreview = this.buildEnvPreview(); },
    'form.max_decompile': function () { this.envPreview = this.buildEnvPreview(); },
  },
  mounted() {
    this.loadSettings();
  }
};
</script>

<style scoped>
.settings-card {
  border-radius: 12px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.form-label {
  display: block;
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 0.45rem;
  color: #374151;
}

.env-preview {
  font-family: 'Courier New', monospace;
  background: #f5f5f5;
  padding: 0.75rem;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
