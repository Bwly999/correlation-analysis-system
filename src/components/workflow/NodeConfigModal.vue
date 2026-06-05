<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import type { Edge } from "@vue-flow/core";
import { Loader2, Bug, HelpCircle, Square } from "lucide-vue-next";
import { useWorkflowStore } from "@/stores/workflowStore";
import { usePiAgentConfigStore } from "@/stores/piAgentConfigStore";
import { getNodeDefinition } from "@/nodes/registry";
import {
  createJsonResult,
  createTableCollectionResult,
  createTableResult,
  isPlainObject,
} from "@/nodes/result";
import type { WorkflowNode } from "@/utils/storage";
import { serializeNodeConfigForPersistence } from "@/utils/workflowConfig";

// Sub Components
import DataDisplayPanel from "./DataDisplayPanel.vue";
import DataAnalysisModal from "./DataAnalysisModal.vue";
import ConfigHeader from "./config/ConfigHeader.vue";
import ConfigFooter from "./config/ConfigFooter.vue";
import ConfigForm from "./config/ConfigForm.vue";
import RuntimeInputs from "./config/RuntimeInputs.vue";
import RuntimeSettingsPanel from "./config/RuntimeSettingsPanel.vue";
import NodeHelpPanel from "./help/NodeHelpPanel.vue";
import NodeDebugErrorCard from "./NodeDebugErrorCard.vue";
import NodeIcon from "./nodes/NodeIcon.vue";
import {
  getResultGroups,
  getResultRows,
  getResultSchemaFields,
  normalizeWorkflowResult,
} from "./resultView";
import { buildJsTransformAgentContext } from "@/stores/jsTransformAgentContext";
import { useHorizontalResize } from "./composables/useHorizontalResize";
import { useVerticalResize } from "./composables/useVerticalResize";

// PrimeVue Components
import Dialog from "primevue/dialog";
import { useToast } from "primevue/usetoast";

