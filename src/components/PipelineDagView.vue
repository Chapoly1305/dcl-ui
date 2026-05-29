<template>
  <div class="pipeline-dag-view" ref="container">
    <VueFlow
      v-model="elements"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :fit-view-on-init="true"
      :min-zoom="0.2"
      :max-zoom="1.5"
      class="dag-flow"
      @node-click="onNodeClick"
      @pane-click="selectedNodeId = null"
    >
      <template #node-stage="{ data, id }">
        <div 
          class="dag-node-flat" 
          :class="[
            'dag-node-status-' + data.severity,
            { 'path-active': isPathActive(id) }
          ]"
        >
          <div class="dag-node-main">
            <i :class="[getStatusIcon(data.status), 'icon-' + data.severity]" class="dag-node-icon"></i>
            <span class="dag-node-label" :title="data.label">{{ data.label }}</span>
          </div>
          <div v-if="data.verdict" class="dag-node-badge" :class="'badge-' + data.severity">
            {{ data.verdict }}
          </div>
        </div>
      </template>

      <Background :pattern-color="'#f6f8fa'" :gap="20" />
      <Controls position="bottom-right" :show-interactive="false" />
    </VueFlow>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import dagre from 'dagre';
import { stageSeverity, pipelineSummaryRef } from '@/utils/pipelineDisplay';

const props = defineProps({
  dag: {
    type: Object,
    default: () => ({ tiers: [], edges: [], metadata: {} })
  },
  phaseIiSections: {
    type: Object,
    default: () => ({})
  },
  // Raw Phase I backend stages (keyed by name) so ctx_stage / synthetic nodes
  // in the unified graph can show their real status, not just pending.
  backendStages: {
    type: Array,
    default: () => []
  }
});

const { fitView } = useVueFlow();
const container = ref(null);
const elements = ref([]);
const selectedNodeId = ref(null);
const activePathIds = ref(new Set());

const onNodeClick = ({ node }) => {
  selectedNodeId.value = node.id;
  updateActivePath(node.id);
};

const isPathActive = (id) => {
  return activePathIds.value.has(id);
};

const updateActivePath = (targetId) => {
  const active = new Set();
  active.add(targetId);

  // Helper to find all edges
  const edges = elements.value.filter(e => e.source && e.target);
  
  // Upstream
  let search = [targetId];
  while (search.length > 0) {
    const next = [];
    const current = search.pop();
    edges.forEach(e => {
      if (e.target === current && !active.has(e.source)) {
        active.add(e.source);
        active.add(e.id);
        next.push(e.source);
      }
    });
    search = next;
  }

  // Downstream
  search = [targetId];
  while (search.length > 0) {
    const next = [];
    const current = search.pop();
    edges.forEach(e => {
      if (e.source === current && !active.has(e.target)) {
        active.add(e.target);
        active.add(e.id);
        next.push(e.target);
      }
    });
    search = next;
  }

  activePathIds.value = active;
  
  // Update edge styles in elements
  elements.value = elements.value.map(el => {
    if (el.source && el.target) {
      const isActive = active.has(el.id);
      return {
        ...el,
        // Highlight the selected node's dependency chain in blue; leave every
        // other edge in normal light grey (no fading) so nothing looks hidden.
        style: {
          stroke: isActive ? '#0969da' : '#d0d7de',
          strokeWidth: isActive ? 2.5 : 1.5,
          opacity: 1
        },
        animated: isActive
      };
    }
    return el;
  });
};

watch(selectedNodeId, (newId) => {
  if (!newId) {
    activePathIds.value = new Set();
    elements.value = elements.value.map(el => {
      if (el.source && el.target) {
        return {
          ...el,
          style: { stroke: '#d0d7de', strokeWidth: 1.5, opacity: 1 },
          animated: false
        };
      }
      return el;
    });
  }
});

const getStatusIcon = (status) => {
  const m = {
    success: 'pi pi-check-circle',
    failed: 'pi pi-times-circle',
    skipped: 'pi pi-minus-circle',
    needs_review: 'pi pi-exclamation-triangle',
    pending: 'pi pi-spin pi-spinner',
    running: 'pi pi-spin pi-spinner'
  };
  return m[status] || 'pi pi-circle';
};

const shortVerdict = (status) => {
  const m = { success: '', failed: 'ISSUE', skipped: 'SKIP', needs_review: 'REVIEW', pending: '' };
  return m[status] || '';
};

const NODE_W = 210;
const NODE_H = 40;

// Resolve the graph source. Prefer the registry-derived pipeline summary (the
// whole grouped pipeline — single source of truth via /api/v1/pipeline/
// components), and fall back to the Phase-II `dag` prop for older reports that
// only carry the section tiers.
const resolveSource = () => {
  const summary = pipelineSummaryRef.value;
  if (summary && Array.isArray(summary.components) && summary.components.length) {
    const idToLabel = {};
    const nodeIds = [];
    for (const c of summary.components) {
      if (c.visible === false) continue;
      idToLabel[c.id] = c.label || c.id;
      nodeIds.push(c.id);
    }
    return { nodeIds, idToLabel, rawEdges: summary.edges || [] };
  }
  const tiers = (props.dag && props.dag.tiers) || [];
  const idToLabel = {};
  const nodeIds = [];
  tiers.forEach((tier) => (tier.sections || []).forEach((sec) => {
    if (idToLabel[sec.id] !== undefined) return;
    idToLabel[sec.id] = sec.name || sec.id;
    nodeIds.push(sec.id);
  }));
  return { nodeIds, idToLabel, rawEdges: (props.dag && props.dag.edges) || [] };
};

