<template>
  <div class="p-3">
    <div class="grid">
      <div class="col-12">
        <Card>
          <template #title>Scan Results</template>
          <template #content>
            <p class="m-0 text-600">
              Placeholder results view combining verdicts, evidence status, and report readiness.
            </p>
          </template>
        </Card>
      </div>

      <div class="col-12 md:col-4" v-for="kpi in kpis" :key="kpi.label">
        <div class="card mb-0">
          <div class="text-500 text-sm">{{ kpi.label }}</div>
          <div class="text-900 text-2xl font-semibold mt-2">{{ kpi.value }}</div>
        </div>
      </div>

      <div class="col-12">
        <Card>
          <template #title>Latest Verdicts</template>
          <template #content>
            <DataTable :value="results" responsiveLayout="scroll" class="p-datatable-sm">
              <Column field="firmware" header="Firmware"></Column>
              <Column field="integrity" header="Integrity">
                <template #body="slotProps">
                  <Tag :value="slotProps.data.integrity" :severity="severityFor(slotProps.data.integrity)" />
                </template>
              </Column>
              <Column field="authenticity" header="Authenticity">
                <template #body="slotProps">
                  <Tag :value="slotProps.data.authenticity" :severity="severityFor(slotProps.data.authenticity)" />
                </template>
              </Column>
              <Column field="sdkMatch" header="SDK Evidence"></Column>
              <Column field="report" header="Report"></Column>
            </DataTable>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FirmwareScanResults',
  data() {
    return {
      kpis: [
        { label: 'Total Scans', value: 251 },
        { label: 'Passed Integrity', value: '93%' },
        { label: 'Reports Generated', value: 247 }
      ],
      results: [
        { firmware: 'lighting-app-v1.4.2.bin', integrity: 'Pass', authenticity: 'Pass', sdkMatch: 'Likely 1.4/1.5', report: 'Ready' },
        { firmware: 'sensor-v3.0.0.ota', integrity: 'Fail', authenticity: 'Inconclusive', sdkMatch: 'Insufficient', report: 'Ready' },
        { firmware: 'thermostat-prod-v2.1.0.ota', integrity: 'Pass', authenticity: 'Pass', sdkMatch: 'Likely 1.5', report: 'Pending' }
      ]
    };
  },
  methods: {
    severityFor(value) {
      if (value === 'Pass') return 'success';
      if (value === 'Fail') return 'danger';
      if (value === 'Inconclusive') return 'warning';
      return 'info';
    }
  }
};
</script>
