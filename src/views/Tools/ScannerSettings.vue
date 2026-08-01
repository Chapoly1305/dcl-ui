<template>
  <div class="p-3 scanner-settings-page">
    <div class="grid">
      <div class="col-12 lg:col-8 lg:col-offset-2">
        <Card class="settings-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>LLM Provider</span>
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
                  Configure the OpenAI-compatible LLM endpoint used by the authenticity analysis
                  section. The API key is never stored — it is read from the environment variable
                  named below at runtime.
                </div>
              </div>
            </div>

            <!-- LLM Provider -->
            <div class="section-title mb-3">LLM Provider</div>
            <div class="formgrid grid mb-3">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="llm-harness">Harness</label>
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
                <small class="text-500">e.g. deepseek-v4-flash, openai/gpt-4.1-mini, anthropic/claude-sonnet-4-20250514</small>
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12">
                <label class="form-label" for="llm-api-base">API Base URL</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-link"></i></span>
                  <InputText id="llm-api-base" v-model="form.llm_api_base" class="w-full" placeholder="https://api.deepseek.com" />
                </div>
                <small class="text-500">OpenAI-compatible Chat Completions endpoint. OpenRouter: https://openrouter.ai/api/v1</small>
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="llm-api-key">LLM API Key</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-key"></i></span>
                  <Password
                    id="llm-api-key"
                    v-model="sessionToken"
                    class="w-full"
                    placeholder="sk-... — write-only, never shown again"
                    :feedback="false"
                    toggleMask
                  />
                </div>
                <small class="text-500">Used for test-llm. Never persisted and never returned by the API.</small>
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="env-var">Environment Variable</label>
                <InputText id="env-var" v-model="form.llm_secret_env_var" class="w-full" placeholder="MO_AGENT_LLM_API_KEY" />
                <small class="text-500">The worker reads the API key from this env var at runtime.</small>
              </div>
            </div>

            <div class="formgrid grid mb-3">
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

            <!-- Actions -->
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
      form: {
        llm_harness: 'pydantic_ai',
        llm_api_base: '',
        llm_model: '',
        llm_secret_env_var: 'MO_AGENT_LLM_API_KEY',
        default_backend: 'bn',
        llm_timeout_sec: 600,
        audit_timeout_sec: 1800,
        max_llm_calls: 32,
        max_decompile: 64,
        // Static fields required by PUT model but not displayed:
        analysis_profile: 'authenticity',
        phase_ii_section_filter: null,
        phase_ii_code_only: false,
        phase_ii_max_workers: null,
        worker_parallel: null,
        chipset_override_mode: 'auto',
        chipset_override_value: null,
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
      this.form.llm_harness = s.llm_harness || 'pydantic_ai';
      this.form.llm_api_base = s.llm_api_base || '';
      this.form.llm_model = s.llm_model || '';
      this.form.llm_secret_env_var = s.llm_secret_env_var || 'MO_AGENT_LLM_API_KEY';
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
      lines.push(`MO_AGENT_LLM_API_KEY=$${this.form.llm_secret_env_var}`);
      if (this.form.default_backend) lines.push(`MO_AGENT_DEFAULT_BACKEND=${this.form.default_backend}`);
      if (this.form.llm_timeout_sec) lines.push(`MO_AGENT_LLM_TIMEOUT_SEC=${this.form.llm_timeout_sec}`);
      if (this.form.audit_timeout_sec) lines.push(`MO_AGENT_AUDIT_TIMEOUT_SEC=${this.form.audit_timeout_sec}`);
      if (this.form.max_llm_calls) lines.push(`MO_AGENT_MAX_LLM_CALLS=${this.form.max_llm_calls}`);
      if (this.form.max_decompile) lines.push(`MO_AGENT_MAX_DECOMPILE=${this.form.max_decompile}`);
      return lines.join('\n') + '\n';
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
        const body = {
          analysis_profile: this.form.analysis_profile,
          phase_ii_section_filter: this.form.phase_ii_section_filter,
          phase_ii_code_only: this.form.phase_ii_code_only,
          phase_ii_max_workers: this.form.phase_ii_max_workers,
          worker_parallel: this.form.worker_parallel,
          chipset_override_mode: this.form.chipset_override_mode,
          chipset_override_value: this.form.chipset_override_value,
          llm_harness: this.form.llm_harness,
          llm_api_base: this.form.llm_api_base || null,
          llm_model: this.form.llm_model || null,
          llm_secret_mode: 'env',
          llm_secret_env_var: this.form.llm_secret_env_var,
          default_backend: this.form.default_backend,
          llm_timeout_sec: this.form.llm_timeout_sec,
          audit_timeout_sec: this.form.audit_timeout_sec,
          max_llm_calls: this.form.max_llm_calls,
          max_decompile: this.form.max_decompile,
        };
        const response = await fetch(this.settingsEndpoint(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Failed to save (${response.status}): ${detail}`);
        }
        const payload = await response.json();
        this.applyPayload({
          ...(payload.settings || {}),
          network: payload.network,
          active_network: payload.active_network,
          env_preview: payload.env_preview
        });
        this.statusNote = `Saved for ${this.networkLabel(this.scopeNetwork)}.`;
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
  },
  computed: {
    selectedNetwork() {
      return this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || '';
    },
    scopeNetworkLabel() {
      return this.networkLabel(this.scopeNetwork);
    },
    harnessOptions() {
      return [
        { label: 'Pydantic AI (OpenAI-compatible)', value: 'pydantic_ai' },
        { label: 'Claude Agent SDK', value: 'claude_agent' },
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
