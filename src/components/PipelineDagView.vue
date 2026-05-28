<template>
  <div class="pipeline-dag-view" ref="container">
    <VueFlow
      v-model="elements"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :fit-view-on-init="true"
      class="dag-flow"
      :default-viewport="{ zoom: 0.85 }"
      @node-click="onNodeClick"
      @pane-click="selectedNodeId = null"
    >
      <template #node-stage="{ data, id }">
        <div 
          class="dag-node-flat" 
          :class="[
            'dag-node-status-' + data.severity,
            { 'path-active': isPathActive(id), 'path-dimmed': !!selectedNodeId && !isPathActive(id) }
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
import { ref, watch, onMounted } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import dagre from 'dagre';
import { DISPLAY_STAGES, stageSeverity } from '@/utils/pipelineDisplay';

const props = defineProps({
  dag: {
    type: Object,
    default: () => ({ tiers: [], edges: [], metadata: {} })
  },
  phaseIiSections: {
    type: Object,
    default: () => ({})
  }
});

const { fitView } = useVueFlow();
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
        style: { 
          stroke: isActive ? '#0969da' : (selectedNodeId.value ? '#d0d7de44' : '#d0d7de'), 
          strokeWidth: isActive ? 2.5 : 1.5,
          opacity: (selectedNodeId.value && !isActive) ? 0.3 : 1
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

// Simplified graph processing: Filter only visible nodes and reduce redundant edges
const layoutGraph = (dag) => {
  const rawEdges = dag.edges || [];
  
  // 1. Define nodes visible to the user
  const visibleIds = new Set();
  const idToMeta = {};
  
  DISPLAY_STAGES.forEach(ds => {
    ds.sections.forEach(sec => {
      visibleIds.add(sec.id);
      idToMeta[sec.id] = { label: sec.name, groupLabel: ds.label };
    });
  });
  
  // Add common starting points
  ['provenance', 'acquisition'].forEach(id => {
    visibleIds.add(id);
    idToMeta[id] = { label: id.charAt(0).toUpperCase() + id.slice(1), groupLabel: 'Input' };
  });

  // 2. Map reachability through hidden nodes
  const adj = {};
  rawEdges.forEach(([u, v]) => {
    if (!adj[u]) adj[u] = [];
    adj[u].push(v);
  });

  const finalEdges = new Set();
  const memo = {};
  const getVisibleDescendants = (u) => {
    if (memo[u]) return memo[u];
    const results = new Set();
    const children = adj[u] || [];
    for (const v of children) {
      if (visibleIds.has(v)) {
        results.add(v);
      } else {
        getVisibleDescendants(v).forEach(d => results.add(d));
      }
    }
    return memo[u] = results;
  };

  visibleIds.forEach(u => {
    getVisibleDescendants(u).forEach(v => {
      finalEdges.add(`${u}->${v}`);
    });
  });

  // 3. Transitive Reduction (remove redundant edges like A->C if A->B->C exists)
  const edgesArray = Array.from(finalEdges).map(e => e.split('->'));
  const visibleAdj = {};
  edgesArray.forEach(([u, v]) => {
    if (!visibleAdj[u]) visibleAdj[u] = [];
    visibleAdj[u].push(v);
  });

  const isReachableLongWay = (start, target, current, visited) => {
    if (current === target) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const children = visibleAdj[current] || [];
    for (const child of children) {
      if (isReachableLongWay(start, target, child, visited)) return true;
    }
    return false;
  };

  const reducedEdges = edgesArray.filter(([u, v]) => {
    const others = (visibleAdj[u] || []).filter(child => child !== v);
    for (const startNode of others) {
      if (isReachableLongWay(startNode, v, startNode, new Set())) return false;
    }
    return true;
  });

  // 4. Dagre Layout
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });
  g.setDefaultEdgeLabel(() => ({}));

  const flowNodes = [];
  visibleIds.forEach(id => {
    const meta = idToMeta[id];
    const result = props.phaseIiSections[id] || null;
    const status = result ? result.status : 'pending';
    const severity = stageSeverity(status);

    g.setNode(id, { width: 180, height: 44 });
    flowNodes.push({
      id,
      type: 'stage',
      data: {
        label: meta.label,
        status,
        severity,
        verdict: shortVerdict(status),
      },
      position: { x: 0, y: 0 }
    });
  });

  reducedEdges.forEach(([u, v]) => {
    g.setEdge(u, v);
  });

  dagre.layout(g);

  const positionedNodes = flowNodes.map(node => {
    const n = g.node(node.id);
    return {
      ...node,
      position: { x: n.x - 90, y: n.y - 22 }
    };
  });

  const flowEdges = reducedEdges.map(([u, v]) => ({
    id: `e-${u}-${v}`,
    source: u,
    target: v,
    style: { stroke: '#d0d7de', strokeWidth: 1.5 },
  }));

  return [...positionedNodes, ...flowEdges];
};

watch(() => [props.dag, props.phaseIiSections], () => {
  elements.value = layoutGraph(props.dag);
  setTimeout(() => fitView(), 50);
}, { deep: true, immediate: true });

onMounted(() => {
  setTimeout(() => fitView(), 100);
});
</script>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';

.pipeline-dag-view {
  width: 100%;
  height: 500px;
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

/* Path Highlighting Styles */
.dag-node-flat.path-active {
  border-color: #0969da;
  box-shadow: 0 0 0 1px #0969da;
  z-index: 10;
}

.dag-node-flat.path-dimmed {
  opacity: 0.3;
  filter: grayscale(0.5);
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
