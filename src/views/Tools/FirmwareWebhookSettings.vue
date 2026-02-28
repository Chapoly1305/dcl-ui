<template>
  <div class="p-3 webhook-settings-page">
    <div class="grid">
      <div class="col-12">
        <Card class="settings-card">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Webhook Settings</span>
                <Tag :value="`Active Network: ${activeNetwork || 'unknown'}`" severity="info" />
                <Tag value="Active Network Only" severity="warning" />
              </div>
              <div class="flex align-items-center gap-2">
                <Button
                  icon="pi pi-refresh"
                  class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading"
                  v-tooltip.top="'Reload settings'"
                  @click="loadSettings"
                />
              </div>
            </div>
          </template>
          <template #content>
            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
            <Message v-else-if="statusNote" severity="success" :closable="false">{{ statusNote }}</Message>
            <div class="text-600 text-sm mb-3">
              Changes are persisted in MatterOverwatch internal state and read by worker automatically.
            </div>

            <div class="formgrid grid">
              <div class="field col-12 md:col-4">
                <label class="form-label" for="webhook-enabled">Webhook Enabled</label>
                <div>
                  <InputSwitch id="webhook-enabled" v-model="form.enabled" />
                </div>
              </div>
              <div class="field col-12 md:col-4">
                <label class="form-label" for="webhook-timeout">Timeout (sec)</label>
                <InputNumber id="webhook-timeout" v-model="form.timeout_sec" :min="2" :max="120" :useGrouping="false" />
              </div>
            </div>

            <div class="formgrid grid">
              <div class="field col-12">
                <label class="form-label" for="default-url">Default Webhook URL (fallback)</label>
                <InputText id="default-url" v-model="form.default_url" class="w-full" placeholder="https://discord.com/api/webhooks/..." />
              </div>
            </div>

            <div class="formgrid grid">
              <div class="field col-12 md:col-6">
                <label class="form-label" for="new-fw-url">New Firmware Released URL</label>
                <InputText id="new-fw-url" v-model="form.new_firmware_released_url" class="w-full" placeholder="Optional override" />
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="new-net-fw-url">New Test/Prod Firmware Released URL</label>
                <InputText id="new-net-fw-url" v-model="form.new_network_firmware_released_url" class="w-full" placeholder="Optional override" />
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="new-dev-url">New Device Firmware Released URL</label>
                <InputText id="new-dev-url" v-model="form.new_device_firmware_released_url" class="w-full" placeholder="Optional override" />
              </div>
              <div class="field col-12 md:col-6">
                <label class="form-label" for="new-net-dev-url">New Test/Prod Device Firmware Released URL</label>
                <InputText id="new-net-dev-url" v-model="form.new_network_device_firmware_released_url" class="w-full" placeholder="Optional override" />
              </div>
            </div>

            <div class="flex gap-2 mt-2">
              <Button label="Save" icon="pi pi-save" class="p-button-sm" :loading="saving" @click="saveSettings" />
              <Button label="Reset Form" icon="pi pi-undo" class="p-button-sm p-button-outlined" :disabled="saving" @click="loadSettings" />
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FirmwareWebhookSettings',
  data() {
    const apiBase = (import.meta.env.VITE_APP_MATTEROVERWATCH_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
    return {
      apiBase,
      loading: false,
      saving: false,
      error: null,
      statusNote: null,
      activeNetwork: '',
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
    },
    async loadSettings() {
      this.loading = true;
      this.error = null;
      this.statusNote = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/settings/webhook`);
        if (!response.ok) {
          throw new Error(`Failed to load webhook settings (${response.status})`);
        }
        const payload = await response.json();
        this.applyPayload(payload);
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load webhook settings';
      } finally {
        this.loading = false;
      }
    },
    async saveSettings() {
      this.saving = true;
      this.error = null;
      this.statusNote = null;
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
        const response = await fetch(`${this.apiBase}/api/v1/settings/webhook`, {
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
          active_network: payload.active_network
        });
        this.statusNote = 'Webhook settings saved.';
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to save webhook settings';
      } finally {
        this.saving = false;
      }
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

.form-label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.35rem;
  color: #374151;
}
</style>
