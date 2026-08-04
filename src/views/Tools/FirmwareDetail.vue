<template>
  <div class="p-3 firmware-detail-page">
    <div class="grid">
      <div class="col-12">
        <Card class="detail-header-card">
          <template #title>
            <div class="flex flex-column gap-3">
              <div class="flex align-items-center justify-content-between gap-2">
                <div class="flex align-items-center gap-2">
                  <Button icon="pi pi-arrow-left" class="p-button-text p-button-sm m-0 p-0 w-2rem h-2rem" @click="goBack" />
                  <span class="text-xl font-bold">Firmware Detail</span>
                </div>
                <div class="flex align-items-center gap-2">
                  <Button
                    icon="pi pi-play"
                    class="p-button-sm"
                    label="Analyze"
                    :disabled="!detail.is_downloaded"
                    :loading="enqueueLoading"
                    @click="enqueueAnalyze"
                  />
                  <Button
                    icon="pi pi-refresh"
                    class="p-button-text p-button-sm p-button-rounded"
                    :loading="loading"
                    v-tooltip.top="'Refresh detail'"
                    @click="refreshAll"
                  />
                </div>
              </div>
              <div class="flex align-items-center gap-2 flex-wrap text-sm">
                <span class="text-600">SHA-256:</span>
                <code>{{ shortSha(firmwareSha256) }}</code>
                <Divider layout="vertical" class="m-0 hidden md:block" />
                <Tag :value="`Network: ${selectedNetwork}`" severity="warning" />
                <Tag :value="detail.is_downloaded ? 'Downloaded' : 'Not Downloaded'" :severity="detail.is_downloaded ? 'success' : 'warning'" />
                <Tag :value="analysisLabel(detail.analysis_latest_status)" :severity="analysisSeverity(detail.analysis_latest_status)" />
              </div>
            </div>
          </template>
          <template #content>
            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
            <Message v-else-if="statusNote" severity="success" :closable="false">{{ statusNote }}</Message>
            <div v-else class="text-600 text-sm">
              Last analysis: {{ displayValue(formatTimestamp(detail.analysis_latest_at)) }}
            </div>
          </template>
        </Card>
      </div>

      <div class="col-12">
        <TabView v-model:activeIndex="activeTabIndex" @tab-change="onTabChange">
          <TabPanel header="Overview">
            <div class="grid">
              <div class="col-6 md:col-3" v-for="k in overviewKpis" :key="k.label">
                <div class="card mb-0 stat-card">
                  <div class="flex justify-content-between mb-2">
                    <div>
                      <span class="block text-500 font-medium mb-1 stat-label-text">{{ k.label }}</span>
                      <div class="text-900 font-bold text-xl">{{ k.value }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center border-round" :class="k.iconBg" style="width:2.5rem;height:2.5rem">
                      <i class="pi text-xl" :class="[k.icon, k.iconColor]"></i>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="detail-card">
                  <template #title>Linked DCL Records</template>
                  <template #content>
                    <DataTable :value="detail.aliases || []" responsiveLayout="scroll" class="p-datatable-sm" :rows="8" :paginator="(detail.aliases || []).length > 8">
                      <Column field="network" header="Network" />
                      <Column field="vid" header="VID" />
                      <Column field="pid" header="PID" />
                      <Column field="software_version" header="Software Version" />
                      <Column field="tx_hash_first8" header="TxHash (First 8)">
                        <template #body="slotProps">
                          <code>{{ slotProps.data.tx_hash_first8 }}</code>
                        </template>
                      </Column>
                    </DataTable>
                    <div v-if="(detail.aliases || []).length === 0" class="text-600 mt-2">No linked DCL aliases.</div>
                  </template>
                </Card>
              </div>

              <div class="col-12 lg:col-6">
                <Card class="detail-card h-full">
                  <template #title>Latest Outcome</template>
                  <template #content>
                    <div v-if="detail.latest_result" class="outcome-grid">
                      <div class="outcome-row"><span class="outcome-label">Result ID</span><code class="outcome-value">{{ detail.latest_result.result_id }}</code></div>
                      <div class="outcome-row"><span class="outcome-label">Run ID</span><code class="outcome-value">{{ detail.latest_result.run_id }}</code></div>
                      <div class="outcome-row"><span class="outcome-label">Status</span><span class="outcome-value">{{ detail.latest_result.status }}</span></div>
                      <div class="outcome-row"><span class="outcome-label">Analyzed At</span><span class="outcome-value">{{ formatTimestamp(detail.latest_result.analyzed_at) }}</span></div>
                      <div class="outcome-row"><span class="outcome-label">Integrity</span><span class="outcome-value">{{ detail.latest_result.verdict_integrity }}</span></div>
                      <div class="outcome-row"><span class="outcome-label">Authenticity</span><span class="outcome-value">{{ detail.latest_result.verdict_authenticity }}</span></div>
                      <div class="outcome-row"><span class="outcome-label">Chipset</span><span class="outcome-value">{{ detail.latest_result.chipset }}</span></div>
                      <div class="outcome-row"><span class="outcome-label">SDK Version</span><span class="outcome-value">{{ sdkDisplayValue(detail.latest_result.sdk_decoded_version) }}</span></div>
                      <div class="outcome-row"><span class="outcome-label">Container Entropy</span><span class="outcome-value">{{ entropyDisplay(latestMatterHeader.container_entropy_bits_per_byte) }}</span></div>
                      <div class="outcome-row"><span class="outcome-label">Payload Entropy</span><span class="outcome-value">{{ entropyDisplay(latestMatterHeader.payload_entropy_bits_per_byte) }}</span></div>
                    </div>
                    <div v-else class="text-600">No completed analysis yet for this firmware group.</div>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>


          <TabPanel header="Capabilities">
            <div class="grid">
              <div class="col-12">
                <Card class="detail-card">
                  <template #title>Endpoints / Clusters / Attributes</template>
                  <template #content>
                    <div class="grid mb-2">
                      <div class="col-6 md:col-3"><strong>Endpoints:</strong> {{ capabilityEndpoints.length }}</div>
                      <div class="col-6 md:col-3"><strong>Clusters:</strong> {{ capabilityClusters.length }}</div>
                      <div class="col-6 md:col-3"><strong>Attributes:</strong> {{ capabilityAttributeRows.length }}</div>
                      <div class="col-6 md:col-3"><strong>Defaults:</strong> {{ capabilityDefaultsCount }}</div>
                      <div class="col-6 md:col-3"><strong>Global Attributes:</strong> {{ capabilityGlobalAttributeRows.length }}</div>
                    </div>
                    <Message v-if="capabilityMissingReasonLabel" severity="warn" :closable="false" class="mb-3">
                      {{ capabilityMissingReasonLabel }}
                    </Message>
                    <div v-if="capabilityEndpoints.length === 0 && capabilityAttributeRows.length === 0" class="text-600">
                      No capability output available for this run.
                    </div>
                    <div v-else class="grid">
                      <div class="col-12">
                        <div class="text-700 font-medium mb-2">Endpoints</div>
                        <DataTable :value="capabilityEndpoints" responsiveLayout="scroll" class="p-datatable-sm" :rows="8" :paginator="capabilityEndpoints.length > 8">
                          <Column field="endpoint" header="Endpoint">
                            <template #body="slotProps">{{ `#${slotProps.data.endpoint}` }}</template>
                          </Column>
                          <Column field="cluster_count" header="Clusters" />
                          <Column field="clusters" header="Cluster IDs">
                            <template #body="slotProps">
                              <span class="text-sm">{{ (slotProps.data.clusters || []).join(', ') || '-' }}</span>
                            </template>
                          </Column>
                        </DataTable>
                      </div>
                      <div class="col-12">
                        <div class="text-700 font-medium mb-2">Attributes</div>
                        <DataTable :value="capabilityAttributeRows" responsiveLayout="scroll" class="p-datatable-sm" :rows="12" :paginator="capabilityAttributeRows.length > 12">
                          <Column field="cluster" header="Cluster" />
                          <Column field="attribute" header="Attribute" />
                          <Column field="default_raw_u32" header="Default">
                            <template #body="slotProps">{{ capabilityDefaultRaw(slotProps.data) }}</template>
                          </Column>
                          <Column field="length" header="Len">
                            <template #body="slotProps">{{ displayValue(slotProps.data.length) }}</template>
                          </Column>
                          <Column field="type_u8" header="Type">
                            <template #body="slotProps">{{ capabilityTypeName(slotProps.data) }}</template>
                          </Column>
                        </DataTable>
                      </div>
                      <div class="col-12">
                        <div class="text-700 font-medium mb-2">Global Attributes</div>
                        <DataTable :value="capabilityGlobalAttributeRows" responsiveLayout="scroll" class="p-datatable-sm" :rows="12" :paginator="capabilityGlobalAttributeRows.length > 12">
                          <Column field="cluster" header="Cluster" />
                          <Column field="attribute" header="Attribute" />
                          <Column field="default_raw_u32" header="Default">
                            <template #body="slotProps">{{ capabilityDefaultRaw(slotProps.data) }}</template>
                          </Column>
                          <Column field="length" header="Len">
                            <template #body="slotProps">{{ displayValue(slotProps.data.length) }}</template>
                          </Column>
                          <Column field="type_u8" header="Type">
                            <template #body="slotProps">{{ capabilityTypeName(slotProps.data) }}</template>
                          </Column>
                        </DataTable>
                        <div v-if="capabilityGlobalAttributeRows.length === 0" class="text-600 mt-2">
                          No global attributes recovered.
                        </div>
                      </div>
                    </div>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Jobs">
            <Card class="detail-card">
              <template #title>Job History</template>
              <template #content>
                <DataTable :value="jobRows" responsiveLayout="scroll" class="p-datatable-sm" :rows="15" paginator>
                  <Column field="job_id" header="Job ID">
                    <template #body="slotProps"><code>{{ shortId(slotProps.data.job_id) }}</code></template>
                  </Column>
                  <Column field="status" header="Status">
                    <template #body="slotProps"><Tag :value="slotProps.data.status" :severity="analysisSeverity(slotProps.data.status)" /></template>
                  </Column>
                  <Column field="job_type" header="Type" />
                  <Column field="requested_at" header="Requested">
                    <template #body="slotProps">{{ formatTimestamp(slotProps.data.requested_at) }}</template>
                  </Column>
                  <Column field="started_at" header="Started">
                    <template #body="slotProps">{{ displayValue(formatTimestamp(slotProps.data.started_at)) }}</template>
                  </Column>
                  <Column field="finished_at" header="Finished">
                    <template #body="slotProps">{{ displayValue(formatTimestamp(slotProps.data.finished_at)) }}</template>
                  </Column>
                  <Column field="error" header="Error">
                    <template #body="slotProps"><span class="text-600">{{ displayValue(slotProps.data.error) }}</span></template>
                  </Column>
                </DataTable>
              </template>
            </Card>
          </TabPanel>

          <TabPanel header="Modules">
            <div class="grid">
              <div class="col-12 md:col-6" v-for="m in modules" :key="m.module_id">
                <Card class="detail-card module-card">
                  <template #title>
                    <div class="flex align-items-center justify-content-between gap-2 flex-wrap">
                      <span>{{ m.title }}</span>
                      <Tag :value="analysisLabel(m.status)" :severity="analysisSeverity(m.status)" />
                    </div>
                  </template>
                  <template #content>
                    <div class="module-summary">
                      <div v-for="(value, key) in (m.summary || {})" :key="`${m.module_id}-${key}`" class="summary-row">
                        <span class="text-600">{{ key }}</span>
                        <span class="text-900">{{ stringifyValue(value) }}</span>
                      </div>
                    </div>
                    <div class="mt-3">
                      <Accordion :activeIndex="[]">
                        <AccordionTab header="Details (raw)">
                          <vue-json-pretty :data="m.details || {}" :deep="1" class="module-json" />
                        </AccordionTab>
                      </Accordion>
                    </div>
                  </template>
                </Card>
              </div>
              <div v-if="modules.length === 0" class="col-12 text-600">No module output available yet.</div>
            </div>
          </TabPanel>

          <TabPanel header="Layout">
            <div v-if="layoutError" class="col-12">
              <Message severity="error" :closable="false">{{ layoutError }}</Message>
            </div>
            <div v-else-if="!layoutLoaded" class="col-12 text-600 p-3">
              <i class="pi pi-spin pi-spinner mr-2"></i>Loading firmware layout...
            </div>
            <div v-else-if="!layoutPayload.layout_available" class="col-12">
              <Message severity="info" :closable="false">
                Firmware layout not available.
                <span v-if="layoutPayload.reason">Reason: {{ layoutPayload.reason }}</span>
              </Message>
            </div>
            <div v-else class="grid">
              <!-- Summary KPIs -->
              <div class="col-12">
                <div class="grid">
                  <div class="col-6 md:col-3" v-for="k in layoutKpis" :key="k.label">
                    <div class="card mb-0 stat-card">
                      <div class="flex justify-content-between mb-2">
                        <div>
                          <span class="block text-500 font-medium mb-1 stat-label-text">{{ k.label }}</span>
                          <div class="text-900 font-bold text-xl">{{ k.value }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center border-round" :class="k.iconBg" style="width:2.5rem;height:2.5rem">
                          <i class="pi text-xl" :class="[k.icon, k.iconColor]"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Memory map per image -->
              <div class="col-12" v-for="(img, imgIdx) in layoutImages" :key="'img-'+imgIdx">
                <Card class="detail-card">
                  <template #title>
                    <div class="flex align-items-center gap-2 flex-wrap">
                      <i class="pi pi-microchip"></i>
                      <span v-if="img.role || img.origin" class="text-sm text-600">
                        {{ img.role || 'image' }}
                        <span v-if="img.origin"> &mdash; {{ img.origin }}</span>
                      </span>
                      <Tag v-if="img.is_primary" value="primary" severity="info" />
                      <Tag v-if="layoutImages.length > 1" :value="img.file_name" severity="warning" />
                      <Tag
                        :value="img.layout_granularity || layoutPayload.granularity || 'coarse'"
                        :severity="granularitySeverity(img.layout_granularity || layoutPayload.granularity)"
                        class="text-xs"
                      />
                    </div>
                  </template>
                  <template #content>
                    <!-- Memory map visualization -->
                    <div class="memory-map-container mb-3">
                      <div class="memory-map-bar">
                        <div
                          v-for="(region, rIdx) in (img.layout.regions || [])"
                          :key="'r-'+rIdx"
                          class="memory-region"
                          :class="['region-' + regionClass(region), region.granularity === 'modeled' ? 'region-modeled' : '']"
                          :style="regionStyle(region, img.layout)"
                          v-tooltip.top="regionTooltip(region)"
                          @click="selectedRegion = { imageIdx: imgIdx, regionIdx: rIdx, region, image: img }"
                        >
                          <span class="region-label" v-if="regionWidth(region, img.layout) > 8">{{ region.name || '?' }}</span>
                        </div>
                      </div>
                      <!-- Address labels -->
                      <div class="memory-map-labels flex justify-content-between text-xs text-500 mt-1">
                        <span>{{ img.layout.address_space_start_hex }}</span>
                        <span>{{ img.layout.address_space_end_hex }}</span>
                      </div>
                    </div>

                    <!-- Region details -->
                    <div class="mt-3">
                      <div class="text-700 font-medium mb-2">Memory Regions</div>
                      <DataTable
                        :value="img.layout.regions || []"
                        responsiveLayout="scroll"
                        class="p-datatable-sm"
                        :rows="10"
                        :paginator="(img.layout.regions || []).length > 10"
                        selectionMode="single"
                        :selection="selectedRegion && selectedRegion.imageIdx === imgIdx ? [selectedRegion.region] : []"
                        @row-select="onRegionSelect($event, imgIdx, img)"
                      >
                        <Column field="vaddr_hex" header="Base Address">
                          <template #body="slotProps">
                            <code class="text-sm">{{ slotProps.data.vaddr_hex }}</code>
                          </template>
                        </Column>
                        <Column field="name" header="Type">
                          <template #body="slotProps">
                            <Tag :value="slotProps.data.name || '-'" :severity="regionSeverity(slotProps.data)" />
                          </template>
                        </Column>
                        <Column header="Detail">
                          <template #body="slotProps">
                            <Tag
                              v-if="slotProps.data.granularity === 'modeled'"
                              value="modeled"
                              severity="warning"
                              class="text-xs"
                              v-tooltip.top="'Inferred from chipset knowledge, not directly from firmware headers'"
                            />
                            <Tag
                              v-else-if="slotProps.data.granularity === 'exact'"
                              value="exact"
                              severity="success"
                              class="text-xs"
                            />
                            <span v-else class="text-xs text-500">coarse</span>
                          </template>
                        </Column>
                        <Column field="memsz" header="Size">
                          <template #body="slotProps">
                            <span class="text-sm">{{ formatSize(slotProps.data.memsz) }}</span>
                          </template>
                        </Column>
                        <Column header="End Address">
                          <template #body="slotProps">
                            <code class="text-sm">{{ regionEndAddr(slotProps.data) }}</code>
                          </template>
                        </Column>
                        <Column header="Permissions">
                          <template #body="slotProps">
                            <span class="text-sm" :class="permClass(slotProps.data)">
                              {{ permString(slotProps.data.flags) }}
                            </span>
                          </template>
                        </Column>
                      </DataTable>
                    </div>

                    <!-- Selected region detail -->
                    <div v-if="selectedRegion && selectedRegion.imageIdx === imgIdx" class="mt-3">
                      <Card class="p-3 region-detail-card">
                        <template #title>
                          <div class="flex align-items-center gap-2 flex-wrap">
                            <span class="text-sm font-semibold">
                              Region Detail: {{ selectedRegion.region.vaddr_hex }}
                            </span>
                            <Tag
                              v-if="selectedRegion.region.granularity"
                              :value="selectedRegion.region.granularity"
                              :severity="selectedRegion.region.granularity === 'modeled' ? 'warning' : 'info'"
                              class="text-xs"
                            />
                          </div>
                        </template>
                        <template #content>
                          <div class="grid text-sm">
                            <div class="col-6 md:col-3"><strong>File Offset:</strong> <code>{{ formatHex(selectedRegion.region.offset) }}</code></div>
                            <div class="col-6 md:col-3"><strong>File Size:</strong> {{ formatSize(selectedRegion.region.filesz) }}</div>
                            <div class="col-6 md:col-3"><strong>Memory Size:</strong> {{ formatSize(selectedRegion.region.memsz) }}</div>
                            <div class="col-6 md:col-3"><strong>BSS:</strong> {{ formatSize(Math.max(0, selectedRegion.region.memsz - selectedRegion.region.filesz)) }}</div>
                            <div v-if="selectedRegion.image.base_source" class="col-12 mt-2">
                              <strong>Base Source:</strong>
                              <code class="ml-1 text-xs">{{ selectedRegion.image.base_source }}</code>
                            </div>
                            <div v-if="selectedRegion.region.granularity === 'modeled' && selectedRegion.region.source" class="col-12 mt-1">
                              <strong>Model Source:</strong>
                              <code class="ml-1 text-xs">{{ selectedRegion.region.source }}</code>
                            </div>
                          </div>
                        </template>
                      </Card>
                    </div>
                  </template>
                </Card>
              </div>

              <!-- Fallback: region table only if no ELF layout but have chipset info -->
              <div v-if="layoutImages.length === 0 && layoutPayload.chipset" class="col-12">
                <Card class="detail-card">
                  <template #title>Chipset Info</template>
                  <template #content>
                    <div class="text-sm">Chipset: <Tag :value="layoutPayload.chipset" severity="info" /></div>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>
        </TabView>
      </div>
    </div>
  </div>

  <PipelineBuilderDialog
    v-model:visible="builderVisible"
    mode="single"
    :api-base="apiBase"
    :selected-network="selectedNetwork"
    @execute="onBuilderExecute"
    @cancel="builderVisible = false"
  />
</template>

<script>
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import PipelineBuilderDialog from '@/components/PipelineBuilderDialog.vue';
import { resolveMatteroverwatchApiBase } from '@/utils/matteroverwatchApi';

const ZCL_TYPE_NAME = {
  0x08: 'data8',
  0x09: 'data16',
  0x0A: 'data24',
  0x0B: 'data32',
  0x10: 'bool',
  0x18: 'bitmap8',
  0x19: 'bitmap16',
  0x1A: 'bitmap24',
  0x1B: 'bitmap32',
  0x1F: 'bitmap64',
  0x20: 'uint8',
  0x21: 'uint16',
  0x22: 'uint24',
  0x23: 'uint32',
  0x27: 'uint64',
  0x28: 'int8',
  0x29: 'int16',
  0x2A: 'int24',
  0x2B: 'int32',
  0x2F: 'int64',
  0x30: 'enum8',
  0x31: 'enum16',
  0x38: 'float-semi',
  0x39: 'float-single',
  0x3A: 'float-double',
  0x41: 'octstr',
  0x42: 'string',
  0x43: 'long-octstr',
  0x44: 'long-string',
  0x48: 'array',
  0x4C: 'struct',
  0xE0: 'time-of-day',
  0xE1: 'date',
  0xE2: 'utc',
  0xE8: 'cluster-id',
  0xE9: 'attribute-id',
  0xEA: 'bacnet-oid',
  0xF0: 'ieee-address',
  0xF1: 'security-key'
};
const GLOBAL_ATTRIBUTE_IDS = new Set(['0xFFF8', '0xFFF9', '0xFFFA', '0xFFFB', '0xFFFC', '0xFFFD', '0xFFFE', '0xFFFF']);

export default {
  name: 'FirmwareDetail',
  components: {
    VueJsonPretty,
    PipelineBuilderDialog
  },
  data() {
    const { requestBase } = resolveMatteroverwatchApiBase();
    return {
      apiBase: requestBase,
      loading: false,
      enqueueLoading: false,
      builderVisible: false,
      error: null,
      statusNote: null,
      detail: {
        firmware_sha256: '',
        is_downloaded: false,
        duplicate_group_size: 0,
        analysis_latest_status: 'none',
        analysis_latest_at: null,
        attempt_count: 0,
        aliases: [],
        latest_result: null,
        jobs: { pending: [], running: [], done: [], failed: [] }
      },
      jobsPayload: { jobs: { pending: [], running: [], done: [], failed: [] }, attempts: [] },
      modulesPayload: { modules: [], run_id: null },
      layoutPayload: { layout_available: false, images: [], reason: null, chipset: null },
      layoutLoaded: false,
      layoutError: null,
      selectedRegion: null,
      activeTabIndex: 0,
      jobsLoaded: false,
      modulesLoaded: false
    };
  },
  computed: {
    selectedNetwork() {
      return this.normalizeNetwork(
        this.$store?.state?.network?.selectedNetwork || this.$store?.state?.network?.defaultNetwork || 'testnet'
      );
    },
    firmwareSha256() {
      return String(this.$route.params.sha256 || '').toLowerCase();
    },
    latestMatterHeader() {
      const summary = this.detail?.latest_result?.summary_json;
      if (!summary || typeof summary !== 'object') return {};
      const matter = summary.matter_ota;
      if (!matter || typeof matter !== 'object') return {};
      const header = matter.header;
      return header && typeof header === 'object' ? header : {};
    },
    overviewKpis() {
      return [
        { label: 'Duplicate Records', value: this.detail.duplicate_group_size || 0, icon: 'pi-clone', iconColor: 'text-blue-500', iconBg: 'bg-blue-100' },
        { label: 'Attempts', value: this.detail.attempt_count || 0, icon: 'pi-history', iconColor: 'text-purple-500', iconBg: 'bg-purple-100' },
        { label: 'Latest Status', value: this.analysisLabel(this.detail.analysis_latest_status), icon: 'pi-info-circle', iconColor: 'text-orange-500', iconBg: 'bg-orange-100' },
        { label: 'Downloaded', value: this.detail.is_downloaded ? 'Yes' : 'No', icon: 'pi-download', iconColor: 'text-green-500', iconBg: 'bg-green-100' }
      ];
    },
    jobRows() {
      const j = this.jobsPayload.jobs || {};
      const out = [];
      for (const key of ['running', 'pending', 'failed', 'done']) {
        const rows = Array.isArray(j[key]) ? j[key] : [];
        for (const row of rows) out.push({ ...row, status: key });
      }
      return out.sort((a, b) => String(b.finished_at || b.started_at || b.requested_at || '').localeCompare(String(a.finished_at || a.started_at || a.requested_at || '')));
    },
    modules() {
      const rows = Array.isArray(this.modulesPayload.modules) ? this.modulesPayload.modules : [];
      return rows.filter((m) => String(m?.module_id || '') !== 'matter_capabilities');
    },
    capabilityModule() {
      const rows = Array.isArray(this.modulesPayload.modules) ? this.modulesPayload.modules : [];
      return rows.find((m) => String(m?.module_id || '') === 'matter_capabilities') || null;
    },
    capabilityDetails() {
      const details = this.capabilityModule?.details || {};
      return details && typeof details === 'object' ? details : {};
    },
    capabilityMissingReason() {
      const reason = this.capabilityDetails?._artifact_reason;
      return typeof reason === 'string' ? reason : '';
    },
    capabilityMissingReasonLabel() {
      if (this.capabilityMissingReason === 'run_artifacts_not_found') {
        return 'Capability artifacts for this historical run are unavailable on this host. Re-run Analyze to regenerate capability data.';
      }
      if (this.capabilityMissingReason === 'capability_artifact_missing') {
        return 'Capability stage artifacts are missing for this run. Re-run Analyze to regenerate capability data.';
      }
      return '';
    },
    capabilityEndpoints() {
      return Array.isArray(this.capabilityDetails?.endpoints) ? this.capabilityDetails.endpoints : [];
    },
    capabilityClusters() {
      return Array.isArray(this.capabilityDetails?.clusters) ? this.capabilityDetails.clusters : [];
    },
    capabilityDefaultsCount() {
      const n = Number(this.capabilityDetails?.defaults_count);
      if (Number.isFinite(n) && n >= 0) return n;
      const map = this.capabilityDetails?.attribute_defaults;
      return map && typeof map === 'object' ? Object.keys(map).length : 0;
    },
    capabilityAttributeRows() {
      const attrs = Array.isArray(this.capabilityDetails?.attributes) ? this.capabilityDetails.attributes : [];
      const defaults = this.capabilityDetails?.attribute_defaults;
      const defaultsMap = defaults && typeof defaults === 'object' ? defaults : {};
      return attrs.map((entry) => {
        const text = String(entry || '');
        const [cluster = '', attribute = ''] = text.split('/');
        const meta = defaultsMap[text] && typeof defaultsMap[text] === 'object' ? defaultsMap[text] : {};
        const hasDefault = Object.prototype.hasOwnProperty.call(meta, 'default_raw_u32');
        return {
          cluster,
          attribute,
          default_raw_u32: meta.default_raw_u32,
          has_default: hasDefault,
          length: meta.length,
          type_u8: meta.type_u8
        };
      });
    },
    capabilityGlobalAttributeRows() {
      const defaults = this.capabilityDetails?.attribute_defaults;
      const defaultsMap = defaults && typeof defaults === 'object' ? defaults : {};
      const rows = [];
      for (const key of Object.keys(defaultsMap)) {
        const [cluster = '', attribute = ''] = String(key).split('/');
        const canonicalAttribute = this.canonicalAttributeId(attribute);
        if (!GLOBAL_ATTRIBUTE_IDS.has(canonicalAttribute)) continue;
        const meta = defaultsMap[key] && typeof defaultsMap[key] === 'object' ? defaultsMap[key] : {};
        rows.push({
          cluster,
          attribute,
          default_raw_u32: meta.default_raw_u32,
          has_default: Object.prototype.hasOwnProperty.call(meta, 'default_raw_u32'),
          length: meta.length,
          type_u8: meta.type_u8
        });
      }
      rows.sort((a, b) => {
        const clusterA = this.parseHexOrDec(a.cluster);
        const clusterB = this.parseHexOrDec(b.cluster);
        if (clusterA !== null && clusterB !== null && clusterA !== clusterB) return clusterA - clusterB;
        const attrA = this.parseHexOrDec(a.attribute);
        const attrB = this.parseHexOrDec(b.attribute);
        if (attrA !== null && attrB !== null && attrA !== attrB) return attrA - attrB;
        const ca = String(a.cluster || '');
        const cb = String(b.cluster || '');
        if (ca !== cb) return ca.localeCompare(cb);
        return String(a.attribute || '').localeCompare(String(b.attribute || ''));
      });
      return rows;
    },
    layoutImages() {
      return Array.isArray(this.layoutPayload.images) ? this.layoutPayload.images : [];
    },
    layoutKpis() {
      const totalRegions = this.layoutPayload.total_regions || 0;
      const imageCount = this.layoutPayload.image_count || 0;
      const firstImg = this.layoutImages[0];
      const entryPoint = firstImg?.layout?.entry_point_hex || 'N/A';
      const machine = firstImg?.layout?.machine || 'N/A';
      const granularity = this.layoutPayload.granularity || 'coarse';
      return [
        { label: 'Images', value: imageCount, icon: 'pi-images', iconColor: 'text-blue-500', iconBg: 'bg-blue-100' },
        { label: 'Regions', value: totalRegions, icon: 'pi-th-large', iconColor: 'text-purple-500', iconBg: 'bg-purple-100' },
        { label: 'Entry Point', value: entryPoint, icon: 'pi-map-marker', iconColor: 'text-orange-500', iconBg: 'bg-orange-100' },
        { label: 'Architecture', value: machine, icon: 'pi-cog', iconColor: 'text-green-500', iconBg: 'bg-green-100' },
        { label: 'Granularity', value: granularity, icon: 'pi-chart-bar', iconColor: 'text-teal-500', iconBg: 'bg-teal-100' }
      ];
    }
  },
  methods: {
    normalizeNetwork(value) {
      const key = String(value || '').trim().toLowerCase();
      return key === 'mainnet' || key === 'testnet' ? key : 'testnet';
    },
    parseHexOrDec(raw) {
      const text = String(raw ?? '').trim();
      if (!text) return null;
      if (/^0[xX][0-9a-fA-F]+$/.test(text)) return Number.parseInt(text.slice(2), 16);
      if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
      if (/^[0-9a-fA-F]+$/.test(text)) return Number.parseInt(text, 16);
      return null;
    },
    canonicalAttributeId(raw) {
      const parsed = this.parseHexOrDec(raw);
      if (parsed === null || !Number.isFinite(parsed) || parsed < 0) return String(raw ?? '').trim();
      return `0x${parsed.toString(16).toUpperCase().padStart(4, '0')}`;
    },
    async refreshAll() {
      await this.refreshDetail();
      if (this.activeTabIndex === 1 || this.activeTabIndex === 3) await this.refreshModules();
      if (this.activeTabIndex === 2) await this.refreshJobs();
      if (this.activeTabIndex === 4) await this.refreshLayout();
    },
    async refreshDetail() {
      this.loading = true;
      this.error = null;
      this.statusNote = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.loading = false;
        return;
      }
      try {
        const query = new URLSearchParams({ network: this.selectedNetwork });
        const detailResp = await fetch(`${this.apiBase}/api/v1/firmware/${this.firmwareSha256}?${query.toString()}`);
        if (!detailResp.ok) throw new Error(`Detail request failed (${detailResp.status})`);
        this.detail = await detailResp.json();
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load firmware detail';
      } finally {
        this.loading = false;
      }
    },
    async refreshJobs() {
      this.loading = true;
      this.error = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.loading = false;
        return;
      }
      try {
        const query = new URLSearchParams({ network: this.selectedNetwork });
        const jobsResp = await fetch(`${this.apiBase}/api/v1/firmware/${this.firmwareSha256}/jobs?${query.toString()}`);
        if (!jobsResp.ok) throw new Error(`Jobs request failed (${jobsResp.status})`);
        this.jobsPayload = await jobsResp.json();
        this.jobsLoaded = true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load job history';
      } finally {
        this.loading = false;
      }
    },
    async refreshModules() {
      this.loading = true;
      this.error = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.loading = false;
        return;
      }
      try {
        const query = new URLSearchParams({ network: this.selectedNetwork });
        const modulesResp = await fetch(`${this.apiBase}/api/v1/firmware/${this.firmwareSha256}/modules?${query.toString()}`);
        if (!modulesResp.ok) throw new Error(`Modules request failed (${modulesResp.status})`);
        this.modulesPayload = await modulesResp.json();
        this.modulesLoaded = true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load module outputs';
      } finally {
        this.loading = false;
      }
    },
    async refreshLayout() {
      this.loading = true;
      this.layoutError = null;
      if (!this.apiBase) {
        this.layoutError = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.loading = false;
        return;
      }
      try {
        const query = new URLSearchParams({ network: this.selectedNetwork });
        const layoutResp = await fetch(`${this.apiBase}/api/v1/firmware/${this.firmwareSha256}/layout?${query.toString()}`);
        if (!layoutResp.ok) {
          if (layoutResp.status === 404) {
            this.layoutPayload = { layout_available: false, images: [], reason: 'not_found', chipset: null };
          } else {
            throw new Error(`Layout request failed (${layoutResp.status})`);
          }
        } else {
          this.layoutPayload = await layoutResp.json();
        }
        this.layoutLoaded = true;
      } catch (err) {
        this.layoutError = err instanceof Error ? err.message : 'Failed to load firmware layout';
      } finally {
        this.loading = false;
      }
    },
    async onTabChange(event) {
      const idx = Number(event?.index ?? this.activeTabIndex);
      this.activeTabIndex = Number.isFinite(idx) ? idx : 0;
      if (this.activeTabIndex === 1 && !this.modulesLoaded) await this.refreshModules();
      if (this.activeTabIndex === 2 && !this.jobsLoaded) await this.refreshJobs();
      if (this.activeTabIndex === 3 && !this.modulesLoaded) await this.refreshModules();
      if (this.activeTabIndex === 4 && !this.layoutLoaded) await this.refreshLayout();
    },
    enqueueAnalyze() {
      this.builderVisible = true;
    },
    async onBuilderExecute(payload) {
      this.enqueueLoading = true;
      this.error = null;
      this.statusNote = null;
      if (!this.apiBase) {
        this.error = 'Missing MatterOverwatch API base. Set VITE_APP_MATTEROVERWATCH_API_BASE before starting dcl-ui.';
        this.enqueueLoading = false;
        return;
      }
      try {
        const body = {
          firmware_sha256: this.firmwareSha256,
          requested_from: 'firmware_detail',
          network: this.selectedNetwork,
          analysis_profile: payload.analysis_profile,
          force: payload.force,
        };
        if (payload.phase_ii_section_filter && payload.phase_ii_section_filter.length) {
          body.phase_ii_section_filter = payload.phase_ii_section_filter;
        }
        const response = await fetch(`${this.apiBase}/api/v1/jobs/analyze-firmware`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          throw new Error(`Analyze enqueue failed (${response.status})`);
        }
        this.builderVisible = false;
        await this.refreshAll();
        this.statusNote = `Analysis job queued for ${this.shortSha(this.firmwareSha256)}.`;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to queue analysis job';
      } finally {
        this.enqueueLoading = false;
      }
    },
    goBack() {
      this.$router.push('/firmware-security/available-firmware');
    },
    formatTimestamp(value) {
      if (!value) return '';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    analysisLabel(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'done' || key === 'pass') return 'Done';
      if (key === 'failed' || key === 'violation') return 'Failed';
      if (key === 'running') return 'Running';
      if (key === 'pending') return 'Pending';
      return 'None';
    },
    analysisSeverity(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'done' || key === 'pass') return 'success';
      if (key === 'failed' || key === 'violation') return 'danger';
      if (key === 'running') return 'info';
      if (key === 'pending') return 'warning';
      return 'secondary';
    },
    shortSha(value) {
      const text = String(value || '');
      if (text.length <= 16) return text || '-';
      return `${text.slice(0, 8)}...${text.slice(-8)}`;
    },
    shortId(value) {
      const text = String(value || '');
      return text ? text.slice(0, 8) : '-';
    },
    stringifyValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    },
    prettyJson(value) {
      try {
        return JSON.stringify(value || {}, null, 2);
      } catch {
        return '{}';
      }
    },
    displayValue(value) {
      if (value === null || value === undefined || value === '') return '-';
      return value;
    },
    sdkDisplayValue(value) {
      if (value === null || value === undefined || String(value).trim() === '') return 'N/A';
      return String(value);
    },
    entropyDisplay(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'N/A';
      return `${n.toFixed(6)} bits/byte`;
    },
    capabilityDefaultRaw(row) {
      if (!row || row.has_default !== true) return 'N/A';
      const typeCode = Number(row.type_u8);
      // Non-scalar ZCL/Matter attribute encodings store handles/pointers,
      // not inline scalar defaults.
      if ([0x41, 0x42, 0x43, 0x44, 0x48, 0x4c].includes(typeCode)) {
        return 'N/A (non-scalar)';
      }
      return String(row.default_raw_u32);
    },
    capabilityTypeName(row) {
      const typeCode = Number(row?.type_u8);
      if (!Number.isFinite(typeCode)) return 'N/A';
      const name = ZCL_TYPE_NAME[typeCode];
      if (name) return name;
      return `unknown(0x${typeCode.toString(16).toUpperCase().padStart(2, '0')})`;
    },
    // --- Layout helpers ---
    regionClass(region) {
      if (region?.flags?.x && !region?.flags?.w) return 'code';
      if (region?.flags?.w && !region?.flags?.x) return 'data';
      if (region?.flags?.r && !region?.flags?.w && !region?.flags?.x) return 'rodata';
      return 'mixed';
    },
    regionWidth(region, layout) {
      if (!layout || !layout.address_space_span) return 0;
      const sz = Math.max(region.memsz || 0, region.filesz || 0);
      return Math.max(1, (sz / layout.address_space_span) * 100);
    },
    regionStyle(region, layout) {
      return { width: this.regionWidth(region, layout) + '%' };
    },
    regionTooltip(region) {
      const flags = [];
      if (region?.flags?.r) flags.push('R');
      if (region?.flags?.w) flags.push('W');
      if (region?.flags?.x) flags.push('X');
      return `${region.vaddr_hex} — ${this.formatSize(region.memsz)} [${flags.join('')}] ${region.name || ''}`;
    },
    formatSize(bytes) {
      if (bytes === null || bytes === undefined) return '-';
      const n = Number(bytes);
      if (!Number.isFinite(n)) return '-';
      if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MiB`;
      if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
      return `${n} B`;
    },
    formatHex(value) {
      if (value === null || value === undefined) return '-';
      return `0x${Number(value).toString(16).toUpperCase()}`;
    },
    regionEndAddr(region) {
      const base = Number(region?.vaddr) || 0;
      const sz = Math.max(region?.memsz || 0, region?.filesz || 0);
      const end = base + sz;
      return `0x${end.toString(16).toUpperCase().padStart(8, '0')}`;
    },
    permString(flags) {
      if (!flags) return '-';
      const p = [];
      if (flags.r) p.push('R');
      if (flags.w) p.push('W');
      if (flags.x) p.push('X');
      return p.join('') || '-';
    },
    permClass(region) {
      if (region?.flags?.w && region?.flags?.x) return 'text-orange-500 font-bold';
      if (region?.flags?.x) return 'text-blue-500';
      if (region?.flags?.w) return 'text-green-600';
      return 'text-500';
    },
    regionSeverity(region) {
      if (region?.flags?.x && !region?.flags?.w) return 'info';
      if (region?.flags?.w && !region?.flags?.x) return 'success';
      if (region?.flags?.r && !region?.flags?.w && !region?.flags?.x) return 'warning';
      return 'secondary';
    },
    granularitySeverity(value) {
      if (value === 'fine') return 'success';
      if (value === 'coarse') return 'info';
      if (value === 'modeled') return 'warning';
      return 'secondary';
    },
    onRegionSelect(event, imgIdx, img) {
      this.selectedRegion = {
        imageIdx: imgIdx,
        regionIdx: event.index,
        region: event.data,
        image: img
      };
    }
  },
  watch: {
    selectedNetwork(next, prev) {
      if (next === prev) return;
      this.modulesLoaded = false;
      this.jobsLoaded = false;
      this.layoutLoaded = false;
      this.layoutError = null;
      this.selectedRegion = null;
      this.modulesPayload = { modules: [] };
      this.jobsPayload = { jobs: { pending: [], running: [], done: [], failed: [] }, attempts: [] };
      this.layoutPayload = { layout_available: false, images: [], reason: null, chipset: null };
      this.refreshAll();
    }
  },
  mounted() {
    this.refreshAll();
  }
};
</script>

<style scoped>
.firmware-detail-page .detail-header-card,
.firmware-detail-page .detail-card {
  border-radius: 12px;
}

.firmware-detail-page .stat-card {
  min-height: 78px;
  padding: 0.7rem 0.85rem;
}

.firmware-detail-page .stat-label-text {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.firmware-detail-page .module-summary {
  display: grid;
  gap: 0.45rem;
}

.firmware-detail-page .summary-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.firmware-detail-page .module-json {
  margin: 0;
  padding: 0.65rem;
  max-height: 240px;
  overflow: auto;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.78rem;
}

.firmware-detail-page .outcome-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  column-gap: 1.5rem;
  row-gap: 0.65rem;
}

@media (max-width: 768px) {
  .firmware-detail-page .outcome-grid {
    grid-template-columns: 1fr;
  }
}

.firmware-detail-page .outcome-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px dashed #e5e7eb;
  padding-bottom: 0.35rem;
}

.firmware-detail-page .outcome-label {
  color: #6b7280;
  font-weight: 600;
  font-size: 0.85rem;
  padding-right: 1rem;
  white-space: nowrap;
}

.firmware-detail-page .outcome-value {
  color: #111827;
  font-size: 0.9rem;
  text-align: right;
  word-break: break-word;
}

/* ── Memory map visualization ── */
.firmware-detail-page .memory-map-container {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1.25rem 1rem 0.75rem;
}

.firmware-detail-page .memory-map-bar {
  display: flex;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  background: #e9ecef;
  border: 1px solid #ced4da;
  position: relative;
}

.firmware-detail-page .memory-region {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  position: relative;
  min-width: 0;
}

.firmware-detail-page .memory-region:hover {
  filter: brightness(0.92);
  transform: scaleY(1.08);
  z-index: 2;
}

.firmware-detail-page .region-code {
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
}

.firmware-detail-page .region-data {
  background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
  color: #fff;
}

.firmware-detail-page .region-rodata {
  background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
}

.firmware-detail-page .region-mixed {
  background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%);
  color: #fff;
}

.firmware-detail-page .region-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 2px;
}

.firmware-detail-page .memory-map-labels {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.7rem;
}

.firmware-detail-page .region-detail-card {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
}

/* Modeled region styling — dashed overlay + orange tint */
.firmware-detail-page .region-modeled {
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 3px,
    rgba(255, 255, 255, 0.3) 3px,
    rgba(255, 255, 255, 0.3) 6px
  );
  border: 2px dashed rgba(251, 146, 60, 0.7);
  box-sizing: border-box;
}

.firmware-detail-page .region-modeled .region-label {
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
</style>
