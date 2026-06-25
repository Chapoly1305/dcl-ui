<template>
  <div class="p-3 webhook-settings-page">
    <div class="grid">
      <div class="col-12 lg:col-8 lg:col-offset-2">
        <Card class="settings-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Webhook Notification Settings</span>
                <Tag :value="`Editing Network: ${scopeNetworkLabel}`" severity="warning" />
                <Tag :value="`Active Network: ${activeNetwork || 'unknown'}`" severity="info" />
                <Tag :value="`API: ${apiDisplayBase || apiBase || 'unset'}`" severity="contrast" />
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
                  Configure where MatterOverwatch sends notifications for new firmware discoveries and analysis updates.
                  Settings are stored separately for each network, so Testnet and Mainnet can post to different Discord channels.
                  Changes are applied immediately to the background worker.
                </div>
              </div>
            </div>

            <div class="section-title mb-3">General Configuration</div>
            <div class="formgrid grid mb-4">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="webhook-enabled">Notifications Master Control</label>
                <div class="flex align-items-center gap-3 p-2 border-round surface-100" style="width: fit-content; min-width: 240px;">
                  <InputSwitch id="webhook-enabled" v-model="form.enabled" />
                  <span :class="form.enabled ? 'text-green-700 font-bold' : 'text-600 font-medium'" class="text-sm uppercase tracking-wider">
                    {{ form.enabled ? 'Notifications Active' : 'Notifications Paused' }}
                  </span>
                </div>
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="webhook-timeout">HTTP Timeout (seconds)</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-clock"></i></span>
                  <InputNumber id="webhook-timeout" v-model="form.timeout_sec" :min="2" :max="120" :useGrouping="false" class="w-full" />
                </div>
                <small class="text-500">Wait time before giving up on a slow webhook server.</small>
              </div>
            </div>

            <Divider />

            <div class="section-title mb-3">Default Destination</div>
            <div class="formgrid grid mb-4">
              <div class="field col-12">
                <label class="form-label" for="default-url">Default Webhook URL</label>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"><i class="pi pi-link"></i></span>
                  <InputText id="default-url" v-model="form.default_url" class="w-full" placeholder="https://discord.com/api/webhooks/..." />
                </div>
                <small class="text-500">Fallback URL used for all events if no specific override is defined below.</small>
              </div>
            </div>

            <div class="section-title mb-3">Event-Specific Overrides (Optional)</div>
            <div class="grid">
              <div class="col-12 md:col-6 mb-3">
                <div class="p-3 border-1 surface-border border-round">
                  <label class="form-label mb-2" for="new-fw-url">General Firmware Release</label>
                  <InputText id="new-fw-url" v-model="form.new_firmware_released_url" class="w-full p-inputtext-sm mb-2" placeholder="Using default URL if empty" />
                  <div class="text-xs text-500">Triggered when any new firmware entry is seen on DCL.</div>
                </div>
              </div>
              <div class="col-12 md:col-6 mb-3">
                <div class="p-3 border-1 surface-border border-round">
                  <label class="form-label mb-2" for="new-net-fw-url">DCL Test/Prod Firmware</label>
                  <InputText id="new-net-fw-url" v-model="form.new_network_firmware_released_url" class="w-full p-inputtext-sm mb-2" placeholder="Using default URL if empty" />
                  <div class="text-xs text-500">Filtered for specifically Testnet or Mainnet networks.</div>
                </div>
              </div>
              <div class="col-12 md:col-6 mb-3">
                <div class="p-3 border-1 surface-border border-round">
                  <label class="form-label mb-2" for="new-dev-url">New Device Discovery</label>
                  <InputText id="new-dev-url" v-model="form.new_device_firmware_released_url" class="w-full p-inputtext-sm mb-2" placeholder="Using default URL if empty" />
                  <div class="text-xs text-500">Triggered when a previously unseen VID:PID is discovered.</div>
                </div>
              </div>
              <div class="col-12 md:col-6 mb-3">
                <div class="p-3 border-1 surface-border border-round">
                  <label class="form-label mb-2" for="new-net-dev-url">DCL Test/Prod New Device</label>
                  <InputText id="new-net-dev-url" v-model="form.new_network_device_firmware_released_url" class="w-full p-inputtext-sm mb-2" placeholder="Using default URL if empty" />
                  <div class="text-xs text-500">New VID:PID discovery filtered for specific networks.</div>
                </div>
              </div>
            </div>

            <div class="flex align-items-center justify-content-between gap-2 mt-4 flex-wrap">
              <Button
                label="Send Test Events"
                icon="pi pi-send"
                class="p-button-outlined p-button-sm"
                :loading="testing"
                v-tooltip.top="'Post a sample event to each configured webhook URL'"
                @click="sendTestEvents"
              />
              <div class="flex align-items-center gap-2">
                <Button label="Reset to Current" icon="pi pi-undo" class="p-button-text p-button-sm" :disabled="saving" @click="loadSettings" />
                <Button label="Save Changes" icon="pi pi-save" class="p-button-sm px-4" :loading="saving" @click="saveSettings" />
              </div>
            </div>

            <div v-if="testResults" class="mt-4">
              <Divider />
              <div class="section-title mb-2">Test Event Results</div>
              <div class="text-xs text-500 mb-3">
                Results reflect the <b>currently saved</b> settings. Save changes first if you edited URLs above.
              </div>
              <div class="grid">
                <div v-for="row in testResultRows" :key="row.key" class="col-12 md:col-6 mb-2">
                  <div class="flex align-items-center gap-2 p-2 border-1 surface-border border-round">
                    <Tag :value="row.label" :severity="row.severity" />
                    <span class="text-sm text-700">{{ row.title }}</span>
                    <span v-if="row.detail" class="text-xs text-500 ml-auto">{{ row.detail }}</span>
                  </div>
                </div>
              </div>
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
  name: 'FirmwareWebhookSettings',
  data() {
    const { requestBase, displayBase } = resolveMatteroverwatchApiBase();
    return {
      apiBase: requestBase,
      apiDisplayBase: displayBase,
      loading: false,
      saving: false,
      testing: false,
      error: null,
      statusNote: null,
      testResults: null,
      activeNetwork: '',
      scopeNetwork: '',
      form: {
        enabled: false,
        timeout_sec: 10,
        default_url: '',
        new_firmware_released_url: '',
        new_network_firmware_released_url: '',
        new_device_firmware_released_url: '',
        new_network_device_firmware_released_url: ''
      }
    };
  },
  methods: {
    normalizeNetwork(value) {
      const key = String(value || '').trim().toLowerCase();
      return key === 'mainnet' || key === 'testnet' ? key : '';
    },
    resolveScopeNetwork() {
      // Scope follows the global network selector (top-right MAINNET/TESTNET).
      const selected = this.normalizeNetwork(this.selectedNetwork);
      if (selected) {
        return selected;
      }
      const scoped = this.normalizeNetwork(this.scopeNetwork);
      if (scoped) {
        return scoped;
      }
      const active = this.normalizeNetwork(this.activeNetwork);
      return active || 'testnet';
    },
    networkLabel(value) {
      const key = this.normalizeNetwork(value);
      return key === 'mainnet' ? 'Mainnet' : 'Testnet';
    },
    settingsEndpoint() {
      const network = this.resolveScopeNetwork();
      const query = new URLSearchParams({ network });
      return `${this.apiBase}/api/v1/settings/webhook?${query.toString()}`;
    },
    normalizeUrl(value) {
      return String(value || '').trim();
    },
    applyPayload(payload) {
      this.form.enabled = Boolean(payload.enabled);
      this.form.timeout_sec = Number(payload.timeout_sec || 10);
      this.form.default_url = String(payload.default_url || '');
      this.form.new_firmware_released_url = String(payload.new_firmware_released_url || '');
      this.form.new_network_firmware_released_url = String(payload.new_network_firmware_released_url || '');
      this.form.new_device_firmware_released_url = String(payload.new_device_firmware_released_url || '');
      this.form.new_network_device_firmware_released_url = String(payload.new_network_device_firmware_released_url || '');
      this.activeNetwork = String(payload.active_network || '');
      this.scopeNetwork = this.normalizeNetwork(payload.network) || this.resolveScopeNetwork();
    },
    async loadSettings() {
      this.loading = true;
      this.error = null;
      this.statusNote = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.activeNetwork = 'unknown';
        this.loading = false;
        return;
      }
      try {
        const response = await fetch(`${this.settingsEndpoint()}&_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) {
          throw new Error(`Failed to load webhook settings (HTTP ${response.status})`);
        }
        const payload = await response.json();
        this.applyPayload(payload);
      } catch (err) {
        console.error('Webhook settings fetch error:', err);
        this.error = `Failed to connect to API at ${this.apiDisplayBase || this.apiBase}. Ensure the MatterOverwatch service is running.`;
        this.activeNetwork = 'unknown';
      } finally {
        this.loading = false;
      }
    },
    async saveSettings() {
      this.saving = true;
      this.error = null;
      this.statusNote = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.saving = false;
        return;
      }
      try {
        const body = {
          enabled: Boolean(this.form.enabled),
          timeout_sec: Math.max(2, Number(this.form.timeout_sec || 10)),
          default_url: this.normalizeUrl(this.form.default_url) || null,
          new_firmware_released_url: this.normalizeUrl(this.form.new_firmware_released_url) || null,
          new_network_firmware_released_url: this.normalizeUrl(this.form.new_network_firmware_released_url) || null,
          new_device_firmware_released_url: this.normalizeUrl(this.form.new_device_firmware_released_url) || null,
          new_network_device_firmware_released_url: this.normalizeUrl(this.form.new_network_device_firmware_released_url) || null
        };
        const response = await fetch(this.settingsEndpoint(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          throw new Error(`Failed to save webhook settings (${response.status})`);
        }
        const payload = await response.json();
        this.applyPayload({
          ...(payload.settings || {}),
          network: payload.network,
          active_network: payload.active_network
        });
        this.statusNote = `Webhook settings saved for ${this.networkLabel(this.scopeNetwork)}.`;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to save webhook settings';
      } finally {
        this.saving = false;
      }
    },
    async sendTestEvents() {
      this.testing = true;
      this.error = null;
      this.statusNote = null;
      this.testResults = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.testing = false;
        return;
      }
      try {
        const network = this.resolveScopeNetwork();
        const query = new URLSearchParams({ network });
        const response = await fetch(`${this.apiBase}/api/v1/settings/webhook/test?${query.toString()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ use_default_fallback: true })
        });
        if (!response.ok) {
          throw new Error(`Failed to send test events (HTTP ${response.status})`);
        }
        const payload = await response.json();
        this.testResults = payload.results || {};
        const count = Number(payload.messages_sent || 0);
        this.statusNote = payload.any_sent
          ? `Sent ${count} test message${count === 1 ? '' : 's'} for ${this.networkLabel(network)} (one per unique destination). Check your Discord channel.`
          : `No webhook URLs are configured for ${this.networkLabel(network)}.`;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to send test events';
      } finally {
        this.testing = false;
      }
    }
  },
  computed: {
    selectedNetwork() {
      return this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || '';
    },
    scopeNetworkLabel() {
      return this.networkLabel(this.scopeNetwork);
    },
    testResultRows() {
      if (!this.testResults) {
        return [];
      }
      const labels = {
        new_firmware_released: 'General Firmware Release',
        new_network_firmware_released: 'Network Firmware Release',
        new_device_firmware_released: 'New Device Discovery',
        new_network_device_firmware_released: 'Network New Device Discovery'
      };
      const order = [
        'new_firmware_released',
        'new_network_firmware_released',
        'new_device_firmware_released',
        'new_network_device_firmware_released'
      ];
      return order
        .filter((key) => this.testResults[key])
        .map((key) => {
          const r = this.testResults[key] || {};
          const result = String(r.result || 'skipped');
          const severity = result === 'ok' ? 'success' : (result === 'failed' ? 'danger' : 'warning');
          let detail = '';
          if (result === 'ok' && r.status != null) {
            detail = `HTTP ${r.status}`;
          } else if (result === 'failed') {
            detail = r.error || (r.status != null ? `HTTP ${r.status}` : 'failed');
          } else if (result === 'skipped') {
            detail = 'no URL configured';
          }
          return { key, title: labels[key] || key, label: result.toUpperCase(), severity, detail };
        });
    }
  },
  watch: {
    selectedNetwork(next, prev) {
      const a = this.normalizeNetwork(next);
      const b = this.normalizeNetwork(prev);
      if (!a || a === b) {
        return;
      }
      // Follow the global network selector (top-right MAINNET/TESTNET).
      this.scopeNetwork = a;
      this.testResults = null;
      this.loadSettings();
    }
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
</style>
