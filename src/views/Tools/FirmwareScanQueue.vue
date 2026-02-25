<template>
  <div class="p-3">
    <div class="grid">
      <div class="col-12">
        <Card>
          <template #title>Scan Queue</template>
          <template #content>
            <p class="m-0 text-600">
              Placeholder queue view for pending/running/completed firmware scans.
            </p>
          </template>
        </Card>
      </div>

      <div class="col-12 md:col-6">
        <Card>
          <template #title>Queue Health</template>
          <template #content>
            <div class="mb-3">
              <div class="flex justify-content-between mb-2">
                <span>Worker Utilization</span>
                <strong>72%</strong>
              </div>
              <ProgressBar :value="72" />
            </div>
            <div class="flex gap-2 flex-wrap">
              <Tag value="Pending: 9" severity="warning" />
              <Tag value="Running: 3" severity="info" />
              <Tag value="Done: 58" severity="success" />
              <Tag value="Failed: 2" severity="danger" />
            </div>
          </template>
        </Card>
      </div>

      <div class="col-12 md:col-6">
        <Card>
          <template #title>Quick Actions (Mock)</template>
          <template #content>
            <div class="flex gap-2 flex-wrap">
              <Button label="Poll Source" icon="pi pi-refresh" class="p-button-outlined" disabled />
              <Button label="Retry Failed" icon="pi pi-replay" class="p-button-outlined" disabled />
              <Button label="Pause Worker" icon="pi pi-pause" class="p-button-outlined p-button-warning" disabled />
            </div>
          </template>
        </Card>
      </div>

      <div class="col-12">
        <Card>
          <template #title>Recent Jobs</template>
          <template #content>
            <DataTable :value="jobs" responsiveLayout="scroll" class="p-datatable-sm">
              <Column field="jobId" header="Job ID"></Column>
              <Column field="firmware" header="Firmware"></Column>
              <Column field="type" header="Type"></Column>
              <Column field="queuedAt" header="Queued At"></Column>
              <Column field="state" header="State">
                <template #body="slotProps">
                  <Tag :value="slotProps.data.state" :severity="severityFor(slotProps.data.state)" />
                </template>
              </Column>
            </DataTable>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FirmwareScanQueue',
  data() {
    return {
      jobs: [
        { jobId: 'job-24091', firmware: 'lighting-app-v1.4.2.bin', type: 'analyze', queuedAt: '2026-02-25 16:21', state: 'Running' },
        { jobId: 'job-24090', firmware: 'lock-fw-v1.8.3.bin', type: 'rerun', queuedAt: '2026-02-25 16:15', state: 'Done' },
        { jobId: 'job-24088', firmware: 'sensor-v3.0.0.ota', type: 'analyze', queuedAt: '2026-02-25 16:03', state: 'Failed' }
      ]
    };
  },
  methods: {
    severityFor(state) {
      if (state === 'Done') return 'success';
      if (state === 'Running') return 'info';
      if (state === 'Failed') return 'danger';
      return 'warning';
    }
  }
};
</script>
