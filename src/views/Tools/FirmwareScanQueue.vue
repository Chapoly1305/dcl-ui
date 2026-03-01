<template>
  <div class="p-3 firmware-queue-page">
    <div class="grid">
      <div class="col-12">
        <Card class="queue-header-card mb-3">
          <template #title>
            <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="flex align-items-center gap-2 flex-wrap">
                <span>Execution Pipelines</span>
                <Tag :value="`Updated: ${lastUpdated ? formatTimestamp(lastUpdated) : 'never'}`" severity="info" />
                <Tag v-if="loading" value="Refreshing" severity="warning" />
              </div>
              <div class="flex align-items-center gap-2 flex-wrap">
                <Button
                  icon="pi pi-refresh"
                  class="p-button-text p-button-sm p-button-rounded"
                  :loading="loading"
                  v-tooltip.top="'Refresh All Queues'"
                  @click="refreshQueue"
                />
              </div>
            </div>
          </template>
          <template #content>
            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
            <Message v-else-if="statusNote" severity="success" :closable="false">{{ statusNote }}</Message>
          </template>
        </Card>
      </div>

      <div class="col-12">
        <TabView v-model:activeIndex="activeTab">
          <!-- TAB 1: FIRMWARE ANALYSIS -->
          <TabPanel>
            <template #header>
              <i class="pi pi-box mr-2"></i>
              <span>Firmware Analysis</span>
              <Badge :value="analysisStats.outstanding" class="ml-2" severity="warning" v-if="analysisStats.outstanding > 0"></Badge>
            </template>
            
            <div class="grid mt-2">
              <div class="col-12 md:col-4" v-for="stat in analysisStatCards" :key="stat.label">
                <div class="card mb-3 stat-card surface-card border-1 surface-border shadow-1">
                  <div class="flex justify-content-between mb-2">
                    <div>
                      <span class="block text-500 font-medium mb-1 text-xs uppercase">{{ stat.label }}</span>
                      <div class="text-900 font-bold text-xl">{{ stat.value }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center border-round" :class="stat.iconBg" style="width:2.2rem;height:2.2rem">
                      <i class="pi text-lg" :class="[stat.icon, stat.iconColor]"></i>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="jobs-card h-full border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Active Analysis</span></template>
                  <template #content>
                    <DataTable :value="analysisJobs.running" responsiveLayout="scroll" class="p-datatable-sm" :rows="5">
                      <Column field="job_id" header="ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="firmware_sha256" header="SHA-256">
                        <template #body="slotProps">
                          <code>{{ shortSha(slotProps.data.firmware_sha256) }}</code>
                        </template>
                      </Column>
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Progress'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="analysisJobs.running.length === 0" class="p-5 text-center text-400 italic flex flex-column align-items-center">
                      <i class="pi pi-play text-2xl mb-2"></i>
                      <span>No running analysis.</span>
                    </div>
                  </template>
                </Card>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="jobs-card h-full border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Queued Analysis</span></template>
                  <template #content>
                    <DataTable :value="analysisJobs.pending" responsiveLayout="scroll" class="p-datatable-sm" :rows="5">
                      <Column field="job_id" header="ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="firmware_sha256" header="SHA-256">
                        <template #body="slotProps">
                          <code>{{ shortSha(slotProps.data.firmware_sha256) }}</code>
                        </template>
                      </Column>
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Progress'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="analysisJobs.pending.length === 0" class="p-5 text-center text-400 italic flex flex-column align-items-center">
                      <i class="pi pi-clock text-2xl mb-2"></i>
                      <span>No queued analysis.</span>
                    </div>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>

          <!-- TAB 2: CONFORMANCE VALIDATION -->
          <TabPanel>
            <template #header>
              <i class="pi pi-shield mr-2"></i>
              <span>Conformance</span>
              <Badge :value="conformanceJobs.running.length + conformanceJobs.pending.length" class="ml-2" severity="info" v-if="conformanceJobs.running.length + conformanceJobs.pending.length > 0"></Badge>
            </template>
            
            <div class="grid mt-2">
              <div class="col-12 md:col-4" v-for="stat in conformanceStatCards" :key="stat.label">
                <div class="card mb-3 stat-card surface-card border-1 surface-border shadow-1">
                  <div class="flex justify-content-between mb-2">
                    <div>
                      <span class="block text-500 font-medium mb-1 text-xs uppercase">{{ stat.label }}</span>
                      <div class="text-900 font-bold text-xl">{{ stat.value }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center border-round" :class="stat.iconBg" style="width:2.2rem;height:2.2rem">
                      <i class="pi text-lg" :class="[stat.icon, stat.iconColor]"></i>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12">
                <div class="flex justify-content-end mb-3">
                  <Button 
                    label="Enqueue Conformance Validation" 
                    icon="pi pi-shield" 
                    class="p-button-sm p-button-primary"
                    :loading="actionLoading.validate"
                    @click="enqueueValidateConformance"
                  />
                </div>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="jobs-card h-full border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Active Validation</span></template>
                  <template #content>
                    <DataTable :value="conformanceJobs.running" responsiveLayout="scroll" class="p-datatable-sm" :rows="5">
                      <Column field="job_id" header="ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="requested_by" header="Requested By" />
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Statistics'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="conformanceJobs.running.length === 0" class="p-5 text-center text-400 italic">No running validation.</div>
                  </template>
                </Card>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="jobs-card h-full border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Queued Validation</span></template>
                  <template #content>
                    <DataTable :value="conformanceJobs.pending" responsiveLayout="scroll" class="p-datatable-sm" :rows="5">
                      <Column field="job_id" header="ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="requested_by" header="Requested By" />
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Statistics'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="conformanceJobs.pending.length === 0" class="p-5 text-center text-400 italic">No queued validation.</div>
                  </template>
                </Card>
              </div>

              <div class="col-12 mt-3">
                <Card class="jobs-card border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Conformance History</span></template>
                  <template #content>
                    <DataTable :value="conformanceHistory" responsiveLayout="scroll" class="p-datatable-sm" :rows="10" paginator>
                      <Column field="job_id" header="Job ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="status" header="Status">
                        <template #body="slotProps">
                          <Tag :value="slotProps.data.status" :severity="statusSeverity(slotProps.data.status)" />
                        </template>
                      </Column>
                      <Column field="finished_at" header="Finished">
                        <template #body="slotProps">
                          {{ formatTimestamp(slotProps.data.finished_at) }}
                        </template>
                      </Column>
                      <Column header="Latest Outcome">
                        <template #body="slotProps">
                          <div v-if="slotProps.data.progress" class="flex gap-3 text-xs">
                            <span class="text-green-600 font-bold">Pass: {{ slotProps.data.progress.pass }}</span>
                            <span class="text-red-600 font-bold">Violations: {{ slotProps.data.progress.violation }}</span>
                          </div>
                          <span v-else class="text-400">-</span>
                        </template>
                      </Column>
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Statistics'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="conformanceHistory.length === 0" class="p-5 text-center text-400 italic">No conformance history.</div>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>

          <!-- TAB 3: SOURCE POLLING -->
          <TabPanel>
            <template #header>
              <i class="pi pi-cloud-download mr-2"></i>
              <span>Polling</span>
              <Badge :value="pollJobs.running.length + pollJobs.pending.length" class="ml-2" severity="info" v-if="pollJobs.running.length + pollJobs.pending.length > 0"></Badge>
            </template>
            
            <div class="grid mt-2">
              <div class="col-12">
                <div class="flex justify-content-between align-items-center mb-3 px-2">
                  <div class="text-600">
                    <i class="pi pi-info-circle mr-1"></i>
                    Synchronize local store with DCL firmware repository. Pulls new data without triggering automatic scans.
                  </div>
                  <Button 
                    label="Poll Remote Repository" 
                    icon="pi pi-cloud-download" 
                    class="p-button-sm p-button-outlined"
                    :loading="actionLoading.poll"
                    @click="enqueuePollSource"
                  />
                </div>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="jobs-card h-full border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Active Polling</span></template>
                  <template #content>
                    <DataTable :value="pollJobs.running" responsiveLayout="scroll" class="p-datatable-sm" :rows="5">
                      <Column field="job_id" header="ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="requested_by" header="Source" />
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Log'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="pollJobs.running.length === 0" class="p-5 text-center text-400 italic">No running polls.</div>
                  </template>
                </Card>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="jobs-card h-full border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Queued Polling</span></template>
                  <template #content>
                    <DataTable :value="pollJobs.pending" responsiveLayout="scroll" class="p-datatable-sm" :rows="5">
                      <Column field="job_id" header="ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="requested_by" header="Source" />
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Log'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="pollJobs.pending.length === 0" class="p-5 text-center text-400 italic">No queued polls.</div>
                  </template>
                </Card>
              </div>

              <div class="col-12 mt-3">
                <Card class="jobs-card border-1 surface-border shadow-1">
                  <template #title><span class="text-lg font-bold">Polling History</span></template>
                  <template #content>
                    <DataTable :value="pollHistory" responsiveLayout="scroll" class="p-datatable-sm" :rows="10" paginator>
                      <Column field="job_id" header="Job ID">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.job_id.slice(0, 8) }}</code>
                        </template>
                      </Column>
                      <Column field="status" header="Status">
                        <template #body="slotProps">
                          <Tag :value="slotProps.data.status" :severity="statusSeverity(slotProps.data.status)" />
                        </template>
                      </Column>
                      <Column field="finished_at" header="Time">
                        <template #body="slotProps">
                          {{ formatTimestamp(slotProps.data.finished_at || slotProps.data.started_at || slotProps.data.requested_at) }}
                        </template>
                      </Column>
                      <Column field="requested_by" header="Source" />
                      <Column header="Actions" bodyClass="text-right">
                        <template #body="slotProps">
                          <Button icon="pi pi-chart-line" class="p-button-sm p-button-text p-button-rounded" v-tooltip.top="'View Log'" @click="openJobProgress(slotProps.data.job_id)" />
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="pollHistory.length === 0" class="p-5 text-center text-400 italic">No polling activity.</div>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>
        </TabView>
      </div>
    </div>
    
    <FirmwareJobProgressModal
      :visible="progressDialogVisible"
      :job-id="progressJobId"
      :api-base="apiBase"
      @update:visible="progressDialogVisible = $event"
    />
  </div>