const props = defineProps<{
  nodeId: string | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
const store = useWorkflowStore();
const piAgentConfigStore = usePiAgentConfigStore();
const toast = useToast();
const workflowNodes = computed<WorkflowNode[]>(
  () => store.nodes as WorkflowNode[],
);
const workflowEdges = computed<Edge[]>(() => store.edges as Edge[]);

const findWorkflowNode = (
  nodeId: string | null | undefined,
): WorkflowNode | null => {
  if (!nodeId) return null;
  return (
    workflowNodes.value.find((currentNode) => currentNode.id === nodeId) ?? null
  );
};

// 直接从 Store 中获取响应式节点对象
const node = computed<WorkflowNode | null>(() =>
  findWorkflowNode(props.nodeId),
);
const currentNodeRuntimeOutput = computed(() =>
  node.value ? store.getNodeOutput(node.value.id) : null,
);
const currentNodeRuntimeError = computed(() =>
  node.value ? store.getNodeError(node.value.id) ?? "" : "",
);

// 状态管理
const config = ref<any>({});
const activeTab = ref("parameters");
const editedName = ref("");
const localIsPinned = ref(false);
const localUseManualInput = ref(false);
const localManualInput = ref("");
const localPersistRuntimeInputs = ref(true);
const localReuseLastRuntimeInputs = ref(false);
const isHelpDialogVisible = ref(false);

// 深度分析弹窗状态
const analysisModal = ref({ visible: false, title: "", data: null });

// 左侧边栏比例调节逻辑
const {
  paneHeight: topPaneHeight,
  isResizing: isResizingLeft,
  startResizing: startResizingLeft,
} = useVerticalResize(400, { min: 150, max: 600 });
const {
  paneWidth: leftPaneWidth,
  isResizing: isResizingLeftPaneWidth,
  startResizing: startResizingLeftPaneWidth,
} = useHorizontalResize(320, { min: 260, max: 460 });
const {
  paneWidth: rightPaneWidth,
  isResizing: isResizingRightPaneWidth,
  startResizing: startResizingRightPaneWidth,
} = useHorizontalResize(320, { min: 260, max: 460 }, -1);
const isResizingHorizontally = computed(
  () => isResizingLeftPaneWidth.value || isResizingRightPaneWidth.value,
);

// 获取当前节点的定义
const nodeDefinition = computed(() =>
  node.value ? (getNodeDefinition(node.value.data.type) ?? null) : null,
);
const currentFileImportTask = computed(() =>
  node.value ? (store.fileImportTasks[node.value.id] ?? null) : null,
);
const fileImportPhaseTextMap = {
  reading: "正在读取文件",
  parsing: "正在解析文件内容",
  cleaning: "正在清洗并识别字段",
  finalizing: "正在整理结果",
} as const;
const currentFileImportPhaseText = computed(() => {
  const phase = currentFileImportTask.value?.phase;
  return phase ? fileImportPhaseTextMap[phase] : "";
});
const nodeHelpSummary = computed(() => {
  if (!nodeDefinition.value) {
    return {
      title: "未找到节点定义",
      summary: "暂时无法展示帮助，请先检查节点类型是否有效。",
      tone: "warning",
    } as const;
  }

  return {
    title: "节点简介",
    summary:
      nodeDefinition.value.help?.summary ?? nodeDefinition.value.description,
    tone: "default",
  } as const;
});

const isCorrelationNode = computed(() =>
  ["pearson", "spearman", "kendall"].includes(nodeDefinition.value?.name ?? ""),
);

const runtimeProperties = computed(
  () => nodeDefinition.value?.properties.filter((p) => p.isRuntimeInput) || [],
);
const staticProperties = computed(
  () => nodeDefinition.value?.properties.filter((p) => !p.isRuntimeInput) || [],
);

// 数据同步逻辑
watch(
  () => props.nodeId,
  (newId) => {
    if (newId && node.value) {
      editedName.value = node.value.data.label;
      localIsPinned.value = node.value.data.isPinned || false;
      localUseManualInput.value = node.value.data.useManualInput || false;
      localManualInput.value = node.value.data.manualInput || "";
      localPersistRuntimeInputs.value =
        node.value.data.persistRuntimeInputs ?? true;
      localReuseLastRuntimeInputs.value =
        node.value.data.reuseLastRuntimeInputs || false;
      activeTab.value = "parameters";
      isHelpDialogVisible.value = false;

      const baseConfig = { ...node.value.data.config };
      nodeDefinition.value?.properties.forEach((p) => {
        if (baseConfig[p.name] === undefined) baseConfig[p.name] = p.default;
      });
      config.value = baseConfig;
    } else {
      config.value = {};
    }
  },
  { immediate: true },
);

// 同步回 Store
watch(localIsPinned, (val) => {
  if (node.value) {
    node.value.data.isPinned = val;
    store.refreshUnsavedChanges();
  }
});
watch(localUseManualInput, (val) => {
  if (node.value) node.value.data.useManualInput = val;
});
watch(localManualInput, (val) => {
  if (node.value) node.value.data.manualInput = val;
});

const inputData = computed(() => {
  const currentNode = node.value;
  if (!currentNode) return null;

  const currentEdges = workflowEdges.value;
  const currentNodes = workflowNodes.value;
  const incomingEdges = currentEdges.filter(
    (edge) => edge.target === currentNode.id,
  );
  if (incomingEdges.length === 0) return null;

  if (nodeDefinition.value?.inputMode === "multiple") {
    return {
      inputs: incomingEdges.map((edge, index) => {
        const sourceNode = currentNodes.find((item) => item.id === edge.source);
        const payload = sourceNode ? store.getNodeOutput(sourceNode.id) : null;
        const normalized = normalizeWorkflowResult(payload);
        const rows = getResultRows(payload);
        const schemaFields = getResultSchemaFields(payload);

        return {
          sourceNodeId: edge.source,
          sourceNodeLabel: sourceNode?.data.label ?? edge.source,
          edgeId: edge.id,
          order: index,
          payload,
          result: normalized,
          summary: {
            rowCount: normalized?.meta?.rowCount ?? rows.length,
            fields: schemaFields.map((field) => field.name),
            kind: normalized?.kind ?? "unknown",
          },
        };
      }),
    };
  }

  const sourceNode = currentNodes.find(
    (item) => item.id === incomingEdges[0]?.source,
  );
  return sourceNode ? store.getNodeOutput(sourceNode.id) : null;
});

type NeighborNodeEntry = {
  id: string;
  label: string;
  type: string;
};

const sortNodesByPosition = (left: WorkflowNode, right: WorkflowNode) => {
  if (left.position.y !== right.position.y) {
    return left.position.y - right.position.y;
  }

  return left.position.x - right.position.x;
};

const neighborNodes = computed(() => {
  if (!node.value) {
    return {
      upstream: [] as NeighborNodeEntry[],
      downstream: [] as NeighborNodeEntry[],
    };
  }

  const nodeMap = new Map(workflowNodes.value.map((item) => [item.id, item]));
  const upstreamIdSet = new Set<string>();
  const downstreamIdSet = new Set<string>();

  workflowEdges.value.forEach((edge) => {
    if (edge.target === node.value?.id) {
      upstreamIdSet.add(edge.source);
    }

    if (edge.source === node.value?.id) {
      downstreamIdSet.add(edge.target);
    }
  });

  const toEntries = (idSet: Set<string>) =>
    [...idSet]
      .map((id) => nodeMap.get(id))
      .filter((item): item is WorkflowNode => Boolean(item))
      .sort(sortNodesByPosition)
      .map((item) => ({
        id: item.id,
        label: item.data.label,
        type: item.data.type,
      }));

  return {
    upstream: toEntries(upstreamIdSet),
    downstream: toEntries(downstreamIdSet),
  };
});

const hasNeighborNavigator = computed(
  () =>
    neighborNodes.value.upstream.length > 0 ||
    neighborNodes.value.downstream.length > 0,
);
const shouldShowNeighborNavigator = computed(
  () =>
    props.visible &&
    Boolean(node.value) &&
    hasNeighborNavigator.value &&
    !analysisModal.value.visible,
);

const openNeighborNodeConfig = (targetNodeId: string) => {
  if (!node.value || targetNodeId === node.value.id) return;
  store.setActiveConfigNodeId(targetNodeId);
};

const debugWorkspaceRef = ref<HTMLElement | null>(null);
const debugWorkspaceRect = ref<DOMRect | null>(null);
let debugWorkspaceResizeObserver: ResizeObserver | null = null;

const getDebugLayoutAnchor = () => {
  const element = debugWorkspaceRef.value;
  if (!element) return null;

  const dialogElement = element.closest(".p-dialog");
  return dialogElement instanceof HTMLElement ? dialogElement : element;
};

const updateDebugWorkspaceRect = () => {
  const anchor = getDebugLayoutAnchor();
  if (!props.visible || !anchor) {
    debugWorkspaceRect.value = null;
    return;
  }

  debugWorkspaceRect.value = anchor.getBoundingClientRect();
};

const reconnectDebugWorkspaceObserver = () => {
  debugWorkspaceResizeObserver?.disconnect();
  debugWorkspaceResizeObserver = null;

  if (typeof ResizeObserver === "undefined") return;

  const anchor = getDebugLayoutAnchor();
  if (!anchor) return;

  debugWorkspaceResizeObserver = new ResizeObserver(() => {
    updateDebugWorkspaceRect();
  });
  debugWorkspaceResizeObserver.observe(anchor);
};

const handleViewportUpdate = () => {
  updateDebugWorkspaceRect();
};

const createNeighborRailStyle = (side: "left" | "right") => {
  const railWidth = 128;
  const railSpacing = 24;

  const rect = debugWorkspaceRect.value;
  if (!rect) {
    return {
      top: "50%",
      left: "-9999px",
      transform: "translateY(-50%)",
    };
  }

  const top = Math.round(rect.top + rect.height / 2);

  if (side === "left") {
    return {
      top: `${top}px`,
      left: `${Math.round(rect.left - railWidth - railSpacing)}px`,
      transform: "translateY(-50%)",
    };
  }

  return {
    top: `${top}px`,
    left: `${Math.round(rect.right + railSpacing)}px`,
    transform: "translateY(-50%)",
  };
};

const leftNeighborRailStyle = computed(() => createNeighborRailStyle("left"));
const rightNeighborRailStyle = computed(() => createNeighborRailStyle("right"));
let debugWorkspaceRafId: number | null = null;
let debugWorkspaceTrackingRafId: number | null = null;
let debugWorkspaceSyncTimers: Array<ReturnType<typeof setTimeout>> = [];

const clearDebugWorkspaceSyncQueue = () => {
  if (debugWorkspaceRafId !== null) {
    cancelAnimationFrame(debugWorkspaceRafId);
    debugWorkspaceRafId = null;
  }

  if (debugWorkspaceTrackingRafId !== null) {
    cancelAnimationFrame(debugWorkspaceTrackingRafId);
    debugWorkspaceTrackingRafId = null;
  }

  debugWorkspaceSyncTimers.forEach((timer) => clearTimeout(timer));
  debugWorkspaceSyncTimers = [];
};

const scheduleDebugWorkspaceTracking = (remainingFrames: number) => {
  if (remainingFrames <= 0) {
    debugWorkspaceTrackingRafId = null;
    return;
  }

  debugWorkspaceTrackingRafId = requestAnimationFrame(() => {
    updateDebugWorkspaceRect();
    scheduleDebugWorkspaceTracking(remainingFrames - 1);
  });
};

const scheduleDebugWorkspaceRectSync = () => {
  clearDebugWorkspaceSyncQueue();
  updateDebugWorkspaceRect();

  debugWorkspaceRafId = requestAnimationFrame(() => {
    updateDebugWorkspaceRect();
    debugWorkspaceRafId = null;
  });
  [80, 180, 320, 480].forEach((delay) => {
    const timer = setTimeout(() => {
      updateDebugWorkspaceRect();
      debugWorkspaceSyncTimers = debugWorkspaceSyncTimers.filter(
        (item) => item !== timer,
      );
    }, delay);
    debugWorkspaceSyncTimers.push(timer);
  });

  // The dialog is positioned with overlay lifecycle + transitions; keep sampling on first open.
  scheduleDebugWorkspaceTracking(45);
};

const isMissingQualityValue = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (typeof value === "number" && Number.isNaN(value));

const buildQualityMetricsByField = (rows: unknown[]) => {
  const tableRows = rows.filter((row): row is Record<string, unknown> =>
    isPlainObject(row),
  );
  if (tableRows.length === 0)
    return new Map<string, { missingRate: number; completenessRate: number }>();

  const fieldSet = new Set<string>();
  tableRows.forEach((row) =>
    Object.keys(row).forEach((field) => fieldSet.add(field)),
  );

  const metrics = new Map<
    string,
    { missingRate: number; completenessRate: number }
  >();
  fieldSet.forEach((field) => {
    const missingCount = tableRows.filter((row) =>
      isMissingQualityValue(row[field]),
    ).length;
    const missingRate = missingCount / tableRows.length;
    metrics.set(field, {
      missingRate,
      completenessRate: 1 - missingRate,
    });
  });

  return metrics;
};

const withQualityMetrics = <T extends { name: string }>(
  factors: T[],
  metrics: Map<string, { missingRate: number; completenessRate: number }>,
) =>
  factors.map((factor) => {
    const quality = metrics.get(factor.name);
    return quality ? { ...factor, ...quality } : factor;
  });

const upstreamFactors = computed(() => {
  let data = localUseManualInput.value
    ? localManualInput.value
    : inputData.value;
  if (!data && currentNodeRuntimeOutput.value) data = currentNodeRuntimeOutput.value;
  if (!data) return [];
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const schemaFields = getResultSchemaFields(data);
  const qualityMetrics = buildQualityMetricsByField(getResultRows(data));
  if (schemaFields.length > 0) {
    return withQualityMetrics(
      schemaFields.map((field) => ({
        name: field.name,
        value: field.name,
        dataType: field.type,
        nullable: field.nullable,
      })),
      qualityMetrics,
    );
  }

  const rows = getResultRows(data);
  const sample = rows[0];
  if (sample && typeof sample === "object") {
    return withQualityMetrics(
      Object.keys(sample).map((key) => ({
        name: key,
        value: key,
        dataType: "unknown",
      })),
      qualityMetrics,
    );
  }

  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    const arrayQualityMetrics = buildQualityMetricsByField(data);
    return withQualityMetrics(
      Object.keys(data[0]).map((key) => ({
        name: key,
        value: key,
        dataType: "unknown",
      })),
      arrayQualityMetrics,
    );
  }

  return [];
});

