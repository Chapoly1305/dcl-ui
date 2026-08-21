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
                  Configure the Claude Agent SDK connection used by the authenticity analysis
                  section. MatterOverwatch handles the SDK environment internally.
                </div>
              </div>
            </div>

            <!-- LLM Provider -->
            <div class="section-title mb-3">LLM Provider</div>
            <div class="formgrid grid mb-3">
              <div class="field col-12">
                <label class="form-label" for="llm-model">Model</label>
                <InputText id="llm-model" v-model="form.llm_model" class="w-full" placeholder="claude-sonnet-4-20250514" />
                <small class="text-500">The model identifier accepted by your Claude-compatible endpoint.</small>
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12">
                <label class="form-label" for="llm-api-base">API Base URL</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-link"></i></span>
                  <InputText id="llm-api-base" v-model="form.llm_api_base" class="w-full" placeholder="https://api.deepseek.com" />
                </div>
                <small class="text-500">Anthropic or Claude-compatible API base URL.</small>
              </div>
            </div>

            <div class="formgrid grid mb-3">
              <div class="field col-12">
                <label class="form-label" for="llm-api-key">Access Token</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-key"></i></span>
                  <Password
                    id="llm-api-key"
                    v-model="sessionToken"
                    class="w-full"
                    :placeholder="accessTokenConfigured ? 'Saved — enter a new token to replace it' : 'Enter access token'"
                    :feedback="false"
                    toggleMask
                  />
                </div>
                <small class="text-500">Write-only. Used by connection tests and analysis workers, and never returned by the API.</small>
              </div>
            </div>

            <div class="formgrid grid mb-2">
              <div class="field col-12 md:col-4">
                <label class="form-label" for="llm-timeout">Claude Run Timeout (sec)</label>
                <InputNumber id="llm-timeout" v-model="form.llm_timeout_sec" :min="5" :max="3600" :useGrouping="false" class="w-full" />
                <small class="text-500">Maximum wall-clock time for one Claude agent run.</small>
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
      accessTokenConfigured: false,
      form: {
        llm_harness: 'claude_agent',
        llm_api_base: '',
        llm_model: '',
        llm_timeout_sec: 600,
        // Nothing else belongs here. This page previously carried a block of
        // fields it does not display -- analysis_profile, analysis_code_only,
        // chipset_override_mode and friends -- and re-sent them on every save,
        // so saving an LLM model silently rewrote the saved analysis profile to
        // 'authenticity' and code_only to false. The PUT body is now built from
        // the fields this page actually owns; the API preserves anything it is
        // not sent.
      },
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
      this.form.llm_harness = 'claude_agent';
      this.form.llm_api_base = s.llm_api_base || '';
      this.form.llm_model = s.llm_model || '';
      this.form.llm_timeout_sec = s.llm_timeout_sec != null ? Number(s.llm_timeout_sec) : 600;
      this.activeNetwork = String(payload.active_network || '');
      this.scopeNetwork = this.normalizeNetwork(payload.network) || this.resolveScopeNetwork();
      this.accessTokenConfigured = Boolean(payload.access_token_configured);
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
        // Only what this page displays and owns. Omitted fields are left alone
        // by the API, which distinguishes "not sent" from "sent as the default"
        // via pydantic's model_fields_set.
        const body = {
          llm_harness: this.form.llm_harness,
          llm_api_base: this.form.llm_api_base || null,
          llm_model: this.form.llm_model || null,
          llm_api_key: this.sessionToken || null,
          llm_timeout_sec: this.form.llm_timeout_sec,
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
          access_token_configured: payload.access_token_configured
        });
        this.sessionToken = '';
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
  },
  watch: {
    selectedNetwork(next, prev) {
      const a = this.normalizeNetwork(next);
      const b = this.normalizeNetwork(prev);
      if (!a || a === b) return;
      this.scopeNetwork = a;
      this.loadSettings();
    },
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