</template>

<script>
import FirmwareJobProgressModal from '@/components/FirmwareJobProgressModal.vue';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

export default {
  name: 'FirmwareScanQueue',
  components: {
    FirmwareJobProgressModal
  },
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      apiBase: requestBase,
      activeTab: 0,
      loading: false,
      error: null,
      statusNote: null,
      lastUpdated: null,
      jobs: {
        pending: [],
        running: [],
        done: [],
        failed: []
      },
      actionLoading: {
        poll: false,
        validate: false
      },
      progressDialogVisible: false,
      progressJobId: ''
    };
  },
  computed: {
    analysisJobs() {
      const filterFn = j => j.job_type === 'analyze' || j.job_type === 'rerun';
      return {
        pending: this.jobs.pending.filter(filterFn),
        running: this.jobs.running.filter(filterFn),
        done: this.jobs.done.filter(filterFn),
        failed: this.jobs.failed.filter(filterFn)
      };
    },
    conformanceJobs() {
      const filterFn = j => j.job_type === 'validate_conformance';
      return {
        pending: this.jobs.pending.filter(filterFn),
        running: this.jobs.running.filter(filterFn),
        done: this.jobs.done.filter(filterFn),
        failed: this.jobs.failed.filter(filterFn)
      };
    },
    pollJobs() {
      const filterFn = j => j.job_type === 'poll';
      return {
        pending: this.jobs.pending.filter(filterFn),
        running: this.jobs.running.filter(filterFn),
        done: this.jobs.done.filter(filterFn),
        failed: this.jobs.failed.filter(filterFn)
      };
    },
    conformanceHistory() {
      return [...this.conformanceJobs.done, ...this.conformanceJobs.failed]
        .sort((a, b) => String(b.finished_at || '').localeCompare(String(a.finished_at || '')));
    },
    pollHistory() {
      return [...this.pollJobs.done, ...this.pollJobs.failed]
        .sort((a, b) => {
          const ta = a.finished_at || a.started_at || a.requested_at || '';
          const tb = b.finished_at || b.started_at || b.requested_at || '';
          return String(tb).localeCompare(String(ta));
        });
    },
    analysisStats() {
      const running = this.analysisJobs.running.length;
      const pending = this.analysisJobs.pending.length;
      const done = this.analysisJobs.done.length;
      const failed = this.analysisJobs.failed.length;
      return { outstanding: running + pending, running, pending, done, failed };
    },
    analysisStatCards() {
      const stats = this.analysisStats;
      return [
        { label: 'Active', value: stats.running, icon: 'pi-spin pi-spinner', iconColor: 'text-purple-500', iconBg: 'bg-purple-100' },
        { label: 'Queued', value: stats.pending, icon: 'pi-clock', iconColor: 'text-orange-500', iconBg: 'bg-orange-100' },
        { label: 'Completed', value: stats.done, icon: 'pi-check-circle', iconColor: 'text-green-500', iconBg: 'bg-green-100' }
      ];
    },
    conformanceStatCards() {
      const running = this.conformanceJobs.running.length;
      const totalProcessed = this.conformanceJobs.done.reduce((acc, j) => acc + (j.progress?.total || 0), 0);
      const totalViolations = this.conformanceJobs.done.reduce((acc, j) => acc + (j.progress?.violation || 0), 0);
      return [
        { label: 'Running', value: running, icon: 'pi-shield', iconColor: 'text-blue-500', iconBg: 'bg-blue-100' },
        { label: 'Records Scanned', value: totalProcessed, icon: 'pi-database', iconColor: 'text-teal-500', iconBg: 'bg-teal-100' },
        { label: 'Total Violations', value: totalViolations, icon: 'pi-exclamation-triangle', iconColor: 'text-red-500', iconBg: 'bg-red-100' }
      ];
    }
  },
  methods: {
    async refreshQueue() {
      this.loading = true;
      this.error = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs`);
        if (!response.ok) throw new Error(`Queue request failed (${response.status})`);
        const payload = await response.json();
        this.jobs = {
          pending: Array.isArray(payload.pending) ? payload.pending : [],
          running: Array.isArray(payload.running) ? payload.running : [],
          done: Array.isArray(payload.done) ? payload.done : [],
          failed: Array.isArray(payload.failed) ? payload.failed : []
        };
        this.lastUpdated = new Date().toISOString();
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load scan queue';
      } finally {
        this.loading = false;
      }
    },
    async enqueuePollSource() {
      this.actionLoading.poll = true;
      this.statusNote = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs/poll-now`, { method: 'POST' });
        if (!response.ok) throw new Error(`Poll enqueue failed (${response.status})`);
        this.statusNote = 'Source polling job queued.';
        await this.refreshQueue();
      } catch (err) {
        this.error = err.message;
      } finally {
        this.actionLoading.poll = false;
      }
    },
    async enqueueValidateConformance() {
      this.actionLoading.validate = true;
      this.statusNote = null;
      try {
        const response = await fetch(`${this.apiBase}/api/v1/jobs/validate-conformance`, { method: 'POST' });
        if (!response.ok) throw new Error(`Validate enqueue failed (${response.status})`);
        this.statusNote = 'Conformance validation job queued.';
        await this.refreshQueue();
      } catch (err) {
        this.error = err.message;
      } finally {
        this.actionLoading.validate = false;
      }
    },
    formatTimestamp(value) {
      if (!value) return '-';
      const dt = new Date(value);
      return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleString();
    },
    shortSha(value) {
      const text = String(value || '').trim();
      return text.length > 14 ? `${text.slice(0, 6)}...${text.slice(-6)}` : (text || '-');
    },
    statusSeverity(status) {
      const key = String(status || '').toLowerCase();
      if (key === 'done') return 'success';
      if (key === 'failed') return 'danger';
      if (key === 'running') return 'info';
      return 'warning';
    },
    openJobProgress(jobId) {
      if (!jobId) return;
      this.progressJobId = jobId;
      this.progressDialogVisible = true;
    }
  },
  mounted() {
    this.refreshQueue();
  }
};
</script>

<style scoped>
.firmware-queue-page :deep(.p-tabview-nav) {
  background: transparent;
  border: none;
}

.firmware-queue-page :deep(.p-tabview-panels) {
  background: transparent;
  padding: 1rem 0;
}

.firmware-queue-page .stat-card {
  min-height: 78px;
  padding: 1rem;
  border-radius: 12px;
}
</style>