const availableNumericFactorCount = computed(
  () =>
    upstreamFactors.value.filter(
      (factor) => factor.dataType === "number" || factor.dataType === "unknown",
    ).length,
);

const debugActionGuideText = computed(
  () =>
    "调试节点只重新执行当前节点，默认复用上游缓存；重跑上游后调试会沿当前链路重新执行上游节点，更适合校验最新输入。",
);
const currentNodeError = computed(() =>
  node.value?.data.status === "error" && currentNodeRuntimeError.value
    ? currentNodeRuntimeError.value
    : "",
);
const isJsTransformNode = computed(
  () => nodeDefinition.value?.name === "js-transform",
);
const jsTransformDeclarations = computed(
  () =>
    nodeDefinition.value?.properties.find((property) => property.name === "code")
      ?.editorDeclarations ?? "",
);
const jsTransformAgentContextBuilder = computed(() => {
  if (!isJsTransformNode.value || !node.value) return undefined;

  const currentNode = node.value;

  return () =>
    buildJsTransformAgentContext({
      nodeId: currentNode.id,
      nodeLabel: currentNode.data.label,
      nodeType: "js-transform",
      currentCode: String(config.value.code ?? ""),
      declarations: jsTransformDeclarations.value,
      inputData: inputData.value,
      outputData: currentNodeRuntimeOutput.value,
      errorMessage: currentNodeError.value,
      status:
        currentNode.data.status === "error"
          ? "error"
          : currentNode.data.status === "success"
            ? "success"
            : "idle",
    });
});
const isCurrentNodeDebugRunning = computed(
  () =>
    !!node.value &&
    store.isRunning &&
    store.activeExecutionScope === "single" &&
    store.activeExecutionNodeId === node.value.id,
);