// Status for a node: Phase II section result wins, else the matching Phase I
// backend stage (ctx_stage / synthetic), else pending.
const statusOf = (id) => {
  const r = props.phaseIiSections[id];
  if (r && r.status) return r.status;
  const b = (props.backendStages || []).find((s) => s && s.name === id);
  return (b && b.status) ? b.status : 'pending';
};

const layoutGraph = () => {
  const { nodeIds, idToLabel, rawEdges } = resolveSource();
  if (nodeIds.length === 0) return [];
  const known = new Set(nodeIds);

  // Edges — keep only those between known nodes, de-duped, no self-loops.
  const seen = new Set();
  const edges = [];
  rawEdges.forEach((e) => {
    if (!Array.isArray(e) || e.length !== 2) return;
    const [u, v] = e;
    if (u === v || !known.has(u) || !known.has(v)) return;
    const key = `${u}->${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([u, v]);
  });

  // 3. Transitive reduction — drop A->C when A reaches C through another child.
  const adj = {};
  edges.forEach(([u, v]) => {
    if (!adj[u]) adj[u] = [];
    adj[u].push(v);
  });
  const reaches = (start, target) => {
    const stack = [...(adj[start] || [])];
    const visited = new Set();
    while (stack.length) {
      const n = stack.pop();
      if (n === target) return true;
      if (visited.has(n)) continue;
      visited.add(n);
      (adj[n] || []).forEach((c) => stack.push(c));
    }
    return false;
  };
  const reduced = edges.filter(
    ([u, v]) => !(adj[u] || []).some((mid) => mid !== v && reaches(mid, v))
  );

  // 4. Dagre left-to-right layered layout.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 22, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  nodeIds.forEach((id) => g.setNode(id, { width: NODE_W, height: NODE_H }));
  reduced.forEach(([u, v]) => g.setEdge(u, v));
  dagre.layout(g);

  const flowNodes = nodeIds.map((id) => {
    const n = g.node(id);
    const status = statusOf(id);
    return {
      id,
      type: 'stage',
      data: {
        label: idToLabel[id],
        status,
        severity: stageSeverity(status),
        verdict: shortVerdict(status),
      },
      position: { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 },
    };
  });

  const flowEdges = reduced.map(([u, v]) => ({
    id: `e-${u}-${v}`,
    source: u,
    target: v,
    style: { stroke: '#d0d7de', strokeWidth: 1.5 },
  }));

  return [...flowNodes, ...flowEdges];
};

// Fit the whole graph into view with a little padding. Deferred so VueFlow has
// measured node sizes first. Robust to the DAG view living inside a tab that is
// hidden (zero-size) on first render — the ResizeObserver re-fits once it gets
// real dimensions.
const refit = () => {
  nextTick(() => setTimeout(() => fitView({ padding: 0.12 }), 60));
};

let resizeObserver = null;

watch(() => [props.dag, props.phaseIiSections, props.backendStages, pipelineSummaryRef.value], () => {
  elements.value = layoutGraph();
  refit();
}, { deep: true, immediate: true });

onMounted(() => {
  refit();
  if (container.value && typeof ResizeObserver !== 'undefined') {
    let prevW = 0;
    resizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 0;
      // Only re-fit when the pane actually (re)gains width — avoids a fit loop.
      if (w > 0 && Math.abs(w - prevW) > 1) {
        prevW = w;
        refit();
      }
    });
    resizeObserver.observe(container.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';

.pipeline-dag-view {
  width: 100%;
  height: 68vh;
  min-height: 540px;
  max-height: 820px;
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow: hidden;
}

.dag-flow {
  width: 100%;
  height: 100%;
}

.dag-node-flat {
  padding: 8px 12px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #d0d7de;
  min-width: 180px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: all 0.2s ease;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  cursor: pointer;
  
  /* Text Sharpness Optimizations */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  backface-visibility: hidden;
  transform: translateZ(0);
}

.dag-node-flat:hover {
  background-color: #f6f8fa;
  border-color: #8c959f;
}

/* Path Highlighting Styles — selecting a node traces its dependency chain in
   blue. Other nodes stay fully visible (no dimming), so nothing looks hidden. */
.dag-node-flat.path-active {
  border-color: #0969da;
  box-shadow: 0 0 0 1px #0969da;
  z-index: 10;
}

.dag-node-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.dag-node-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.dag-node-label {
  font-size: 12px;
  font-weight: 500;
  color: #24292f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dag-node-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

/* Status Colors */
.icon-success { color: #2da44e; }
.icon-danger { color: #cf222e; }
.icon-info { color: #0969da; }
.icon-warning { color: #9a6700; }
.icon-secondary { color: #57606a; }

.badge-success { background-color: #dafbe1; color: #1a7f37; border: 1px solid #2da44e66; }
.badge-danger { background-color: #ffebe9; color: #d1242f; border: 1px solid #cf222e66; }
.badge-info { background-color: #ddf4ff; color: #0550ae; border: 1px solid #0969da66; }
.badge-warning { background-color: #fff8c5; color: #9a6700; border: 1px solid #bf870066; }
.badge-secondary { background-color: #f6f8fa; color: #57606a; border: 1px solid #d0d7de; }

.dag-node-status-success { border-left: 4px solid #2da44e; }
.dag-node-status-danger { border-left: 4px solid #cf222e; }
.dag-node-status-info { border-left: 4px solid #0969da; }
.dag-node-status-warning { border-left: 4px solid #bf8700; }
.dag-node-status-secondary { border-left: 4px solid #d0d7de; }

.vue-flow__edge-path {
  stroke-width: 1.5;
  stroke: #d0d7de;
}

.vue-flow__controls {
  background-color: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  box-shadow: none;
}
</style>
