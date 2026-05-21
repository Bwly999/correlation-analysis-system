import { defineStore } from 'pinia'
import { computed, ref, shallowRef, markRaw, toRaw, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import { type Node, type Edge, type NodeChange, type EdgeChange } from '@vue-flow/core'
import { getNodeDefinition } from '@/nodes/registry'
import { createFileImportTask, isFileImportCancelledError } from '@/nodes/fileImport/task'
import type { MultipleNodeExecutionInput, MultipleNodeExecutionItem } from '@/nodes/types'
import type { FileImportProgress, FileImportParseOptions } from '@/nodes/fileImport/types'
import { isNodeResult, normalizeNodeResult } from '@/nodes/result'
import { buildWorkflowAiNodeCatalog } from '@/ai/catalog'
import { validateWorkflowAiPlanAgainstContext } from '@/ai/planValidation'
import {
  getWorkflowTemplateDefinition,
  type WorkflowTemplateJsonDefinition,
} from '@/workflow/templates'
import {
  storageProvider,
  type WorkflowNode,
  type SavedWorkflow,
  type ExecutionRecord,
  type WorkflowRollbackResult,
  type WorkflowVersionDetail,
  type WorkflowVersionMetadata,
  type WorkflowNodeOutput,
  type WorkflowNodeSnapshot,
  type WorkflowSelectionSnapshot,
  type WorkflowSelectionTextPayload,
  type StorageUser,
} from '@/utils/storage'
import { stripRuntimeInputValuesFromConfig } from '@/utils/workflowConfig'
import type {
  WorkflowAiEditableSnapshot,
  WorkflowAiOperation,
  WorkflowAiPlan,
  WorkflowAiPlanApplyResult,
  WorkflowAiPlanValidationResult,
} from '@/ai/types'

export const CONNECTION_RULES: Record<string, string[]> = {
  trigger: ['action', 'terminal'],
  action: ['action', 'terminal'],
  terminal: [],
}

export type PendingConnectionState = {
  sourceNodeId: string
  sourceHandleId?: string
  edgeId?: string
} | null

type OriginalWorkflowState = {
  nodes: WorkflowNode[]
  edges: Edge[]
  name: string
  id: string | null
  lastRunDashboard: WorkflowRunDashboardState | null
}

export type WorkflowRunDashboardState = {
  id: string
  workflowName: string
  status: 'success' | 'error' | 'stopped'
  startTime: number
  duration: number
  executionTargetIds: string[]
  executionScopeNodeIds: string[]
  terminalNodeIds: string[]
}

export type WorkflowExecutionResult = {
  ok: boolean
  scope: 'global' | 'single'
  executionId: string | null
  status: WorkflowRunDashboardState['status'] | 'idle'
  dashboardSummary: WorkflowRunDashboardState | null
  nodeResults: WorkflowNodeSnapshot[]
}

export type WorkflowNodeDebugResult = {
  ok: boolean
  scope: 'single'
  nodeId: string
  status: 'success' | 'error' | 'stopped' | 'waiting_input'
  output: unknown
}

type DebugExecutionOptions = {
  rerunUpstream?: boolean
  isNested?: boolean
}

type CanvasHistoryNodeSnapshot = {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  data: {
    label: string
    type: string
    category: WorkflowNode['data']['category']
    config: Record<string, unknown>
    reuseLastRuntimeInputs: boolean
    useManualInput: boolean
    isPinned: boolean
  }
}

type CanvasHistorySnapshot = {
  nodes: CanvasHistoryNodeSnapshot[]
  edges: Edge[]
}

export type FileImportTaskState = {
  phase: FileImportProgress['phase']
  progress: number
  fileName: string
  format: string
  canCancel: boolean
  startedAt: number
}

const MAX_LOG_ENTRIES = 500
const MAX_CANVAS_HISTORY_STEPS = 30
const MAX_CANVAS_HISTORY_SNAPSHOTS = MAX_CANVAS_HISTORY_STEPS + 1
export const useWorkflowStore = defineStore('workflow', () => {
  const nodes = ref([]) as Ref<WorkflowNode[]>
  const edges = ref([]) as Ref<Edge[]>
  const logs = ref<{ time: string; level: string; message: string; nodeId?: string }[]>([])
  const workflowName = ref('未命名工作流')
  const currentWorkflowId = ref<string | null>(null)

  const isRunning = ref(false)
  const isStopping = ref(false)
  const activeExecutionScope = ref<'single' | 'global' | null>(null)
  const activeExecutionNodeId = ref<string | null>(null)
  const needsViewReset = ref(false) // 视图复位信号

  const pendingConnection = ref<PendingConnectionState>(null)

  const activeConfigNodeId = ref<string | null>(null)
  const activePreviewNodeId = ref<string | null>(null)
  const fileImportTasks = ref<Record<string, FileImportTaskState>>({})
  const pendingExecution = ref<
    {
      nodeId: string
      resumeNodeId?: string
      forceUpdate: boolean
      executionScope?: 'single' | 'global'
      debugOptions?: DebugExecutionOptions
      promptIndex?: number
      promptTotal?: number
    } | null
  >(null)
  let pendingExecutionResolver: ((result: 'RESUMED' | 'STOPPED') => void) | null = null
  const activeFileImportCancels = new Map<string, () => void>()
  let skipGlobalRunSummaryOnCancel = false
  let globalRuntimeQueueNodeIds: string[] = []
  const lastExecutedTerminalNodeId = ref<string | null>(null)
  const lastRunDashboard = ref<WorkflowRunDashboardState | null>(null)
  const executionHistory = ref([]) as Ref<ExecutionRecord[]>
  const savedWorkflows = ref([]) as Ref<SavedWorkflow[]>
  const currentStorageUser = ref<StorageUser | null>(null)
  const workflowVersions = ref([]) as Ref<WorkflowVersionMetadata[]>
  const selectedWorkflowVersionDetail = ref<WorkflowVersionDetail | null>(null)
  const editableSnapshots = ref([]) as Ref<WorkflowAiEditableSnapshot[]>
  const lastSavedWorkflowStructureSignature = ref('')
  const lastSavedWorkflowLayoutSignature = ref('')
  const hasExplicitUnsavedChanges = ref(false)
  const hasStructureUnsavedChanges = ref(false)
  const hasLayoutUnsavedChanges = ref(false)
  const hasUnsavedChanges = ref(false)
  const selectionClipboard = shallowRef<WorkflowSelectionSnapshot | null>(null)
  const canvasHistorySnapshots = shallowRef<CanvasHistorySnapshot[]>([])
  const canvasHistoryIndex = ref(0)
  const lastCanvasHistorySignature = ref('')
  const isApplyingCanvasHistory = ref(false)

  // 历史模式相关状态
  const isHistoryMode = ref(false)
  const originalWorkflowState = ref(null) as Ref<OriginalWorkflowState | null>

  const getCurrentNodes = (): WorkflowNode[] => nodes.value as WorkflowNode[]
  const getCurrentEdges = (): Edge[] => edges.value as Edge[]
  const getCurrentExecutionHistory = (): ExecutionRecord[] => executionHistory.value as ExecutionRecord[]
  const findNodeById = (
    nodeId: string,
    sourceNodes: WorkflowNode[] = getCurrentNodes(),
  ): WorkflowNode | undefined => {
    for (const node of sourceNodes) {
      if (node.id === nodeId) return node
    }
    return undefined
  }

  // --- 持久化操作封装 ---

  const refreshWorkflows = async (): Promise<SavedWorkflow[]> => {
    const workflows = (await storageProvider.getWorkflows()) as SavedWorkflow[]
    savedWorkflows.value = workflows
    return workflows
  }

  const clearWorkflowVersionState = () => {
    workflowVersions.value = []
    selectedWorkflowVersionDetail.value = null
  }

  const loadWorkflowVersions = async (workflowId = currentWorkflowId.value): Promise<WorkflowVersionMetadata[]> => {
    if (!workflowId) {
      clearWorkflowVersionState()
      return []
    }

    const versions = await storageProvider.getWorkflowVersions(workflowId)
    workflowVersions.value = versions

    if (
      selectedWorkflowVersionDetail.value
      && !versions.some((version) => version.id === selectedWorkflowVersionDetail.value?.id)
    ) {
      selectedWorkflowVersionDetail.value = null
    }

    return versions
  }

  const loadWorkflowVersionDetail = async (
    versionId: string,
    workflowId = currentWorkflowId.value,
  ): Promise<WorkflowVersionDetail | null> => {
    if (!workflowId) {
      selectedWorkflowVersionDetail.value = null
      return null
    }

    const detail = await storageProvider.getWorkflowVersion(workflowId, versionId)
    selectedWorkflowVersionDetail.value = detail
    return detail
  }

  const getSavedWorkflows = async (): Promise<SavedWorkflow[]> => {
    return refreshWorkflows()
  }

  const loadCurrentStorageUser = async (): Promise<StorageUser | null> => {
    try {
      const user = await storageProvider.getCurrentUser()
      currentStorageUser.value = user
      return user
    } catch (error) {
      currentStorageUser.value = null
      console.warn('Failed to load current storage user:', error)
      return null
    }
  }

  const getDuplicatedWorkflowName = (name: string) => `${name} (副本)`

  const deleteWorkflow = async (id: string) => {
    await storageProvider.deleteWorkflow(id)
    if (currentWorkflowId.value === id) {
      clearWorkflowVersionState()
    }
    const updated = await refreshWorkflows()
    addLog('工作流已删除', 'warn')
    return updated
  }

  const cloneJsonValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
  const cloneOptionalJsonValue = <T>(value: T): T => {
    if (value === undefined) return value
    return cloneJsonValue(value)
  }
  const cloneInspectionValue = <T>(value: T): T => {
    const rawValue = toRaw(value)

    if (Array.isArray(rawValue)) {
      return rawValue.map((item) => cloneInspectionValue(item)) as T
    }

    if (
      (typeof File !== 'undefined' && rawValue instanceof File)
      || (typeof Blob !== 'undefined' && rawValue instanceof Blob)
      || rawValue instanceof Date
    ) {
      return rawValue
    }

    if (rawValue && typeof rawValue === 'object') {
      const nextValue: Record<string, unknown> = {}
      Object.entries(rawValue).forEach(([key, nestedValue]) => {
        nextValue[key] = cloneInspectionValue(nestedValue)
      })
      return nextValue as T
    }

    return rawValue
  }

  const cloneWorkflowNodes = (sourceNodes: WorkflowNode[]): WorkflowNode[] =>
    cloneJsonValue(sourceNodes)

  const serializeWorkflowEdges = (sourceEdges: Edge[]): Edge[] =>
    sourceEdges.map((edge) =>
      cloneJsonValue({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: edge.type,
        animated: edge.animated,
        label: edge.label,
        data: edge.data,
        style: edge.style,
        markerStart: edge.markerStart,
        markerEnd: edge.markerEnd,
      }),
    )

  const cloneWorkflowEdges = (sourceEdges: Edge[]): Edge[] => serializeWorkflowEdges(sourceEdges)

  const generateNodeId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const generateEdgeId = () => `e_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const normalizeNodeConfigWithDefaults = (node: WorkflowNode): WorkflowNode => {
    const nextNode = cloneJsonValue(node)
    const definition = getNodeDefinition(nextNode.data.type)

    if (!definition) return nextNode

    const nextConfig = { ...(nextNode.data.config ?? {}) }
    definition.properties.forEach((property) => {
      if (nextConfig[property.name] === undefined && property.default !== undefined) {
        nextConfig[property.name] = cloneJsonValue(property.default)
      }
    })
    nextNode.data.config = nextConfig

    return nextNode
  }

  const getDefaultConfigForType = (type: string) => {
    const definition = getNodeDefinition(type)
    const defaultConfig: Record<string, unknown> = {}
    definition?.properties.forEach((property) => {
      if (property.default !== undefined) {
        defaultConfig[property.name] = cloneJsonValue(property.default)
      }
    })
    return defaultConfig
  }

  const stripCanvasHistoryPayloadFromConfig = (
    nodeType: string,
    category: WorkflowNode['data']['category'],
    config: Record<string, unknown> | null | undefined,
  ) => {
    const nextConfig = stripRuntimeInputValuesFromConfig(nodeType, config)
    if (category !== 'trigger') return nextConfig

    const definition = getNodeDefinition(nodeType)
    if (!definition) return nextConfig

    definition.properties.forEach((property) => {
      if (property.type === 'json') {
        nextConfig[property.name] = ''
      }
      if (property.type === 'file') {
        nextConfig[property.name] = null
      }
    })

    return nextConfig
  }

  const serializeWorkflowNodes = (
    sourceNodes: WorkflowNode[],
    options: { includePinnedOutput?: boolean } = {},
  ): WorkflowNodeSnapshot[] =>
    sourceNodes.map((node) => {
      const normalizedNode = normalizeNodeConfigWithDefaults(node)
      return cloneJsonValue({
        id: normalizedNode.id,
        type: normalizedNode.type,
        position: normalizedNode.position,
        label: normalizedNode.label,
        data: {
          ...normalizedNode.data,
          config: stripRuntimeInputValuesFromConfig(
            normalizedNode.data.type,
            normalizedNode.data.config,
          ),
          status: 'idle' as const,
          output:
            options.includePinnedOutput && normalizedNode.data.isPinned ? normalizedNode.data.output : null,
        },
      })
    })

  const serializeWorkflowStructureNodes = (
    sourceNodes: WorkflowNode[],
    options: { includePinnedOutput?: boolean } = {},
  ) =>
    sourceNodes.map((node) => {
      const normalizedNode = normalizeNodeConfigWithDefaults(node)
      return cloneJsonValue({
        id: normalizedNode.id,
        type: normalizedNode.type,
        label: normalizedNode.label,
        data: {
          ...normalizedNode.data,
          config: stripRuntimeInputValuesFromConfig(
            normalizedNode.data.type,
            normalizedNode.data.config,
          ),
          status: 'idle' as const,
          output:
            options.includePinnedOutput && normalizedNode.data.isPinned ? normalizedNode.data.output : null,
        },
      })
    })

  const serializeCanvasHistoryNodes = (
    sourceNodes: WorkflowNode[],
  ): CanvasHistoryNodeSnapshot[] =>
    sourceNodes.map((node) => {
      const normalizedNode = normalizeNodeConfigWithDefaults(node)

      return cloneJsonValue({
        id: normalizedNode.id,
        type: normalizedNode.type ?? 'custom',
        label: normalizedNode.label ?? normalizedNode.data.label,
        position: normalizedNode.position,
        data: {
          label: normalizedNode.data.label,
          type: normalizedNode.data.type,
          category: normalizedNode.data.category,
          config: stripCanvasHistoryPayloadFromConfig(
            normalizedNode.data.type,
            normalizedNode.data.category,
            normalizedNode.data.config,
          ),
          reuseLastRuntimeInputs: normalizedNode.data.reuseLastRuntimeInputs ?? false,
          useManualInput: normalizedNode.data.useManualInput ?? false,
          isPinned: normalizedNode.data.isPinned ?? false,
        },
      })
    })

  const createCanvasHistorySnapshot = (
    sourceNodes: WorkflowNode[] = getCurrentNodes(),
    sourceEdges: Edge[] = getCurrentEdges(),
  ): CanvasHistorySnapshot => ({
    nodes: serializeCanvasHistoryNodes(sourceNodes),
    edges: serializeWorkflowEdges(sourceEdges),
  })

  const getCanvasHistorySnapshotSignature = (snapshot: CanvasHistorySnapshot) =>
    JSON.stringify(snapshot)

  const restoreCanvasHistoryNodes = (sourceNodes: CanvasHistoryNodeSnapshot[]): WorkflowNode[] =>
    sourceNodes.map((node) =>
      normalizeNodeConfigWithDefaults({
        id: node.id,
        type: node.type,
        label: node.label,
        position: cloneJsonValue(node.position),
        selected: false,
        dragging: false,
        data: {
          label: node.data.label,
          type: node.data.type,
          category: node.data.category,
          config: cloneJsonValue(node.data.config),
          reuseLastRuntimeInputs: node.data.reuseLastRuntimeInputs ?? false,
          status: 'idle',
          output: undefined,
          logs: [],
          useManualInput: node.data.useManualInput ?? false,
          manualInput: '',
          isPinned: node.data.isPinned ?? false,
          error: undefined,
        },
      } as WorkflowNode),
    )

  const createAgentWorkflowSnapshot = () => ({
    name: workflowName.value,
    nodes: serializeWorkflowStructureNodes(getCurrentNodes()).map((node) => ({
      ...node,
      position: findNodeById(node.id)?.position ?? null,
    })),
    edges: serializeWorkflowEdges(getCurrentEdges()),
  })

  const getSelectedNodes = (sourceNodes: WorkflowNode[] = getCurrentNodes()) =>
    sourceNodes.filter((node) => node.selected)

  const serializeNodeSelection = (nodeIds: string[]): WorkflowSelectionSnapshot => {
    const selectedNodeIds = new Set(nodeIds)
    const sourceNodes = getCurrentNodes().filter((node) => selectedNodeIds.has(node.id))
    const sourceEdges = getCurrentEdges().filter(
      (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
    )

    return {
      nodes: serializeWorkflowNodes(sourceNodes).map((node) => ({
        ...node,
        data: {
          ...node.data,
          logs: [],
          error: undefined,
        },
      })),
      edges: serializeWorkflowEdges(sourceEdges),
    }
  }

  const buildSelectionTextPayload = (
    snapshot: WorkflowSelectionSnapshot,
  ): WorkflowSelectionTextPayload => ({
    kind: 'workflow-selection',
    version: 1,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  })

  const deserializeSelectionText = (text: string): WorkflowSelectionTextPayload | null => {
    if (!text.trim()) return null

    try {
      const parsed = JSON.parse(text) as Partial<WorkflowSelectionTextPayload>
      if (
        parsed.kind !== 'workflow-selection'
        || parsed.version !== 1
        || !Array.isArray(parsed.nodes)
        || !Array.isArray(parsed.edges)
      ) {
        return null
      }

      return {
        kind: 'workflow-selection',
        version: 1,
        nodes: parsed.nodes as WorkflowNodeSnapshot[],
        edges: parsed.edges as Edge[],
      }
    } catch {
      return null
    }
  }

  const duplicateSelectionToClipboard = () => {
    const selectedNodes = getSelectedNodes()
    if (!selectedNodes.length) return null

    const snapshot = serializeNodeSelection(selectedNodes.map((node) => node.id))
    selectionClipboard.value = snapshot
    addLog(`已复制 ${snapshot.nodes.length} 个节点到当前工作流剪贴板`, 'info')
    refreshUnsavedChanges()
    return snapshot
  }

  const getSelectionDuplicateAnchor = (
    snapshot: WorkflowSelectionSnapshot,
    offset = 40,
  ) => ({
    x: Math.min(...snapshot.nodes.map((node) => node.position.x)) + offset,
    y: Math.min(...snapshot.nodes.map((node) => node.position.y)) + offset,
  })

  const copySelectionAsText = async () => {
    const selectedNodes = getSelectedNodes()
    if (!selectedNodes.length) return null

    const snapshot = serializeNodeSelection(selectedNodes.map((node) => node.id))
    const payload = buildSelectionTextPayload(snapshot)
    const text = JSON.stringify(payload, null, 2)

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    }

    addLog(`已复制 ${snapshot.nodes.length} 个节点为文本`, 'info')
    refreshUnsavedChanges()
    return text
  }

  const pasteSelectionSnapshot = (
    snapshot: WorkflowSelectionSnapshot,
    anchor: { x: number; y: number },
    options?: { labelSuffix?: string; logMessage?: string },
  ) => {
    if (!snapshot.nodes.length) return []

    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const minX = Math.min(...snapshot.nodes.map((node) => node.position.x))
    const minY = Math.min(...snapshot.nodes.map((node) => node.position.y))
    const offsetX = anchor.x - minX
    const offsetY = anchor.y - minY
    const nodeIdMap = new Map<string, string>()

    currentNodes.forEach((node) => {
      node.selected = false
    })

    const pastedNodes = snapshot.nodes.map((node) => {
      const nextId = generateNodeId()
      nodeIdMap.set(node.id, nextId)

      const nextNode = normalizeNodeConfigWithDefaults({
        id: nextId,
        type: node.type ?? 'custom',
        label: `${node.label ?? node.data.label}${options?.labelSuffix ?? ''}`,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY,
        },
        selected: true,
        dragging: false,
        data: {
          ...cloneJsonValue(node.data),
          label: `${node.data.label}${options?.labelSuffix ?? ''}`,
          status: 'idle',
          output: null,
          logs: [],
          error: undefined,
        },
      })

      return nextNode
    })

    const pastedEdges = snapshot.edges.flatMap((edge) => {
      const sourceId = nodeIdMap.get(edge.source)
      const targetId = nodeIdMap.get(edge.target)
      if (!sourceId || !targetId) return []

      return [{
        ...cloneJsonValue(edge),
        id: generateEdgeId(),
        source: sourceId,
        target: targetId,
      }]
    })

    nodes.value = [...currentNodes, ...pastedNodes]
    edges.value = [...currentEdges, ...pastedEdges]
    refreshUnsavedChanges()
    pushCanvasHistorySnapshot()
    addLog(options?.logMessage ?? `已粘贴 ${pastedNodes.length} 个节点`, 'info')
    return pastedNodes
  }

  const duplicateSelectedNodes = () => {
    const selectedNodes = getSelectedNodes()
    if (!selectedNodes.length) return []

    const snapshot = serializeNodeSelection(selectedNodes.map((node) => node.id))
    selectionClipboard.value = snapshot

    return pasteSelectionSnapshot(snapshot, getSelectionDuplicateAnchor(snapshot), {
      labelSuffix: ' (副本)',
      logMessage: `已复制 ${snapshot.nodes.length} 个节点`,
    })
  }

  const pasteClipboardSelection = async (anchor: { x: number; y: number }) => {
    let snapshot: WorkflowSelectionSnapshot | null = null

    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const clipboardText = await navigator.clipboard.readText()
      const parsedPayload = deserializeSelectionText(clipboardText)
      if (parsedPayload) {
        snapshot = {
          nodes: parsedPayload.nodes,
          edges: parsedPayload.edges,
        }
      }
    }

    const resolvedSnapshot: WorkflowSelectionSnapshot | null = snapshot ?? selectionClipboard.value ?? null
    if (!resolvedSnapshot) return []

    return pasteSelectionSnapshot(resolvedSnapshot, anchor)
  }

  const getWorkflowStructureSignature = () =>
    JSON.stringify({
      id: currentWorkflowId.value,
      name: workflowName.value,
      nodes: serializeWorkflowStructureNodes(getCurrentNodes(), { includePinnedOutput: true }),
      edges: serializeWorkflowEdges(getCurrentEdges()),
    })

  const getWorkflowLayoutSignature = () =>
    JSON.stringify(
      getCurrentNodes().map((node) => ({
        id: node.id,
        position: cloneJsonValue(node.position),
      })),
    )

  const resetCanvasHistory = () => {
    const snapshot = createCanvasHistorySnapshot()
    canvasHistorySnapshots.value = [snapshot]
    canvasHistoryIndex.value = 0
    lastCanvasHistorySignature.value = getCanvasHistorySnapshotSignature(snapshot)
  }

  const pushCanvasHistorySnapshot = () => {
    if (isApplyingCanvasHistory.value) return false

    const snapshot = createCanvasHistorySnapshot()
    const signature = getCanvasHistorySnapshotSignature(snapshot)
    if (signature === lastCanvasHistorySignature.value) {
      return false
    }

    const nextHistory = [
      ...canvasHistorySnapshots.value.slice(0, canvasHistoryIndex.value + 1),
      snapshot,
    ]
    const trimmedHistory = nextHistory.slice(-MAX_CANVAS_HISTORY_SNAPSHOTS)

    canvasHistorySnapshots.value = trimmedHistory
    canvasHistoryIndex.value = trimmedHistory.length - 1
    lastCanvasHistorySignature.value = signature
    return true
  }

  const applyCanvasHistorySnapshot = (snapshot: CanvasHistorySnapshot) => {
    isApplyingCanvasHistory.value = true
    try {
      nodes.value = restoreCanvasHistoryNodes(snapshot.nodes)
      edges.value = cloneWorkflowEdges(snapshot.edges)
      refreshUnsavedChanges()
      lastCanvasHistorySignature.value = getCanvasHistorySnapshotSignature(snapshot)
    } finally {
      isApplyingCanvasHistory.value = false
    }
  }

  const canUndoCanvasChange = computed(() => canvasHistoryIndex.value > 0)
  const canRedoCanvasChange = computed(
    () => canvasHistoryIndex.value < canvasHistorySnapshots.value.length - 1,
  )

  const undoCanvasChange = () => {
    if (!canUndoCanvasChange.value) return false

    const nextIndex = canvasHistoryIndex.value - 1
    const snapshot: CanvasHistorySnapshot | undefined = canvasHistorySnapshots.value[nextIndex]
    if (!snapshot) return false

    canvasHistoryIndex.value = nextIndex
    applyCanvasHistorySnapshot(snapshot)
    addLog('已撤销上一步画布操作', 'info')
    return true
  }

  const redoCanvasChange = () => {
    if (!canRedoCanvasChange.value) return false

    const nextIndex = canvasHistoryIndex.value + 1
    const snapshot: CanvasHistorySnapshot | undefined = canvasHistorySnapshots.value[nextIndex]
    if (!snapshot) return false

    canvasHistoryIndex.value = nextIndex
    applyCanvasHistorySnapshot(snapshot)
    addLog('已恢复下一步画布操作', 'info')
    return true
  }

  const syncUnsavedChangesState = () => {
    hasUnsavedChanges.value =
      hasExplicitUnsavedChanges.value ||
      hasStructureUnsavedChanges.value ||
      hasLayoutUnsavedChanges.value
  }

  const refreshUnsavedChanges = () => {
    hasStructureUnsavedChanges.value =
      getWorkflowStructureSignature() !== lastSavedWorkflowStructureSignature.value
    hasLayoutUnsavedChanges.value =
      getWorkflowLayoutSignature() !== lastSavedWorkflowLayoutSignature.value
    syncUnsavedChangesState()
  }

  const refreshStructureUnsavedChanges = () => {
    hasStructureUnsavedChanges.value =
      getWorkflowStructureSignature() !== lastSavedWorkflowStructureSignature.value
    syncUnsavedChangesState()
  }

  const refreshLayoutUnsavedChanges = () => {
    hasLayoutUnsavedChanges.value =
      getWorkflowLayoutSignature() !== lastSavedWorkflowLayoutSignature.value
    syncUnsavedChangesState()
  }

  const syncSavedWorkflowSignature = () => {
    lastSavedWorkflowStructureSignature.value = getWorkflowStructureSignature()
    lastSavedWorkflowLayoutSignature.value = getWorkflowLayoutSignature()
    hasExplicitUnsavedChanges.value = false
    hasStructureUnsavedChanges.value = false
    hasLayoutUnsavedChanges.value = false
    hasUnsavedChanges.value = false
  }

  const markWorkflowAsExplicitlyUnsaved = () => {
    hasExplicitUnsavedChanges.value = true
    syncUnsavedChangesState()
  }

  const handleNodeChangesForUnsavedState = (changes: NodeChange[]) => {
    if (!changes.length) return

    const shouldRefresh = changes.some((change) => change.type === 'add' || change.type === 'remove')

    if (shouldRefresh) {
      refreshStructureUnsavedChanges()
      refreshLayoutUnsavedChanges()
      pushCanvasHistorySnapshot()
    }
  }

  const handleEdgeChangesForUnsavedState = (changes: EdgeChange[]) => {
    if (!changes.length) return

    const shouldRefresh = changes.some((change) => change.type === 'add' || change.type === 'remove')

    if (shouldRefresh) {
      refreshStructureUnsavedChanges()
      pushCanvasHistorySnapshot()
    }
  }

  const handleNodeDragStopForUnsavedState = (_nodeId?: string) => {
    refreshLayoutUnsavedChanges()
    pushCanvasHistorySnapshot()
  }

  const resetWorkflowNodeRuntimeState = (sourceNodes: Array<WorkflowNode | WorkflowNodeSnapshot>): WorkflowNode[] =>
    sourceNodes.map((node) =>
      normalizeNodeConfigWithDefaults({
        ...(node as WorkflowNode),
        data: {
          ...node.data,
          status: 'idle' as const,
          output: node.data?.isPinned ? node.data.output : null,
        },
      }),
    )

  const restoreHistoricalWorkflowNodes = (
    sourceNodes: Array<WorkflowNode | WorkflowNodeSnapshot>,
  ): WorkflowNode[] =>
    sourceNodes.map((node) => normalizeNodeConfigWithDefaults(cloneJsonValue(node as WorkflowNode)))

  const createNewWorkflow = () => {
    nodes.value = []
    edges.value = []
    logs.value = []
    workflowName.value = '未命名工作流'
    currentWorkflowId.value = null
    isHistoryMode.value = false
    originalWorkflowState.value = null
    lastRunDashboard.value = null
    clearWorkflowVersionState()
    addLog('已创建新工作流', 'info')
    syncSavedWorkflowSignature()
    resetCanvasHistory()
  }

  const instantiateWorkflowFromTemplate = (workflow: WorkflowTemplateJsonDefinition) => {
    const sourceNodes = workflow.nodes ?? []
    const sourceEdges = workflow.edges ?? []
    const nodeIdMap = new Map<string, string>()

    const createdNodes: WorkflowNode[] = sourceNodes.map((templateNode) => {
      const nodeType = templateNode.data?.type
      const definition = nodeType ? getNodeDefinition(nodeType) : null
      if (!nodeType || !definition) {
        throw new Error(`模板引用了未注册节点: ${nodeType ?? 'unknown'}`)
      }

      const nextId = generateNodeId()
      nodeIdMap.set(templateNode.id, nextId)

      const label = templateNode.data?.label || templateNode.label || definition.displayName
      return normalizeNodeConfigWithDefaults({
        id: nextId,
        type: templateNode.type ?? 'custom',
        position: cloneJsonValue(templateNode.position ?? { x: 0, y: 0 }),
        label,
        data: {
          label,
          type: nodeType,
          category: definition.category,
          config: cloneJsonValue(templateNode.data?.config ?? {}),
          reuseLastRuntimeInputs: templateNode.data?.reuseLastRuntimeInputs ?? false,
          status: 'idle',
          output: null,
          manualInput: templateNode.data?.manualInput ?? '',
          useManualInput: templateNode.data?.useManualInput ?? false,
          isPinned: templateNode.data?.isPinned ?? false,
          logs: cloneJsonValue(templateNode.data?.logs ?? []),
          error: undefined,
        },
      })
    })

    const createdEdges: Edge[] = sourceEdges.map((templateEdge) => {
      const sourceId = nodeIdMap.get(templateEdge.source)
      const targetId = nodeIdMap.get(templateEdge.target)

      if (!sourceId || !targetId) {
        throw new Error('模板连线引用了不存在的节点')
      }

      return {
        id: generateEdgeId(),
        source: sourceId,
        target: targetId,
        type: templateEdge.type ?? 'n8n',
        animated: templateEdge.animated ?? true,
        sourceHandle: templateEdge.sourceHandle,
        targetHandle: templateEdge.targetHandle,
        label: templateEdge.label,
        data: cloneOptionalJsonValue(templateEdge.data),
        style: cloneOptionalJsonValue(templateEdge.style),
        markerStart: cloneOptionalJsonValue(templateEdge.markerStart),
        markerEnd: cloneOptionalJsonValue(templateEdge.markerEnd),
      }
    })

    return {
      workflowName: workflow.name || '未命名模板工作流',
      nodes: createdNodes,
      edges: createdEdges,
    }
  }

  const createWorkflowFromTemplate = (templateId: string) => {
    const template = getWorkflowTemplateDefinition(templateId)
    if (!template) {
      throw new Error(`未找到工作流模板: ${templateId}`)
    }
    const instantiated = instantiateWorkflowFromTemplate(template.workflow)

    nodes.value = instantiated.nodes
    edges.value = instantiated.edges
    logs.value = []
    workflowName.value = instantiated.workflowName
    currentWorkflowId.value = null
    isHistoryMode.value = false
    originalWorkflowState.value = null
    lastRunDashboard.value = null
    pendingConnection.value = null
    pendingExecution.value = null
    activeConfigNodeId.value = null
    activePreviewNodeId.value = null
    clearWorkflowVersionState()
    addLog(`已从模板创建工作流: ${template.name}`, 'info')
    needsViewReset.value = true
    syncSavedWorkflowSignature()
    markWorkflowAsExplicitlyUnsaved()
    resetCanvasHistory()
  }

  const saveWorkflow = async (name?: string) => {
    if (name) workflowName.value = name
    const id = currentWorkflowId.value || `wf_${Date.now()}`
    currentWorkflowId.value = id
    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const serializedNodes: WorkflowNodeSnapshot[] = serializeWorkflowNodes(currentNodes, {
      includePinnedOutput: true,
    })
    const workflow: SavedWorkflow = {
      id,
      name: workflowName.value,
      nodes: serializedNodes,
      edges: serializeWorkflowEdges(currentEdges),
      updatedAt: Date.now(),
    }
    await storageProvider.saveWorkflow(workflow)
    await refreshWorkflows()
    await loadWorkflowVersions(id)
    addLog(`工作流 "${workflow.name}" 已保存`, 'info')
    syncSavedWorkflowSignature()
    return workflow
  }

  const loadWorkflow = async (id: string) => {
    const workflow = await storageProvider.getWorkflow(id)
    if (workflow) {
      nodes.value = resetWorkflowNodeRuntimeState(workflow.nodes)
      edges.value = serializeWorkflowEdges(workflow.edges)
      workflowName.value = workflow.name
      currentWorkflowId.value = workflow.id
      addLog(`已加载工作流: ${workflow.name}`, 'info')
      needsViewReset.value = true
      lastRunDashboard.value = null
      await loadWorkflowVersions(workflow.id)
      syncSavedWorkflowSignature()
      resetCanvasHistory()
      selectedWorkflowVersionDetail.value = null
    }
  }

  const duplicateWorkflow = async (id: string, name?: string) => {
    const original = await storageProvider.getWorkflow(id)
    if (original) {
      const newId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
      const duplicatedName = name?.trim() || getDuplicatedWorkflowName(original.name)
      const duplicated: SavedWorkflow = {
        ...original,
        id: newId,
        name: duplicatedName,
        nodes: serializeWorkflowNodes(resetWorkflowNodeRuntimeState(original.nodes), {
          includePinnedOutput: true,
        }),
        updatedAt: Date.now(),
      }
      await storageProvider.saveWorkflow(duplicated)
      const updatedList = await refreshWorkflows()
      addLog(`工作流 "${original.name}" 已复制为 "${duplicated.name}"`, 'info')
      return updatedList
    }
    return null
  }

  const rollbackWorkflowVersion = async (
    versionId: string,
    workflowId = currentWorkflowId.value,
  ): Promise<WorkflowRollbackResult | null> => {
    if (!workflowId) return null

    const result = await storageProvider.rollbackWorkflowVersion(workflowId, versionId)
    if (!result) return null

    nodes.value = resetWorkflowNodeRuntimeState(result.workflow.nodes)
    edges.value = serializeWorkflowEdges(result.workflow.edges)
    workflowName.value = result.workflow.name
    currentWorkflowId.value = result.workflow.id
    isHistoryMode.value = false
    originalWorkflowState.value = null
    lastRunDashboard.value = null
    needsViewReset.value = true
    selectedWorkflowVersionDetail.value = null

    await refreshWorkflows()
    await loadWorkflowVersions(result.workflow.id)

    addLog(`已回滚到版本 ${versionId}`, 'warn')
    syncSavedWorkflowSignature()
    resetCanvasHistory()

    return result
  }

  const exportWorkflow = () => {
    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const cleanNodes: WorkflowNodeSnapshot[] = serializeWorkflowNodes(currentNodes).map((node) => {
      const { output: _output, ...dataWithoutOutput } = node.data
      return {
        ...node,
        data: dataWithoutOutput,
      }
    })
    const workflow = { name: workflowName.value, nodes: cleanNodes, edges: currentEdges }
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflowName.value}.json`
    a.click()
    URL.revokeObjectURL(url)
    addLog(`工作流已导出`, 'info')
  }

  const importWorkflow = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workflow = JSON.parse(e.target?.result as string)
        const importedNodes = resetWorkflowNodeRuntimeState(workflow.nodes || [])
        nodes.value = importedNodes
        edges.value = serializeWorkflowEdges(workflow.edges || [])
        workflowName.value = workflow.name || '导入的工作流'
        currentWorkflowId.value = null
        lastRunDashboard.value = null
        clearWorkflowVersionState()
        addLog(`成功导入工作流: ${workflowName.value}`, 'info')
        lastSavedWorkflowStructureSignature.value = getWorkflowStructureSignature()
        lastSavedWorkflowLayoutSignature.value = getWorkflowLayoutSignature()
        hasStructureUnsavedChanges.value = false
        hasLayoutUnsavedChanges.value = false
        markWorkflowAsExplicitlyUnsaved()
        resetCanvasHistory()
      } catch (_err) {
        addLog(`导入失败: 格式错误`, 'error')
      }
    }
    reader.readAsText(file)
  }

  const enterHistoryMode = (recordId: string) => {
    const currentHistory = getCurrentExecutionHistory()
    const record = currentHistory.find((entry) => entry.id === recordId)
    if (!record) return

    if (!isHistoryMode.value) {
      const currentNodes = getCurrentNodes()
      const currentEdges = getCurrentEdges()
      originalWorkflowState.value = {
        nodes: cloneWorkflowNodes(currentNodes),
        edges: cloneWorkflowEdges(currentEdges),
        name: workflowName.value,
        id: currentWorkflowId.value,
        lastRunDashboard: cloneOptionalJsonValue(lastRunDashboard.value),
      }
    }

    isHistoryMode.value = true
    nodes.value = restoreHistoricalWorkflowNodes(record.nodes)
    edges.value = cloneWorkflowEdges(record.edges)
    lastRunDashboard.value = {
      id: record.id,
      workflowName: record.workflowName,
      status: record.status,
      startTime: record.startTime,
      duration: record.duration,
      executionTargetIds: record.nodes
        .filter((node) => node.data.category === 'terminal')
        .map((node) => node.id),
      executionScopeNodeIds: record.nodes.map((node) => node.id),
      terminalNodeIds: record.nodes
        .filter((node) => node.data.category === 'terminal')
        .map((node) => node.id),
    }
    workflowName.value = `${record.workflowName} (历史记录: ${new Date(record.startTime).toLocaleString()})`
    addLog(`正在查看历史运行记录: ${new Date(record.startTime).toLocaleString()}`, 'info')
    needsViewReset.value = true
    resetCanvasHistory()
  }

  const exitHistoryMode = () => {
    if (!isHistoryMode.value || !originalWorkflowState.value) return

    nodes.value = originalWorkflowState.value.nodes
    edges.value = originalWorkflowState.value.edges
    workflowName.value = originalWorkflowState.value.name
    currentWorkflowId.value = originalWorkflowState.value.id
    lastRunDashboard.value = originalWorkflowState.value.lastRunDashboard

    isHistoryMode.value = false
    originalWorkflowState.value = null
    addLog('已返回工作流编辑模式', 'info')
    needsViewReset.value = true
    resetCanvasHistory()
  }

  const addLog = (message: string, level: 'info' | 'error' | 'warn' = 'info', nodeId?: string) => {
    logs.value.push({
      time: new Date().toLocaleTimeString(),
      level,
      message,
      nodeId,
    })
    if (logs.value.length > MAX_LOG_ENTRIES) {
      logs.value.splice(0, logs.value.length - MAX_LOG_ENTRIES)
    }
  }

  const formatExecutionErrorMessage = (message: string) => {
    if (message === '手动输入 JSON 格式错误') {
      return '手动输入 JSON 格式错误，请检查逗号、引号和括号是否完整'
    }
    if (message === '无可分析的输入数据') {
      return '当前节点没有可分析输入，请先检查上游输出或左侧模拟输入'
    }
    if (message === '至少需要 2 个数值字段才能进行相关性分析') {
      return '可用于分析的数值字段不足，至少需要 2 个数值字段'
    }
    if (message === '所选字段缺少足够的有效样本，无法完成相关性分析') {
      return '有效样本不足，请先检查缺失值、筛选条件或字段质量'
    }

    return message
  }

  const stopExecution = () => {
    if (isRunning.value || pendingExecution.value) {
      isStopping.value = true
      cancelActiveFileImportTasks()
      pendingExecution.value = null
      isRunning.value = false
      activeExecutionScope.value = null
      activeExecutionNodeId.value = null
      if (pendingExecutionResolver) {
        pendingExecutionResolver('STOPPED')
        pendingExecutionResolver = null
      }
      addLog('正在停止工作流...', 'warn')
    }
  }

  const cancelPendingExecution = () => {
    if (!pendingExecution.value) return

    if (pendingExecution.value.executionScope === 'global') {
      skipGlobalRunSummaryOnCancel = true
      isStopping.value = true
      pendingExecution.value = null
      isRunning.value = false
      activeExecutionScope.value = null
      activeExecutionNodeId.value = null
      if (pendingExecutionResolver) {
        pendingExecutionResolver('STOPPED')
        pendingExecutionResolver = null
      }
      addLog('正在停止工作流...', 'warn')
      return
    }

    pendingExecution.value = null
    isRunning.value = false
    isStopping.value = false
    activeExecutionScope.value = null
    activeExecutionNodeId.value = null
  }

  const getCategoryByType = (type: string): 'trigger' | 'action' | 'terminal' => {
    const definition = getNodeDefinition(type)
    return definition ? definition.category : 'action'
  }

  const getNodeInputLimits = (nodeType: string) => {
    const definition = getNodeDefinition(nodeType)
    return {
      inputMode: (definition?.inputMode ?? 'single') as 'single' | 'multiple',
      maxInputs: definition?.maxInputs as number | null | undefined,
    }
  }

  const applyNodeConfigDefaults = (node: WorkflowNode) => {
    const definition = getNodeDefinition(node.data.type)
    if (!definition) return null

    const nextConfig = { ...(node.data.config ?? {}) }
    let changed = false

    definition.properties.forEach((property) => {
      if (nextConfig[property.name] === undefined && property.default !== undefined) {
        nextConfig[property.name] = property.default
        changed = true
      }
    })

    if (changed) {
      node.data.config = nextConfig
    }

    return {
      definition,
      config: changed ? nextConfig : node.data.config,
    }
  }

  const getVisibleRuntimeProperties = (node: WorkflowNode) => {
    const resolvedNode = applyNodeConfigDefaults(node)
    const definition = resolvedNode?.definition
    const resolvedConfig = resolvedNode?.config ?? node.data.config
    if (!definition || definition.category !== 'trigger') return []

    return definition.properties.filter(
      (property) => property.isRuntimeInput && (!property.displayIf || property.displayIf(resolvedConfig)),
    )
  }

  const shouldPromptForRuntimeInput = (node: WorkflowNode) => {
    const visibleRuntimeProperties = getVisibleRuntimeProperties(node)
    if (visibleRuntimeProperties.length === 0) return false

    const resolvedConfig = node.data.config
    return visibleRuntimeProperties.some(
      (property) =>
        property.required &&
        !isValueValid(resolvedConfig[property.name], property.type),
    )
  }

  const resetRuntimeInputValues = (node: WorkflowNode) => {
    const resolvedNode = applyNodeConfigDefaults(node)
    const definition = resolvedNode?.definition
    if (!definition || definition.category !== 'trigger' || node.data.reuseLastRuntimeInputs) return

    const nextConfig = { ...(resolvedNode?.config ?? node.data.config) }
    definition.properties.forEach((property) => {
      if (!property.isRuntimeInput) return
      nextConfig[property.name] = property.default ?? null
    })
    node.data.config = nextConfig
  }

  const resetNodeRuntimeInputs = (nodeId: string) => {
    const node = findNodeById(nodeId)
    if (!node) return

    const resolvedNode = applyNodeConfigDefaults(node)
    const definition = resolvedNode?.definition
    if (!definition || definition.category !== 'trigger') return

    const nextConfig = { ...(resolvedNode?.config ?? node.data.config) }
    definition.properties.forEach((property) => {
      if (!property.isRuntimeInput) return
      nextConfig[property.name] = property.default ?? null
    })

    node.data.reuseLastRuntimeInputs = false
    node.data.config = nextConfig
    refreshUnsavedChanges()
  }

  const setFileImportTaskState = (nodeId: string, taskState: FileImportTaskState) => {
    fileImportTasks.value = {
      ...fileImportTasks.value,
      [nodeId]: taskState,
    }
  }

  const updateFileImportTaskProgress = (
    nodeId: string,
    progress: FileImportProgress,
  ) => {
    const currentTask = fileImportTasks.value[nodeId]
    if (!currentTask) return

    setFileImportTaskState(nodeId, {
      ...currentTask,
      phase: progress.phase,
      progress: progress.progress,
    })
  }

  const clearFileImportTaskState = (nodeId: string) => {
    if (!(nodeId in fileImportTasks.value)) return

    const nextState = { ...fileImportTasks.value }
    delete nextState[nodeId]
    fileImportTasks.value = nextState
  }

  const cancelActiveFileImportTasks = () => {
    activeFileImportCancels.forEach((cancel) => {
      cancel()
    })
    activeFileImportCancels.clear()
    fileImportTasks.value = {}
  }

  const collectUpstreamNodeIds = (targetNodeId: string, acc = new Set<string>()) => {
    if (acc.has(targetNodeId)) return acc
    acc.add(targetNodeId)
    const currentEdges = getCurrentEdges()
    currentEdges
      .filter((edge) => edge.target === targetNodeId)
      .forEach((edge) => collectUpstreamNodeIds(edge.source, acc))
    return acc
  }

  const validateConnection = (
    sourceNodeId: string,
    targetNodeId: string,
  ): { valid: boolean; message?: string } => {
    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const sourceNode = currentNodes.find((n) => n.id === sourceNodeId)
    const targetNode = currentNodes.find((n) => n.id === targetNodeId)
    if (!sourceNode || !targetNode) return { valid: false, message: '节点不存在' }
    const sourceCat = sourceNode.data.category as keyof typeof CONNECTION_RULES
    const targetCat = targetNode.data.category
    if (!CONNECTION_RULES[sourceCat]?.includes(targetCat)) {
      const msg = `流程规范限制: ${sourceCat} 无法连接到 ${targetCat}`
      addLog(msg, 'error')
      return { valid: false, message: msg }
    }

    const targetIncomingEdges = currentEdges.filter((edge) => edge.target === targetNodeId)
    const { inputMode, maxInputs } = getNodeInputLimits(targetNode.data.type)

    if (inputMode === 'single' && targetIncomingEdges.length >= 1) {
      const msg = `流程规范限制: 节点 ${targetNode.data.label} 只允许一个上游输入`
      addLog(msg, 'error')
      return { valid: false, message: msg }
    }

    if (inputMode === 'multiple' && typeof maxInputs === 'number' && targetIncomingEdges.length >= maxInputs) {
      const msg = `流程规范限制: 节点 ${targetNode.data.label} 最多允许 ${maxInputs} 个输入`
      addLog(msg, 'error')
      return { valid: false, message: msg }
    }

    return { valid: true }
  }

  const addAndConnectNode = (type: string, label: string, position: { x: number; y: number }) => {
    const category = getCategoryByType(type)
    const defaultConfig = getDefaultConfigForType(type)
    const newNode: WorkflowNode = {
      id: generateNodeId(),
      type: 'custom',
      position,
      label,
      data: {
        label,
        type,
        category,
        status: 'idle',
        config: defaultConfig,
        reuseLastRuntimeInputs: false,
        logs: [],
        useManualInput: false,
        manualInput: '',
        isPinned: false,
      },
    }
    const currentNodes = getCurrentNodes()
    const nextNodes: WorkflowNode[] = [...currentNodes, newNode]
    nodes.value = nextNodes

    const currentPendingConnection = pendingConnection.value
    if (currentPendingConnection) {
      const currentEdges = getCurrentEdges()
      const { sourceNodeId, sourceHandleId, edgeId } = currentPendingConnection
      if (edgeId) {
        const oldEdge = currentEdges.find((e) => e.id === edgeId)
        if (oldEdge) {
          const targetNodeId = oldEdge.target
          const nextEdges: Edge[] = [
            ...currentEdges.filter((e) => e.id !== edgeId),
            {
              id: generateEdgeId(),
              source: sourceNodeId,
              target: newNode.id,
              type: 'n8n',
              animated: true,
            },
            {
              id: generateEdgeId(),
              source: newNode.id,
              target: targetNodeId,
              type: 'n8n',
              animated: true,
            },
          ]
          edges.value = nextEdges
        }
      } else {
        const nextEdges: Edge[] = [
          ...currentEdges,
          {
            id: generateEdgeId(),
            source: sourceNodeId,
            target: newNode.id,
            sourceHandle: sourceHandleId,
            type: 'n8n',
            animated: true,
          },
        ]
        edges.value = nextEdges
      }
      pendingConnection.value = null
    }
    refreshUnsavedChanges()
    pushCanvasHistorySnapshot()
    return newNode
  }

  const createNodeFromDefinition = (
    type: string,
    label?: string,
    position: { x: number; y: number } = { x: 200, y: 200 },
    config?: Record<string, unknown>,
  ) => {
    const definition = getNodeDefinition(type)
    if (!definition) {
      throw new Error(`未找到节点定义: ${type}`)
    }

    const node = addAndConnectNode(type, label || definition.displayName, position)
    if (!node) {
      throw new Error(`创建节点失败: ${type}`)
    }

    if (config) {
      node.data.config = {
        ...node.data.config,
        ...cloneJsonValue(config),
      }
      refreshUnsavedChanges()
    }

    return node
  }

  const updateNodeConfigById = (nodeId: string, config: Record<string, unknown>) => {
    const node = findNodeById(nodeId)
    if (!node) {
      throw new Error(`未找到节点: ${nodeId}`)
    }
    node.data.config = {
      ...node.data.config,
      ...cloneJsonValue(config),
    }
    refreshUnsavedChanges()
    return node
  }

  const renameNodeById = (nodeId: string, label: string) => {
    const node = findNodeById(nodeId)
    if (!node) {
      throw new Error(`未找到节点: ${nodeId}`)
    }
    node.data.label = label
    node.label = label
    refreshUnsavedChanges()
    return node
  }

  const setNodePositionById = (nodeId: string, position: { x: number; y: number }) => {
    const node = findNodeById(nodeId)
    if (!node) {
      throw new Error(`未找到节点: ${nodeId}`)
    }
    node.position = cloneJsonValue(position)
    refreshLayoutUnsavedChanges()
    pushCanvasHistorySnapshot()
    return node
  }

  const connectNodesById = (
    sourceNodeId: string,
    targetNodeId: string,
    options?: { sourceHandle?: string; targetHandle?: string },
  ) => {
    const validation = validateConnection(sourceNodeId, targetNodeId)
    if (!validation.valid) {
      throw new Error(validation.message ?? '节点连接不合法')
    }

    const currentEdges = getCurrentEdges()
    const duplicatedEdge = currentEdges.find(
      (edge) =>
        edge.source === sourceNodeId &&
        edge.target === targetNodeId &&
        edge.sourceHandle === options?.sourceHandle &&
        edge.targetHandle === options?.targetHandle,
    )
    if (duplicatedEdge) {
      return duplicatedEdge
    }

    const nextEdge: Edge = {
      id: generateEdgeId(),
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle: options?.sourceHandle,
      targetHandle: options?.targetHandle,
      type: 'n8n',
      animated: true,
    }
    edges.value = [...currentEdges, nextEdge]
    refreshUnsavedChanges()
    pushCanvasHistorySnapshot()
    return nextEdge
  }

  const resolvePlanNodeRef = (refId: string, nodeIdMap: Record<string, string>) => {
    return nodeIdMap[refId] ?? refId
  }

  const createEditableSnapshot = () => {
    const snapshotId = `ai_snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    editableSnapshots.value = [
      {
        id: snapshotId,
        workflowName: workflowName.value,
        workflowId: currentWorkflowId.value,
        nodes: cloneWorkflowNodes(getCurrentNodes()),
        edges: cloneWorkflowEdges(getCurrentEdges()),
      },
      ...editableSnapshots.value,
    ].slice(0, 10)
    return snapshotId
  }

  const restoreEditableSnapshot = (snapshotId: string) => {
    const snapshot = editableSnapshots.value.find((entry) => entry.id === snapshotId)
    if (!snapshot) return false

    nodes.value = cloneJsonValue(snapshot.nodes) as WorkflowNode[]
    edges.value = cloneJsonValue(snapshot.edges) as Edge[]
    workflowName.value = snapshot.workflowName
    currentWorkflowId.value = snapshot.workflowId
    needsViewReset.value = true
    refreshUnsavedChanges()
    resetCanvasHistory()
    return true
  }

  const validateWorkflowAiPlan = (plan: WorkflowAiPlan): WorkflowAiPlanValidationResult => {
    return validateWorkflowAiPlanAgainstContext(plan, {
      nodeCatalog: buildWorkflowAiNodeCatalog(),
      existingNodes: getCurrentNodes().map((node) => ({
        id: node.id,
        type: node.data.type,
        config: node.data.config,
      })),
      existingEdges: getCurrentEdges().map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    })
  }

  const applyWorkflowAiPlan = (plan: WorkflowAiPlan): WorkflowAiPlanApplyResult => {
    const validation = validateWorkflowAiPlan(plan)
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join('；'))
    }

    const snapshotId = createEditableSnapshot()
    const nodeIdMap: Record<string, string> = {}

    for (const operation of plan.operations) {
      if (operation.type === 'createNode') {
        const createdNode = createNodeFromDefinition(
          operation.nodeType,
          operation.nodeLabel,
          operation.position,
          operation.config,
        )
        nodeIdMap[operation.id] = createdNode.id
        continue
      }

      if (operation.type === 'updateNodeConfig') {
        updateNodeConfigById(resolvePlanNodeRef(operation.nodeRef, nodeIdMap), operation.config)
        continue
      }

      if (operation.type === 'renameNode') {
        renameNodeById(resolvePlanNodeRef(operation.nodeRef, nodeIdMap), operation.label)
        continue
      }

      if (operation.type === 'removeNode') {
        removeNode(resolvePlanNodeRef(operation.nodeRef, nodeIdMap))
        continue
      }

      if (operation.type === 'connectNodes') {
        connectNodesById(
          resolvePlanNodeRef(operation.sourceRef, nodeIdMap),
          resolvePlanNodeRef(operation.targetRef, nodeIdMap),
          {
            sourceHandle: operation.sourceHandle,
            targetHandle: operation.targetHandle,
          },
        )
        continue
      }

      if (operation.type === 'disconnectEdge') {
        removeEdge(operation.edgeRef)
        continue
      }

      if (operation.type === 'moveNode') {
        setNodePositionById(resolvePlanNodeRef(operation.nodeRef, nodeIdMap), operation.position)
      }
    }

    markWorkflowAsExplicitlyUnsaved()
    addLog(`AI编排计划已应用: ${plan.summary}`, 'info')

    return {
      applied: true,
      snapshotId,
      nodeIdMap,
    }
  }

  const duplicateNode = (nodeId: string) => {
    const currentNodes = getCurrentNodes()
    const original = currentNodes.find((n) => n.id === nodeId)
    if (!original) return null

    const newNode = cloneJsonValue(original)
    newNode.id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    newNode.position = {
      x: original.position.x + 40,
      y: original.position.y + 40,
    }
    newNode.data.label = `${original.data.label} (副本)`
    newNode.data.config = stripRuntimeInputValuesFromConfig(newNode.data.type, newNode.data.config)
    newNode.data.status = 'idle'
    newNode.data.output = null
    newNode.data.logs = []

    nodes.value = [...currentNodes, newNode]
    addLog(`已复制节点: ${original.data.label}`, 'info')
    refreshUnsavedChanges()
    pushCanvasHistorySnapshot()
    return newNode
  }

  const removeNode = (nodeId: string) => {
    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const removedNode = currentNodes.find((node) => node.id === nodeId)
    if (!removedNode) return null

    const nextNodes: WorkflowNode[] = currentNodes.filter((node) => node.id !== nodeId)
    const nextEdges: Edge[] = currentEdges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    )

    nodes.value = nextNodes
    edges.value = nextEdges
    addLog(`已删除节点: ${removedNode.data.label}`, 'warn')
    refreshUnsavedChanges()
    pushCanvasHistorySnapshot()
    return removedNode
  }

  const removeSelectedNodes = () => {
    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const selectedNodes = currentNodes.filter((node) => node.selected)
    if (!selectedNodes.length) return []

    const selectedIds = new Set(selectedNodes.map((node) => node.id))
    nodes.value = currentNodes.filter((node) => !selectedIds.has(node.id))
    edges.value = currentEdges.filter(
      (edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target),
    )
    addLog(`已批量删除 ${selectedNodes.length} 个节点`, 'warn')
    refreshUnsavedChanges()
    pushCanvasHistorySnapshot()
    return selectedNodes
  }

  const removeEdge = (edgeId: string) => {
    const currentEdges = getCurrentEdges()
    const nextEdges: Edge[] = currentEdges.filter((edge) => edge.id !== edgeId)
    edges.value = nextEdges
    refreshUnsavedChanges()
    pushCanvasHistorySnapshot()
  }

  const setPendingConnection = (nextConnection: PendingConnectionState) => {
    pendingConnection.value = nextConnection
  }

  const setActiveConfigNodeId = (nodeId: string | null) => {
    activeConfigNodeId.value = nodeId
  }

  const setActivePreviewNodeId = (nodeId: string | null) => {
    activePreviewNodeId.value = nodeId
  }

  const isValueValid = (value: any, type: string) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    if (type === 'file') {
      return value instanceof File || (typeof value === 'object' && value.name)
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0
    }
    return true
  }

  const toStoredOutput = (value: any) => {
    if (!isNodeResult(value)) return value
    return normalizeNodeResult(value)
  }

  const toExecutionInputValue = (value: any) => {
    if (!isNodeResult(value)) return value
    return normalizeNodeResult(value)
  }

  const cloneOutputForHistory = (output: WorkflowNodeOutput): WorkflowNodeOutput => {
    if (!output) return output
    if (!isNodeResult(output)) return cloneOptionalJsonValue(output)

    return {
      kind: output.kind,
      payload: cloneOptionalJsonValue(output.payload),
      schema: cloneOptionalJsonValue(output.schema),
      meta: cloneOptionalJsonValue(output.meta),
      preview: cloneOptionalJsonValue(output.preview),
      lineage: cloneOptionalJsonValue(output.lineage),
    }
  }

  const yieldExecutionForUiPaint = async () => {
    await nextTick()

    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve())
        return
      }

      setTimeout(resolve, 0)
    })
  }

  const createExecutionSnapshotNodes = (sourceNodes: WorkflowNode[]): WorkflowNodeSnapshot[] =>
    sourceNodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: cloneJsonValue(node.position),
      label: node.label,
      selected: node.selected,
      dragging: node.dragging,
      data: {
        label: node.data.label,
        type: node.data.type,
        category: node.data.category,
        config: cloneJsonValue(node.data.config ?? {}),
        reuseLastRuntimeInputs: node.data.reuseLastRuntimeInputs,
        status: node.data.status,
        output: cloneOutputForHistory(node.data.output ?? null),
        manualInput: node.data.manualInput,
        useManualInput: node.data.useManualInput,
        isPinned: node.data.isPinned,
        logs: cloneJsonValue(node.data.logs ?? []),
        error: node.data.error,
      },
    }))

  const executeNode = async (
    nodeId: string,
    forceUpdate = false,
    executionScope: 'single' | 'global' = 'single',
    debugOptions: DebugExecutionOptions = {},
  ): Promise<any> => {
    const currentNodes = getCurrentNodes()
    const node = findNodeById(nodeId, currentNodes)
    if (!node) return
    const rerunUpstream = debugOptions.rerunUpstream ?? false
    const isNestedDebugExecution = debugOptions.isNested ?? false

    const wasRunning = isRunning.value
    const isTopLevelExecution = !isNestedDebugExecution
    if (!wasRunning) {
      isRunning.value = true
      isStopping.value = false
    }
    if (isTopLevelExecution) {
      activeExecutionScope.value = executionScope
      activeExecutionNodeId.value = nodeId
    }

    try {
      if (isStopping.value) throw new Error('User Aborted')

      if (node.data.isPinned && node.data.output) {
        addLog(`节点 ${node.data.label} 已冻结，使用历史输出数据`, 'info', nodeId)
        node.data.status = 'success'
        return node.data.output
      }

      const resolvedNode = applyNodeConfigDefaults(node)
      const resolvedConfig = resolvedNode?.config ?? node.data.config
      if (!resolvedNode?.definition) {
        addLog(`未找到定义: ${node.data.type}`, 'error', nodeId)
        return
      }
      const definition = resolvedNode.definition

      if (!forceUpdate && node.data.output) return node.data.output

      if (executionScope === 'single' && forceUpdate && !isNestedDebugExecution) {
        addLog(
          rerunUpstream
            ? `调试策略: 强制重跑上游后执行节点 ${node.data.label}`
            : `调试策略: 复用上游缓存，仅重新执行节点 ${node.data.label}`,
          rerunUpstream ? 'warn' : 'info',
          nodeId,
        )
      }

      if (definition.category === 'trigger') {
        if (shouldPromptForRuntimeInput(node)) {
          addLog(`节点 ${node.data.label} 缺少运行时输入`, 'info', nodeId)
          const queueIndex =
            executionScope === 'global' ? globalRuntimeQueueNodeIds.indexOf(nodeId) : -1
          pendingExecution.value = {
            nodeId,
            resumeNodeId: executionScope === 'single' ? nodeId : undefined,
            forceUpdate,
            executionScope,
            debugOptions: {
              rerunUpstream,
            },
            promptIndex: queueIndex >= 0 ? queueIndex + 1 : undefined,
            promptTotal:
              executionScope === 'global' && globalRuntimeQueueNodeIds.length > 0
                ? globalRuntimeQueueNodeIds.length
                : undefined,
          }
          if (executionScope === 'single') {
            isRunning.value = false
          }
          return 'WAIT_INPUT'
        }
      }

      node.data.status = 'running'
      node.data.error = undefined
      await yieldExecutionForUiPaint()

      if (isStopping.value) throw new Error('User Aborted')

      if (node.data.useManualInput) {
        addLog(`节点 ${node.data.label} 使用手动模拟输入运行`, 'info', nodeId)
        let parsedInput = node.data.manualInput
        if (typeof parsedInput === 'string' && parsedInput.trim()) {
          try {
            parsedInput = JSON.parse(parsedInput)
          } catch (e) {
            throw new Error('手动输入 JSON 格式错误')
          }
        }
        const result = await definition.execute(parsedInput, resolvedConfig)
        node.data.output = markRaw(toStoredOutput(result))
        node.data.status = 'success'
        node.data.error = undefined
        return node.data.output
      }

      if (node.data.type === 'file-import') {
        const file = resolvedConfig.fileData as File | undefined
        if (!file) {
          throw new Error('未选择任何文件')
        }

        const fileImportOptions: FileImportParseOptions = {
          format: typeof resolvedConfig.format === 'string' ? resolvedConfig.format : 'auto',
          autoClean: resolvedConfig.autoClean !== false,
          excludeFields: resolvedConfig.excludeFields as string[] | string | undefined,
        }

        setFileImportTaskState(nodeId, {
          phase: 'reading',
          progress: 0,
          fileName: file.name,
          format: fileImportOptions.format ?? 'auto',
          canCancel: true,
          startedAt: Date.now(),
        })

        const task = createFileImportTask(file, fileImportOptions, (progress) => {
          updateFileImportTaskProgress(nodeId, progress)
        })
        activeFileImportCancels.set(nodeId, task.cancel)

        let result
        try {
          result = await task.result
        } catch (error) {
          if (isStopping.value || isFileImportCancelledError(error)) {
            throw new Error('User Aborted')
          }
          throw error
        } finally {
          activeFileImportCancels.delete(nodeId)
          clearFileImportTaskState(nodeId)
        }

        if (isStopping.value) throw new Error('User Aborted')

        node.data.output = markRaw(toStoredOutput(result))
        node.data.status = 'success'
        node.data.error = undefined
        resetRuntimeInputValues(node)
        addLog(`执行成功: ${node.data.label}`, 'info', nodeId)
        return node.data.output
      }

      const currentEdges = getCurrentEdges()
      const incomingEdges = currentEdges.filter((e) => e.target === nodeId)
      const inputs: unknown[] = []
      const structuredInputs: MultipleNodeExecutionItem[] = []
      for (const [index, edge] of incomingEdges.entries()) {
        if (isStopping.value) throw new Error('User Aborted')
        const shouldForceUpstream =
          executionScope === 'global' ? forceUpdate : rerunUpstream
        const result = await executeNode(edge.source, shouldForceUpstream, executionScope, {
          rerunUpstream,
          isNested: true,
        })
        if (result === 'WAIT_INPUT' || result === 'STOPPED') {
          if (result === 'WAIT_INPUT' && executionScope === 'single' && pendingExecution.value) {
            pendingExecution.value = {
              ...pendingExecution.value,
              resumeNodeId: nodeId,
              debugOptions: {
                rerunUpstream,
              },
            }
          }
          node.data.status = 'idle'
          return result
        }
        const sourceNode = findNodeById(edge.source, currentNodes)
        const normalizedResult = isNodeResult(result) ? normalizeNodeResult(result) : null
        const executionValue = toExecutionInputValue(result)
        inputs.push(executionValue)
        structuredInputs.push({
          sourceNodeId: edge.source,
          sourceNodeLabel: sourceNode?.data.label ?? edge.source,
          edgeId: edge.id,
          order: index,
          result: normalizedResult ?? null,
        })
      }

      const { inputMode, minInputs } = {
        inputMode: definition.inputMode ?? 'single',
        minInputs: definition.minInputs ?? 0,
      }

      if (inputMode === 'multiple' && structuredInputs.length < minInputs) {
        throw new Error(`节点 ${node.data.label} 至少需要 ${minInputs} 个输入`)
      }

      if (isStopping.value) throw new Error('User Aborted')

      const executionInput: MultipleNodeExecutionInput | unknown | null =
        inputMode === 'multiple'
          ? { inputs: structuredInputs }
          : inputs[0] || null

      const result = await definition.execute(executionInput, resolvedConfig)
      if (isStopping.value) throw new Error('User Aborted')

      node.data.output = markRaw(toStoredOutput(result))
      node.data.status = 'success'
      node.data.error = undefined
      if (definition.category === 'trigger') {
        resetRuntimeInputValues(node)
      }
      addLog(`执行成功: ${node.data.label}`, 'info', nodeId)
      return node.data.output
    } catch (error: any) {
      const rawMessage = error?.message ?? '节点执行失败'
      const readableMessage = formatExecutionErrorMessage(rawMessage)
      if (node) {
        node.data.status = rawMessage === 'User Aborted' ? 'idle' : 'error'
        node.data.error = rawMessage === 'User Aborted' ? undefined : readableMessage
      }
      if (rawMessage !== 'User Aborted') {
        addLog(`执行失败: ${readableMessage}`, 'error', nodeId)
        throw new Error(readableMessage)
      }
      return 'STOPPED'
    } finally {
      if (!wasRunning) isRunning.value = false
      if (isTopLevelExecution) {
        activeExecutionScope.value = null
        activeExecutionNodeId.value = null
      }
    }
  }

  const resumePendingExecution = async () => {
    const pending = pendingExecution.value
    if (!pending) return null

    pendingExecution.value = null
    const result = await executeNode(
      pending.executionScope === 'single'
        ? (pending.resumeNodeId ?? pending.nodeId)
        : pending.nodeId,
      pending.forceUpdate,
      pending.executionScope ?? 'single',
      pending.debugOptions ?? {},
    )

    if (pending.executionScope === 'global' && pendingExecutionResolver) {
      pendingExecutionResolver(result === 'STOPPED' ? 'STOPPED' : 'RESUMED')
      pendingExecutionResolver = null
    }

    return result
  }

  const executeForAiInspection = async (nodeId: string) => {
    const stateSnapshot = {
      nodes: cloneInspectionValue(getCurrentNodes()),
      edges: cloneInspectionValue(getCurrentEdges()),
      logs: cloneInspectionValue(logs.value),
      fileImportTasks: cloneInspectionValue(fileImportTasks.value),
      pendingExecution: cloneInspectionValue(pendingExecution.value),
      isRunning: isRunning.value,
      isStopping: isStopping.value,
      globalRuntimeQueueNodeIds: [...globalRuntimeQueueNodeIds],
      lastExecutedTerminalNodeId: lastExecutedTerminalNodeId.value,
    }

    try {
      const result = await executeNode(nodeId, true, 'single', {
        rerunUpstream: true,
      })

      if (result === 'WAIT_INPUT' || result === 'STOPPED') {
        return null
      }

      return cloneInspectionValue(result)
    } finally {
      nodes.value = stateSnapshot.nodes
      edges.value = stateSnapshot.edges
      logs.value = stateSnapshot.logs
      fileImportTasks.value = stateSnapshot.fileImportTasks
      pendingExecution.value = stateSnapshot.pendingExecution
      isRunning.value = stateSnapshot.isRunning
      isStopping.value = stateSnapshot.isStopping
      globalRuntimeQueueNodeIds = stateSnapshot.globalRuntimeQueueNodeIds
      lastExecutedTerminalNodeId.value = stateSnapshot.lastExecutedTerminalNodeId
    }
  }

  const runGlobal = async () => {
    if (isRunning.value) return

    skipGlobalRunSummaryOnCancel = false
    isRunning.value = true
    isStopping.value = false
    activeExecutionScope.value = 'global'
    activeExecutionNodeId.value = null
    lastRunDashboard.value = null
    const startTime = Date.now()
    addLog('开始全局运行...', 'info')

    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const terminalNodes = currentNodes.filter((n) => n.data.category === 'terminal')
    const fallbackLeafNodes = currentNodes.filter(
      (node) => !currentEdges.some((edge) => edge.source === node.id),
    )
    const executionTargets = terminalNodes.length > 0 ? terminalNodes : fallbackLeafNodes

    if (executionTargets.length === 0) {
      addLog('运行失败: 工作流中没有可执行节点', 'error')
      isRunning.value = false
      return
    }
    if (terminalNodes.length === 0) {
      addLog('未检测到分析模型，已切换为末端节点执行模式', 'warn')
    }

    currentNodes.forEach((node) => {
      if (!node.data.isPinned) {
        node.data.status = 'idle'
        node.data.output = null
        node.data.error = undefined
      }
    })

    let finalStatus: 'success' | 'error' | 'stopped' = 'success'
    const executionScopeNodeIds = new Set<string>()
    try {
      executionTargets.forEach((node) => {
        collectUpstreamNodeIds(node.id, executionScopeNodeIds)
      })
      globalRuntimeQueueNodeIds = currentNodes
        .filter((node) => executionScopeNodeIds.has(node.id))
        .filter((node) => shouldPromptForRuntimeInput(node))
        .map((node) => node.id)

      let lastResultId = null
      for (const node of executionTargets) {
        if (isStopping.value) {
          finalStatus = 'stopped'
          break
        }
        let result = await executeNode(node.id, false, 'global')
        while (result === 'WAIT_INPUT') {
          if (isStopping.value || !pendingExecution.value) {
            result = 'STOPPED'
            break
          }
          const resumed = await new Promise<'RESUMED' | 'STOPPED'>((resolve) => {
            pendingExecutionResolver = resolve
          })
          if (resumed === 'STOPPED') {
            result = 'STOPPED'
            break
          }
          result = await executeNode(node.id, false, 'global')
        }
        if (result === 'STOPPED') {
          finalStatus = 'stopped'
          break
        }
        lastResultId = node.id
      }
      lastExecutedTerminalNodeId.value = terminalNodes.length > 0 ? lastResultId : null
    } catch (err) {
      finalStatus = 'error'
      addLog(`全局运行中断: ${err}`, 'error')
    } finally {
      globalRuntimeQueueNodeIds = []
      isRunning.value = false
      isStopping.value = false
      activeExecutionScope.value = null
      activeExecutionNodeId.value = null
      const duration = Date.now() - startTime

      if (finalStatus === 'stopped' && skipGlobalRunSummaryOnCancel) {
        skipGlobalRunSummaryOnCancel = false
        addLog('已取消本次运行', 'info')
        return
      }

      addLog(
        '工作流运行结束',
        finalStatus === 'stopped' ? 'warn' : finalStatus === 'error' ? 'error' : 'info',
      )

      lastRunDashboard.value = {
        id: `run_${startTime}`,
        workflowName: workflowName.value,
        status: finalStatus,
        startTime,
        duration,
        executionTargetIds: executionTargets.map((node) => node.id),
        executionScopeNodeIds: [...executionScopeNodeIds],
        terminalNodeIds: terminalNodes.map((node) => node.id),
      }

      const record: ExecutionRecord = {
        id: `exec_${Date.now()}`,
        workflowId: currentWorkflowId.value || 'temp',
        workflowName: workflowName.value,
        startTime,
        duration,
        status: finalStatus,
        nodes: createExecutionSnapshotNodes(currentNodes),
        edges: cloneWorkflowEdges(currentEdges),
      }
      await saveExecution(record)
    }
  }

  const runGlobalAndCollect = async (): Promise<WorkflowExecutionResult> => {
    await runGlobal()
    const latestRecord = executionHistory.value[0] ?? null
    return {
      ok: Boolean(lastRunDashboard.value) && lastRunDashboard.value?.status !== 'error',
      scope: 'global',
      executionId: latestRecord?.id ?? null,
      status: lastRunDashboard.value?.status ?? 'idle',
      dashboardSummary: lastRunDashboard.value ? cloneJsonValue(lastRunDashboard.value) : null,
      nodeResults: latestRecord ? cloneJsonValue(latestRecord.nodes) : [],
    }
  }

  const debugNodeAndCollect = async (
    nodeId: string,
    options: DebugExecutionOptions = {},
  ): Promise<WorkflowNodeDebugResult> => {
    const result = await executeNode(nodeId, true, 'single', options)
    if (result === 'WAIT_INPUT') {
      return {
        ok: false,
        scope: 'single',
        nodeId,
        status: 'waiting_input',
        output: null,
      }
    }
    if (result === 'STOPPED') {
      return {
        ok: false,
        scope: 'single',
        nodeId,
        status: 'stopped',
        output: null,
      }
    }
    const currentNode = findNodeById(nodeId)
    return {
      ok: currentNode?.data.status === 'success',
      scope: 'single',
      nodeId,
      status: currentNode?.data.status === 'error' ? 'error' : 'success',
      output: cloneInspectionValue(result),
    }
  }

  const saveExecution = async (record: ExecutionRecord) => {
    try {
      const limitedHistory = await storageProvider.saveHistory(record, 20)
      executionHistory.value = limitedHistory
    } catch (e) {
      console.warn('Failed to save history, falling back to memory:', e)
      const currentHistory = getCurrentExecutionHistory()
      const newHistory: ExecutionRecord[] = [record, ...currentHistory].slice(0, 20)
      executionHistory.value = newHistory
      addLog(`保存历史记录到存储失败，已保存至内存`, 'warn')
    }
  }

  const loadHistory = async (options: { suppressErrors?: boolean } = {}) => {
    try {
      const loadedHistory = (await storageProvider.getAllHistory()) as ExecutionRecord[]
      executionHistory.value = loadedHistory
    } catch (e) {
      console.error('Failed to load history:', e)
      if (!options.suppressErrors) {
        throw e
      }
    }
  }

  const clearHistory = async (options: { suppressErrors?: boolean } = {}) => {
    try {
      await storageProvider.clearAllHistory()
      executionHistory.value = []
      addLog('运行历史记录已清空', 'info')
    } catch (e) {
      addLog(`清空历史记录失败: ${e}`, 'error')
      if (!options.suppressErrors) {
        throw e
      }
    }
  }

  void loadHistory({ suppressErrors: true })
  void loadCurrentStorageUser()
  syncSavedWorkflowSignature()
  resetCanvasHistory()
  watch(
    workflowName,
    () => {
      refreshUnsavedChanges()
    },
    { flush: 'sync' },
  )

  return {
    nodes,
    edges,
    logs,
    workflowName,
    currentWorkflowId,
    isRunning,
    isStopping,
    activeExecutionScope,
    activeExecutionNodeId,
    needsViewReset,
    pendingConnection,
    activeConfigNodeId,
    activePreviewNodeId,
    fileImportTasks,
    pendingExecution,
    lastExecutedTerminalNodeId,
    lastRunDashboard,
    executionHistory,
    savedWorkflows,
    currentStorageUser,
    workflowVersions,
    selectedWorkflowVersionDetail,
    editableSnapshots,
    isHistoryMode,
    hasUnsavedChanges,
    canUndoCanvasChange,
    canRedoCanvasChange,
    addLog,
    stopExecution,
    cancelPendingExecution,
    getCategoryByType,
    validateConnection,
    addAndConnectNode,
    createNodeFromDefinition,
    executeNode,
    executeForAiInspection,
    resumePendingExecution,
    runGlobal,
    runGlobalAndCollect,
    debugNodeAndCollect,
    getSavedWorkflows,
    loadCurrentStorageUser,
    loadWorkflowVersions,
    loadWorkflowVersionDetail,
    saveWorkflow,
    loadWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    rollbackWorkflowVersion,
    getDuplicatedWorkflowName,
    serializeNodeSelection,
    deserializeSelectionText,
    duplicateNode,
    duplicateSelectionToClipboard,
    duplicateSelectedNodes,
    copySelectionAsText,
    pasteClipboardSelection,
    updateNodeConfigById,
    renameNodeById,
    setNodePositionById,
    connectNodesById,
    removeNode,
    removeSelectedNodes,
    removeEdge,
    exportWorkflow,
    importWorkflow,
    createAgentWorkflowSnapshot,
    loadHistory,
    clearHistory,
    enterHistoryMode,
    exitHistoryMode,
    createNewWorkflow,
    createWorkflowFromTemplate,
    clearWorkflowVersionState,
    undoCanvasChange,
    redoCanvasChange,
    setPendingConnection,
    setActiveConfigNodeId,
    setActivePreviewNodeId,
    markWorkflowAsExplicitlyUnsaved,
    refreshUnsavedChanges,
    handleNodeChangesForUnsavedState,
    handleEdgeChangesForUnsavedState,
    handleNodeDragStopForUnsavedState,
    createEditableSnapshot,
    restoreEditableSnapshot,
    resetNodeRuntimeInputs,
    validateWorkflowAiPlan,
    applyWorkflowAiPlan,
  }
})