const correlationSetupGuide = computed(() => {
  if (!isCorrelationNode.value) return null;

  return {
    title: "相关性分析配置建议",
    items: [
      "先选择 1-3 个 Y 字段作为观察指标，再补充 3-10 个 X 字段作为候选因子。",
      "优先选择数值字段；类别字段进入相关性分析前，建议先做编码或清洗。",
      `当前可用数值字段 ${availableNumericFactorCount.value} 个，可先从最关键的指标开始。`,
    ],
  };
});

const runCurrentNode = async (rerunUpstream = false) => {
  if (node.value) {
    node.value.data.config = { ...config.value };
    node.value.data.label = editedName.value;
    node.value.data.useManualInput = localUseManualInput.value;
    node.value.data.manualInput = localManualInput.value;
    node.value.data.persistRuntimeInputs = localPersistRuntimeInputs.value;
    node.value.data.reuseLastRuntimeInputs = localReuseLastRuntimeInputs.value;
    store.refreshUnsavedChanges();
    await store.executeNode(node.value.id, true, "single", { rerunUpstream });
  }
};

const debugNodeForAgent = async (
  mode: "reuse_cached_upstream" | "rerun_upstream",
) => {
  if (!node.value) {
    return {
      ok: false,
      status: "error" as const,
      summary: "当前节点不存在，无法调试",
      outputSample: [],
      errorMessage: "当前节点不存在",
    };
  }

  node.value.data.config = { ...config.value };
  const result = await store.debugNodeAndCollect(node.value.id, {
    rerunUpstream: mode === "rerun_upstream",
  });
  const outputRows = getResultRows(result.output);

  return {
    ok: result.ok,
    status: result.status,
    summary:
      outputRows.length > 0
        ? `当前节点调试成功，输出 ${outputRows.length} 行`
        : result.ok
          ? "当前节点调试成功"
          : currentNodeError.value || "当前节点调试失败",
    outputSample: outputRows.slice(0, 3).map((row) =>
      Object.fromEntries(
        Object.keys(row)
          .slice(0, 50)
          .map((key) => [key, row[key]]),
      ),
    ),
    errorMessage: result.ok ? "" : currentNodeError.value || "当前节点调试失败",
  };
};

const saveConfig = () => {
  if (node.value) {
    node.value.data.label = editedName.value;
    node.value.data.config = serializeNodeConfigForPersistence({
      nodeType: node.value.data.type,
      config: config.value,
      persistRuntimeInputs: localPersistRuntimeInputs.value,
    });
    node.value.data.useManualInput = localUseManualInput.value;
    node.value.data.manualInput = localManualInput.value;
    node.value.data.persistRuntimeInputs = localPersistRuntimeInputs.value;
    node.value.data.reuseLastRuntimeInputs = localReuseLastRuntimeInputs.value;
    store.refreshUnsavedChanges();
    toast.add({
      group: "node-config",
      severity: "success",
      summary: "保存成功",
      detail: "节点配置已应用",
      life: 2200,
    });
  }
};

const resetSavedRuntimeInputs = () => {
  if (!node.value) return;
  store.resetNodeRuntimeInputs(node.value.id);
  localPersistRuntimeInputs.value =
    node.value.data.persistRuntimeInputs ?? true;
  localReuseLastRuntimeInputs.value =
    node.value.data.reuseLastRuntimeInputs ?? false;
  config.value = { ...node.value.data.config };
};

const saveAndClose = () => {
  saveConfig();
  emit("close");
};

const handleWindowKeydown = (event: KeyboardEvent) => {
  if (!props.visible || !node.value) return;

  const isSaveShortcut =
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "s";

  if (!isSaveShortcut) return;

  event.preventDefault();
  saveConfig();
};

const openAnalysis = (title: string, data: any) => {
  analysisModal.value = { visible: true, title, data };
};

const openExecutionLogs = () => {
  window.dispatchEvent(
    new CustomEvent("workflow:open-log-panel", {
      detail: {
        nodeId: node.value?.id ?? null,
      },
    }),
  );
  emit("close");
};

const defaultMockRows = () => [{ f1: 10, f2: 20, target: 1 }];

type StructuredManualInputItem = {
  sourceNodeId?: string;
  sourceNodeLabel?: string;
  edgeId?: string;
  order?: number;
  result?: unknown;
  payload?: unknown;
};

const hasStructuredInputs = (
  value: unknown,
): value is {
  inputs: StructuredManualInputItem[];
} => isPlainObject(value) && Array.isArray(value.inputs);

const resolveStandardMockResult = (value: unknown) => {
  const normalized = normalizeWorkflowResult(value);
  if (normalized) return normalized;

  const rows = getResultRows(value);
  if (rows.length > 0) {
    return createTableResult(rows);
  }

  const groups = getResultGroups(value);
  if (groups.length > 0) {
    return createTableCollectionResult(groups);
  }

  if (isPlainObject(value) && Array.isArray(value.data)) {
    const legacyRows = value.data.filter(
      (row): row is Record<string, unknown> => isPlainObject(row),
    );
    if (legacyRows.length > 0) {
      return createTableResult(legacyRows);
    }
  }

  if (value !== null && value !== undefined) {
    return createJsonResult(value);
  }

  return createTableResult(defaultMockRows());
};

const buildManualInputTemplate = () => {
  if (nodeDefinition.value?.inputMode === "multiple") {
    const structuredInput = inputData.value;
    const items = hasStructuredInputs(structuredInput)
      ? structuredInput.inputs
      : [];
    const normalizedItems =
      items.length > 0
        ? items.map((item: StructuredManualInputItem, index: number) => ({
            sourceNodeId: item.sourceNodeId ?? `source-${index + 1}`,
            sourceNodeLabel: item.sourceNodeLabel ?? `来源 ${index + 1}`,
            edgeId: item.edgeId,
            order: item.order ?? index,
            result: resolveStandardMockResult(
              item.result ?? item.payload ?? null,
            ),
          }))
        : [
            {
              sourceNodeId: "source-1",
              sourceNodeLabel: "来源 1",
              order: 0,
              result: createTableResult(defaultMockRows()),
            },
            {
              sourceNodeId: "source-2",
              sourceNodeLabel: "来源 2",
              order: 1,
              result: createTableResult(defaultMockRows()),
            },
          ];

    return JSON.stringify({ inputs: normalizedItems }, null, 2);
  }

  return JSON.stringify(resolveStandardMockResult(inputData.value), null, 2);
};

watch(
  [() => props.visible, () => props.nodeId],
  async () => {
    await nextTick();
    reconnectDebugWorkspaceObserver();
    scheduleDebugWorkspaceRectSync();
  },
  { immediate: true, flush: "post" },
);

watch(
  () => debugWorkspaceRef.value,
  async () => {
    await nextTick();
    reconnectDebugWorkspaceObserver();
    scheduleDebugWorkspaceRectSync();
  },
);

onMounted(() => {
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("scroll", handleViewportUpdate, true);
});

onBeforeUnmount(() => {
  clearDebugWorkspaceSyncQueue();
  debugWorkspaceResizeObserver?.disconnect();
  debugWorkspaceResizeObserver = null;
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener("resize", handleViewportUpdate);
  window.removeEventListener("scroll", handleViewportUpdate, true);
});
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    block-scroll
    class="ndv-dialog"
    content-class="ndv-dialog-content"
    :content-style="{ padding: '0' }"
    :style="{ width: '92vw', maxWidth: '1600px', height: '88vh' }"
    :draggable="false"
    :closable="false"
    @update:visible="emit('close')"
  >
    <template #header>
      <ConfigHeader
        v-if="node"
        v-model:node-label="editedName"
        v-model:is-pinned="localIsPinned"
        :node-type="node.data.type"
        @close="emit('close')"
        @save="saveAndClose"
      />
    </template>

    <div
      v-if="node"
      class="ndv-body-shell flex h-full min-h-0 overflow-hidden"
    >
      <div
        ref="debugWorkspaceRef"
        class="ndv-body flex h-full w-full min-h-0 min-w-0 bg-white border-t overflow-hidden"
        :class="{
          'cursor-row-resize select-none': isResizingLeft,
          'cursor-col-resize select-none': isResizingHorizontally,
        }"
      >
        <!-- 左侧边栏 -->
        <div
          data-testid="debug-left-pane"
          class="bg-[#f1f5f9] flex flex-col overflow-hidden shrink-0"
          :style="{ width: `${leftPaneWidth}px` }"
        >
        <!-- 上部分：输入数据 -->
        <div
          class="shrink-0 min-h-0 p-4 pb-2 flex flex-col"
          :style="{ height: topPaneHeight + 'px' }"
        >
          <DataDisplayPanel
            v-model:use-manual-input="localUseManualInput"
            v-model:manual-input-str="localManualInput"
            title="输入数据 (INPUT)"
            :data="inputData"
            type="input"
            allow-mock
            @open-detail="
              openAnalysis(
                '输入数据',
                localUseManualInput ? localManualInput : inputData,
              )
            "
            @generate-mock="localManualInput = buildManualInputTemplate()"
          />
        </div>

        <!-- 拖拽分割线 -->
        <div
          data-testid="left-pane-vertical-resizer"
          class="group flex items-center justify-center h-4 cursor-row-resize select-none shrink-0"
          @mousedown="startResizingLeft"
        >
          <div
            class="w-12 h-1 bg-slate-200 rounded-full group-hover:bg-blue-400 transition-colors"
          />
        </div>

        <!-- 下部分：运行时输入 -->
        <div
          data-testid="runtime-inputs-panel-shell"
          class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-1"
        >
          <RuntimeInputs
            v-model:config="config"
            :properties="runtimeProperties"
            :node-type="node?.data.type"
            :reset-properties="nodeDefinition?.properties"
            :upstream-factors="upstreamFactors"
            :node-id="node?.id"
            :input-data="inputData"
          />
        </div>
        </div>

        <div
          data-testid="left-pane-horizontal-resizer"
          class="debug-column-resizer shrink-0 cursor-col-resize"
          :class="{ 'debug-column-resizer--active': isResizingHorizontally }"
          @mousedown="startResizingLeftPaneWidth"
        >
          <div class="debug-column-resizer__grip" />
        </div>

        <!-- 中心配置区域 -->
        <div class="flex-1 flex flex-col bg-white relative min-w-0 min-h-0">
          <div
            class="flex items-center justify-between border-b px-4 bg-white shrink-0"
          >
            <div class="flex">
              <button
                v-for="tab in [
                  { id: 'parameters', label: '参数设置' },
                  { id: 'settings', label: '运行设置' },
                ]"
                :key="tab.id"
                :class="[
                  'px-8 py-4 text-xs font-bold uppercase border-b-2 transition-all cursor-pointer',
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-400',
                ]"
                @click="activeTab = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>
            <div class="flex items-center gap-2">
              <div
                v-tooltip.bottom="debugActionGuideText"
                class="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-slate-500"
              >
                <span>调试说明</span>
                <HelpCircle :size="14" class="text-slate-400" />
              </div>
              <button
                data-testid="node-config-rerun-button"
                :disabled="isCurrentNodeDebugRunning"
                class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 shadow-sm transition-all hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 active:scale-95 disabled:opacity-70"
                @click="runCurrentNode(true)"
              >
                重跑上游后调试
              </button>
              <button
                data-testid="node-config-debug-button"
                :disabled="isCurrentNodeDebugRunning"
                class="n8n-debug-btn h-9 px-5 rounded-lg border-none shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer outline-none disabled:opacity-70"
                @click="runCurrentNode(false)"
              >
                <Loader2
                  v-if="isCurrentNodeDebugRunning"
                  :size="16"
                  class="text-white animate-spin"
                />
                <Bug v-else :size="16" class="text-white" />
                <span
                  class="text-[12px] font-bold text-white uppercase tracking-wider"
                >
                  {{ isCurrentNodeDebugRunning ? "正在调试..." : "调试节点" }}
                </span>
              </button>
              <button
                v-if="isCurrentNodeDebugRunning"
                data-testid="node-config-stop-button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition-all hover:bg-rose-100 active:scale-95"
                @click="store.stopExecution()"
              >
                <Square :size="15" fill="currentColor" />
              </button>
            </div>
          </div>
          <div class="flex min-h-0 flex-1 flex-col bg-white">
            <div
              class="custom-scrollbar flex-1 overflow-y-auto bg-white min-h-0 px-6 py-6 xl:px-8"
            >
              <div v-if="activeTab === 'parameters'" class="w-full max-w-5xl space-y-6">
                <div
                  v-if="currentFileImportTask"
                  class="rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="text-sm font-semibold text-blue-900">
                      后台解析中
                    </div>
                    <div class="text-[12px] font-semibold text-blue-700">
                      {{ currentFileImportTask.progress }}%
                    </div>
                  </div>
                  <div class="mt-1 text-[12px] text-blue-700">
                    {{ currentFileImportTask.fileName }} ·
                    {{ currentFileImportPhaseText }}
                  </div>
                </div>
                <div
                  class="flex items-center gap-3 rounded-2xl border px-4 py-3"
                  :class="
                    nodeHelpSummary.tone === 'warning'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-slate-50/85'
                  "
                >
                  <div
                    class="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                    :class="
                      nodeHelpSummary.tone === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-white text-slate-500 border border-slate-200'
                    "
                  >
                    {{ nodeHelpSummary.title }}
                  </div>

                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-slate-700">
                      <span class="text-slate-900">{{
                        nodeDefinition?.displayName ?? node?.data.label
                      }}</span>
                      <span class="mx-2 text-slate-300">·</span>
                      <span>{{ nodeHelpSummary.summary }}</span>
                    </p>
                  </div>

                  <button
                    v-if="nodeDefinition"
                    data-testid="node-help-trigger"
                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600"
                    @click="isHelpDialogVisible = true"
                  >
                    <HelpCircle :size="16" />
                  </button>
                </div>
                <div
                  v-if="correlationSetupGuide"
                  v-tooltip.bottom="correlationSetupGuide.items.join('\n')"
                  data-testid="correlation-setup-guide"
                  class="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-slate-900">
                      {{ correlationSetupGuide.title }}
                    </div>
                    <div class="mt-1 text-[12px] text-slate-500">
                      可用数值字段 {{ availableNumericFactorCount }} 个
                    </div>
                  </div>
                  <div
                    class="inline-flex items-center gap-2 text-[12px] font-medium text-blue-700"
                  >
                    <span
                      class="rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-bold"
                    >
                      首次配置
                    </span>
                    <HelpCircle :size="14" class="text-blue-500" />
                  </div>
                </div>
                <ConfigForm
                  v-model:config="config"
                  :properties="staticProperties"
                  :node-type="node?.data.type"
                  :reset-properties="nodeDefinition?.properties"
                  :upstream-factors="upstreamFactors"
                  :node-id="node?.id"
                  :input-data="inputData"
                  :agent-profile="piAgentConfigStore.selectedProfile"
                  :agent-output-data="currentNodeRuntimeOutput"
                  :agent-error-message="currentNodeError"
                  :build-js-transform-agent-context="jsTransformAgentContextBuilder"
                  :on-agent-debug-node="debugNodeForAgent"
                  @save="saveConfig"
                />
              </div>
              <div v-else class="h-full w-full max-w-5xl">
                <RuntimeSettingsPanel
                  :is-trigger="node.data.category === 'trigger'"
                  :persist-runtime-inputs="localPersistRuntimeInputs"
                  :reuse-last-runtime-inputs="localReuseLastRuntimeInputs"
                  @update:persist-runtime-inputs="
                    localPersistRuntimeInputs = $event
                  "
                  @update:reuse-last-runtime-inputs="
                    localReuseLastRuntimeInputs = $event
                  "
                  @reset-runtime-inputs="resetSavedRuntimeInputs"
                />
              </div>
            </div>

            <ConfigFooter
              class="shrink-0"
              @close="emit('close')"
              @save="saveConfig"
            />
          </div>
        </div>

        <div
          data-testid="right-pane-horizontal-resizer"
          class="debug-column-resizer shrink-0 cursor-col-resize"
          :class="{ 'debug-column-resizer--active': isResizingHorizontally }"
          @mousedown="startResizingRightPaneWidth"
        >
          <div class="debug-column-resizer__grip" />
        </div>

        <!-- 右侧边栏 -->
        <div
          data-testid="debug-right-pane"
          class="bg-[#f1f5f9] flex flex-col overflow-hidden shrink-0"
          :style="{ width: `${rightPaneWidth}px` }"
        >
          <div class="flex-1 p-4 flex flex-col min-h-0">
            <NodeDebugErrorCard
              v-if="currentNodeError"
              class="mb-3 shrink-0"
              :message="currentNodeError"
              :disabled="isCurrentNodeDebugRunning"
              @retry="runCurrentNode(false)"
              @rerun-upstream="runCurrentNode(true)"
              @open-logs="openExecutionLogs"
            />
            <DataDisplayPanel
              title="节点输出 (OUTPUT)"
              :data="currentNodeRuntimeOutput"
              type="output"
              :is-pinned="node.data.isPinned"
              @open-detail="openAnalysis('输出数据', currentNodeRuntimeOutput)"
            />
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="
          shouldShowNeighborNavigator &&
          neighborNodes.upstream.length > 0
        "
        data-testid="debug-neighbor-left-rail"
        class="fixed z-[1300] flex max-h-[68vh] w-32 flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-sm"
        :style="leftNeighborRailStyle"
      >
        <button
          v-for="item in neighborNodes.upstream"
          :key="`upstream-${item.id}`"
          :data-testid="`debug-neighbor-upstream-${item.id}`"
          type="button"
          class="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center transition-colors hover:border-blue-300 hover:bg-blue-50"
          @click="openNeighborNodeConfig(item.id)"
        >
          <NodeIcon :type="item.type" :size="32" />
          <span
            class="line-clamp-2 text-[11px] font-semibold leading-4 text-slate-700"
          >
            {{ item.label }}
          </span>
        </button>
      </div>

      <div
        v-if="
          shouldShowNeighborNavigator &&
          neighborNodes.downstream.length > 0
        "
        data-testid="debug-neighbor-right-rail"
        class="fixed z-[1300] flex max-h-[68vh] w-32 flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-sm"
        :style="rightNeighborRailStyle"
      >
        <button
          v-for="item in neighborNodes.downstream"
          :key="`downstream-${item.id}`"
          :data-testid="`debug-neighbor-downstream-${item.id}`"
          type="button"
          class="flex w-full flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center transition-colors hover:border-blue-300 hover:bg-blue-50"
          @click="openNeighborNodeConfig(item.id)"
        >
          <NodeIcon :type="item.type" :size="32" />
          <span
            class="line-clamp-2 text-[11px] font-semibold leading-4 text-slate-700"
          >
            {{ item.label }}
          </span>
        </button>
      </div>
    </Teleport>

    <DataAnalysisModal
      :visible="analysisModal.visible"
      :title="analysisModal.title"
      :data="analysisModal.data"
      :storage-scope-key="node?.id"
      @close="analysisModal.visible = false"
    />

    <Dialog
      :visible="isHelpDialogVisible"
      modal
      class="node-help-dialog"
      :style="{ width: 'min(840px, 88vw)', maxHeight: '80vh' }"
      :draggable="false"
      @update:visible="isHelpDialogVisible = false"
    >
      <template #header>
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"
          >
            <HelpCircle :size="18" />
          </div>
          <div>
            <div class="text-base font-semibold text-slate-900">
              节点使用帮助
            </div>
            <p class="mt-1 text-sm text-slate-500">
              {{ nodeDefinition?.displayName ?? node?.data.label }}
            </p>
          </div>
        </div>
      </template>

      <div class="max-h-[62vh] overflow-y-auto pr-1">
        <NodeHelpPanel :node-definition="nodeDefinition" />
      </div>
    </Dialog>
  </Dialog>
</template>

<style scoped>
:deep(.ndv-dialog.p-dialog) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: none !important;
}

:deep(.ndv-dialog .p-dialog-header) {
  padding: 1.25rem 1.5rem 1rem !important;
  background: #ffffff;
}

:deep(.ndv-dialog-content) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden !important;
  background: #ffffff;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
.n8n-debug-btn {
  background: #ff6d5a !important;
}
.n8n-debug-btn:hover {
  background: #ff523d !important;
}

.debug-column-resizer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.88) 0%, rgba(241, 245, 249, 0.92) 100%);
  transition:
    background 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease,
    transform 0.18s ease;
}

.debug-column-resizer::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: linear-gradient(
    180deg,
    rgba(203, 213, 225, 0) 0%,
    rgba(148, 163, 184, 0.48) 14%,
    rgba(148, 163, 184, 0.62) 50%,
    rgba(148, 163, 184, 0.48) 86%,
    rgba(203, 213, 225, 0) 100%
  );
}

.debug-column-resizer:hover {
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96) 0%, rgba(219, 234, 254, 0.9) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(191, 219, 254, 0.85),
    0 0 0 3px rgba(219, 234, 254, 0.26);
}

.debug-column-resizer:hover::before,
.debug-column-resizer--active::before {
  background: linear-gradient(
    180deg,
    rgba(147, 197, 253, 0) 0%,
    rgba(59, 130, 246, 0.7) 14%,
    rgba(37, 99, 235, 0.95) 50%,
    rgba(59, 130, 246, 0.7) 86%,
    rgba(147, 197, 253, 0) 100%
  );
}

.debug-column-resizer__grip {
  position: relative;
  z-index: 1;
  width: 10px;
  height: 78px;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
  box-shadow:
    0 10px 18px rgba(148, 163, 184, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.96);
  opacity: 0.98;
  transition:
    opacity 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.debug-column-resizer__grip::before {
  content: "";
  position: absolute;
  inset: 15px 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(203, 213, 225, 0.16) 0%, rgba(148, 163, 184, 0.5) 100%);
}

.debug-column-resizer:hover .debug-column-resizer__grip,
.debug-column-resizer--active .debug-column-resizer__grip {
  opacity: 1;
  transform: scale(1.04);
  border-color: rgba(147, 197, 253, 0.95);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(239, 246, 255, 0.98) 100%);
  box-shadow:
    0 14px 26px rgba(59, 130, 246, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

.debug-column-resizer:hover .debug-column-resizer__grip::before,
.debug-column-resizer--active .debug-column-resizer__grip::before {
  background: linear-gradient(180deg, rgba(191, 219, 254, 0.22) 0%, rgba(59, 130, 246, 0.56) 100%);
}

.debug-column-resizer--active {
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.94) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(147, 197, 253, 0.96),
    0 0 0 4px rgba(191, 219, 254, 0.26);
}
</style>
