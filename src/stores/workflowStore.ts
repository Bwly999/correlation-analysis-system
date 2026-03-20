import { defineStore } from 'pinia'
import { computed, ref, markRaw } from 'vue'
import type { Ref } from 'vue'
import { type Node, type Edge } from '@vue-flow/core'
import { getNodeDefinition } from '@/nodes/registry'
import type { MultipleNodeExecutionInput, MultipleNodeExecutionItem } from '@/nodes/types'
import { isNodeResult, normalizeNodeResult } from '@/nodes/result'
import {
  storageProvider,
  type WorkflowNode,
  type SavedWorkflow,
  type ExecutionRecord,
  type WorkflowNodeOutput,
  type WorkflowNodeSnapshot,
} from '@/utils/storage'

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
}

export const useWorkflowStore = defineStore('workflow', () => {
  const nodes = ref([]) as Ref<WorkflowNode[]>
  const edges = ref([]) as Ref<Edge[]>
  const logs = ref<{ time: string; level: string; message: string; nodeId?: string }[]>([])
  const workflowName = ref('未命名工作流')
  const currentWorkflowId = ref<string | null>(null)

  const isRunning = ref(false)
  const isStopping = ref(false)
  const needsViewReset = ref(false) // 视图复位信号

  const pendingConnection = ref<PendingConnectionState>(null)

  const activeConfigNodeId = ref<string | null>(null)
  const pendingExecution = ref<
    {
      nodeId: string
      forceUpdate: boolean
      executionScope?: 'single' | 'global'
      promptIndex?: number
      promptTotal?: number
    } | null
  >(null)
  let pendingExecutionResolver: ((result: 'RESUMED' | 'STOPPED') => void) | null = null
  let globalRuntimeQueueNodeIds: string[] = []
  const lastExecutedTerminalNodeId = ref<string | null>(null)
  const executionHistory = ref([]) as Ref<ExecutionRecord[]>
  const savedWorkflows = ref([]) as Ref<SavedWorkflow[]>
  const lastSavedWorkflowSignature = ref('')
  const hasExplicitUnsavedChanges = ref(false)

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

  const getSavedWorkflows = async (): Promise<SavedWorkflow[]> => {
    return refreshWorkflows()
  }

  const deleteWorkflow = async (id: string) => {
    await storageProvider.deleteWorkflow(id)
    const updated = await refreshWorkflows()
    addLog('工作流已删除', 'warn')
    return updated
  }

  const cloneJsonValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

  const cloneWorkflowNodes = (sourceNodes: WorkflowNode[]): WorkflowNode[] =>
    cloneJsonValue(sourceNodes)

  const cloneWorkflowEdges = (sourceEdges: Edge[]): Edge[] => cloneJsonValue(sourceEdges)

  const serializeWorkflowNodes = (sourceNodes: WorkflowNode[]): WorkflowNodeSnapshot[] =>
    sourceNodes.map((node) =>
      cloneJsonValue({
        id: node.id,
        type: node.type,
        position: node.position,
        label: node.label,
        selected: node.selected,
        dragging: node.dragging,
        data: {
          ...node.data,
          status: 'idle' as const,
          output: node.data.isPinned ? node.data.output : null,
        },
      }),
    )

  const getWorkflowPersistenceSignature = () =>
    JSON.stringify({
      id: currentWorkflowId.value,
      name: workflowName.value,
      nodes: serializeWorkflowNodes(getCurrentNodes()),
      edges: cloneWorkflowEdges(getCurrentEdges()),
    })

  const syncSavedWorkflowSignature = () => {
    lastSavedWorkflowSignature.value = getWorkflowPersistenceSignature()
    hasExplicitUnsavedChanges.value = false
  }

  const markWorkflowAsExplicitlyUnsaved = () => {
    hasExplicitUnsavedChanges.value = true
  }

  const hasUnsavedChanges = computed(
    () =>
      hasExplicitUnsavedChanges.value ||
      getWorkflowPersistenceSignature() !== lastSavedWorkflowSignature.value,
  )

  const resetWorkflowNodeRuntimeState = (sourceNodes: Array<WorkflowNode | WorkflowNodeSnapshot>): WorkflowNode[] =>
    sourceNodes.map((node) => {
      const nextNode: WorkflowNode = {
        ...(node as WorkflowNode),
        data: {
          ...node.data,
          status: 'idle' as const,
          output: node.data?.isPinned ? node.data.output : null,
        },
      }
      return nextNode
    })

  const createNewWorkflow = () => {
    nodes.value = []
    edges.value = []
    logs.value = []
    workflowName.value = '未命名工作流'
    currentWorkflowId.value = null
    isHistoryMode.value = false
    originalWorkflowState.value = null
    addLog('已创建新工作流', 'info')
    syncSavedWorkflowSignature()
  }

  const saveWorkflow = async (name?: string) => {
    if (name) workflowName.value = name
    const id = currentWorkflowId.value || `wf_${Date.now()}`
    currentWorkflowId.value = id
    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const serializedNodes: WorkflowNodeSnapshot[] = serializeWorkflowNodes(currentNodes)
    const workflow: SavedWorkflow = {
      id,
      name: workflowName.value,
      nodes: serializedNodes,
      edges: [...currentEdges],
      updatedAt: Date.now(),
    }
    await storageProvider.saveWorkflow(workflow)
    await refreshWorkflows()
    addLog(`工作流 "${workflow.name}" 已保存`, 'info')
    syncSavedWorkflowSignature()
    return workflow
  }

  const loadWorkflow = async (id: string) => {
    const workflow = await storageProvider.getWorkflow(id)
    if (workflow) {
      nodes.value = resetWorkflowNodeRuntimeState(workflow.nodes)
      edges.value = workflow.edges
      workflowName.value = workflow.name
      currentWorkflowId.value = workflow.id
      addLog(`已加载工作流: ${workflow.name}`, 'info')
      needsViewReset.value = true
      syncSavedWorkflowSignature()
    }
  }

  const duplicateWorkflow = async (id: string) => {
    const original = await storageProvider.getWorkflow(id)
    if (original) {
      const newId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
      const duplicated: SavedWorkflow = {
        ...original,
        id: newId,
        name: `${original.name} (副本)`,
        nodes: serializeWorkflowNodes(resetWorkflowNodeRuntimeState(original.nodes)),
        updatedAt: Date.now(),
      }
      await storageProvider.saveWorkflow(duplicated)
      const updatedList = await refreshWorkflows()
      addLog(`工作流 "${original.name}" 已复制为 "${duplicated.name}"`, 'info')
      return updatedList
    }
    return null
  }

  const exportWorkflow = () => {
    const currentNodes = getCurrentNodes()
    const currentEdges = getCurrentEdges()
    const cleanNodes: WorkflowNodeSnapshot[] = serializeWorkflowNodes(currentNodes)
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
        edges.value = workflow.edges || []
        workflowName.value = workflow.name || '导入的工作流'
        currentWorkflowId.value = null
        addLog(`成功导入工作流: ${workflowName.value}`, 'info')
        lastSavedWorkflowSignature.value = getWorkflowPersistenceSignature()
        markWorkflowAsExplicitlyUnsaved()
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
      }
    }

    isHistoryMode.value = true
    nodes.value = resetWorkflowNodeRuntimeState(record.nodes)
    edges.value = cloneWorkflowEdges(record.edges)
    workflowName.value = `${record.workflowName} (历史记录: ${new Date(record.startTime).toLocaleString()})`
    addLog(`正在查看历史运行记录: ${new Date(record.startTime).toLocaleString()}`, 'info')
    needsViewReset.value = true
  }

  const exitHistoryMode = () => {
    if (!isHistoryMode.value || !originalWorkflowState.value) return

    nodes.value = originalWorkflowState.value.nodes
    edges.value = originalWorkflowState.value.edges
    workflowName.value = originalWorkflowState.value.name
    currentWorkflowId.value = originalWorkflowState.value.id

    isHistoryMode.value = false
    originalWorkflowState.value = null
    addLog('已返回工作流编辑模式', 'info')
    needsViewReset.value = true
  }

  const addLog = (message: string, level: 'info' | 'error' | 'warn' = 'info', nodeId?: string) => {
    logs.value.push({
      time: new Date().toLocaleTimeString(),
      level,
      message,
      nodeId,
    })
  }

  const stopExecution = () => {
    if (isRunning.value || pendingExecution.value) {
      isStopping.value = true
      pendingExecution.value = null
      isRunning.value = false
      if (pendingExecutionResolver) {
        pendingExecutionResolver('STOPPED')
        pendingExecutionResolver = null
      }
      addLog('正在停止工作流...', 'warn')
    }
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

  const hasMissingRequiredRuntimeInput = (node: WorkflowNode) => {
    const resolvedNode = applyNodeConfigDefaults(node)
    const definition = resolvedNode?.definition
    const resolvedConfig = resolvedNode?.config ?? node.data.config
    if (!definition || definition.category !== 'trigger') return false

    return definition.properties.some(
      (property) =>
        property.isRuntimeInput &&
        property.required &&
        (!property.displayIf || property.displayIf(resolvedConfig)) &&
        !isValueValid(resolvedConfig[property.name], property.type),
    )
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
    const definition = getNodeDefinition(type)
    const category = getCategoryByType(type)
    const defaultConfig: Record<string, unknown> = {}
    definition?.properties.forEach((p) => {
      if (p.default !== undefined) defaultConfig[p.name] = p.default
    })
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'custom',
      position,
      label,
      data: {
        label,
        type,
        category,
        status: 'idle',
        config: defaultConfig,
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
              id: `e_${Date.now()}_1`,
              source: sourceNodeId,
              target: newNode.id,
              type: 'n8n',
              animated: true,
            },
            {
              id: `e_${Date.now()}_2`,
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
            id: `e_${Date.now()}`,
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
    return newNode
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
    newNode.data.status = 'idle'
    newNode.data.output = null
    newNode.data.logs = []

    nodes.value = [...currentNodes, newNode]
    addLog(`已复制节点: ${original.data.label}`, 'info')
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
    return removedNode
  }

  const removeEdge = (edgeId: string) => {
    const currentEdges = getCurrentEdges()
    const nextEdges: Edge[] = currentEdges.filter((edge) => edge.id !== edgeId)
    edges.value = nextEdges
  }

  const setPendingConnection = (nextConnection: PendingConnectionState) => {
    pendingConnection.value = nextConnection
  }

  const setActiveConfigNodeId = (nodeId: string | null) => {
    activeConfigNodeId.value = nodeId
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

  const truncateOutputForHistory = (output: WorkflowNodeOutput): WorkflowNodeOutput => {
    if (!output || !isNodeResult(output)) return output

    const snapshot = cloneJsonValue(output)

    if (snapshot.kind === 'table' && Array.isArray(snapshot.payload) && snapshot.payload.length > 100) {
      const originalRowCount = Array.isArray(output.payload) ? output.payload.length : 0
      snapshot.payload = snapshot.payload.slice(0, 10)
      snapshot.meta = {
        ...(snapshot.meta ?? {}),
        historyTruncated: true,
        originalRowCount: snapshot.meta?.rowCount ?? originalRowCount,
      }
    }

    if (
      snapshot.kind === 'tableCollection' &&
      Array.isArray(snapshot.payload) &&
      snapshot.payload.some((group: any) => Array.isArray(group.data) && group.data.length > 20)
    ) {
      snapshot.payload = snapshot.payload.map((group: any) => ({
        ...group,
        data: Array.isArray(group.data) ? group.data.slice(0, 5) : [],
      }))
      snapshot.meta = {
        ...(snapshot.meta ?? {}),
        historyTruncated: true,
      }
    }

    if (
      snapshot.kind === 'report' &&
      snapshot.meta?.sourceData &&
      Array.isArray(snapshot.meta.sourceData) &&
      snapshot.meta.sourceData.length > 100
    ) {
      snapshot.meta.sourceData = snapshot.meta.sourceData.slice(0, 10)
      snapshot.meta.historyTruncated = true
    }

    return snapshot
  }

  const createExecutionSnapshotNodes = (sourceNodes: WorkflowNode[]): WorkflowNodeSnapshot[] =>
    sourceNodes.map((node) => {
      const snapshot = cloneJsonValue(node) as WorkflowNodeSnapshot
      if (snapshot.data.output) {
        snapshot.data.output = truncateOutputForHistory(snapshot.data.output)
      }
      return snapshot
    })

  const executeNode = async (
    nodeId: string,
    forceUpdate = false,
    executionScope: 'single' | 'global' = 'single',
  ): Promise<any> => {
    const currentNodes = getCurrentNodes()
    const node = findNodeById(nodeId, currentNodes)
    if (!node) return

    const wasRunning = isRunning.value
    if (!wasRunning) {
      isRunning.value = true
      isStopping.value = false
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

      if (definition.category === 'trigger') {
        const missingRuntimeProps = definition.properties.filter(
          (p) =>
            p.isRuntimeInput &&
            p.required &&
            (!p.displayIf || p.displayIf(resolvedConfig)) &&
            !isValueValid(resolvedConfig[p.name], p.type),
        )
        if (missingRuntimeProps.length > 0) {
          addLog(`节点 ${node.data.label} 缺少运行时输入`, 'info', nodeId)
          const queueIndex =
            executionScope === 'global' ? globalRuntimeQueueNodeIds.indexOf(nodeId) : -1
          pendingExecution.value = {
            nodeId,
            forceUpdate,
            executionScope,
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
        return node.data.output
      }

      if (!forceUpdate && node.data.output) return node.data.output

      node.data.status = 'running'

      const currentEdges = getCurrentEdges()
      const incomingEdges = currentEdges.filter((e) => e.target === nodeId)
      const inputs: unknown[] = []
      const structuredInputs: MultipleNodeExecutionItem[] = []
      for (const [index, edge] of incomingEdges.entries()) {
        if (isStopping.value) throw new Error('User Aborted')
        const result = await executeNode(edge.source, forceUpdate, executionScope)
        if (result === 'WAIT_INPUT' || result === 'STOPPED') {
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
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (isStopping.value) throw new Error('User Aborted')

      const executionInput: MultipleNodeExecutionInput | unknown | null =
        inputMode === 'multiple'
          ? { inputs: structuredInputs }
          : inputs[0] || null

      const result = await definition.execute(executionInput, resolvedConfig)

      node.data.output = markRaw(toStoredOutput(result))
      node.data.status = 'success'
      addLog(`执行成功: ${node.data.label}`, 'info', nodeId)
      return node.data.output
    } catch (error: any) {
      if (node) node.data.status = error.message === 'User Aborted' ? 'idle' : 'error'
      if (error.message !== 'User Aborted') {
        addLog(`执行失败: ${error.message}`, 'error', nodeId)
        throw error
      }
      return 'STOPPED'
    } finally {
      if (!wasRunning) isRunning.value = false
    }
  }

  const resumePendingExecution = async () => {
    const pending = pendingExecution.value
    if (!pending) return null

    pendingExecution.value = null
    const result = await executeNode(
      pending.nodeId,
      pending.forceUpdate,
      pending.executionScope ?? 'single',
    )

    if (pending.executionScope === 'global' && pendingExecutionResolver) {
      pendingExecutionResolver(result === 'STOPPED' ? 'STOPPED' : 'RESUMED')
      pendingExecutionResolver = null
    }

    return result
  }

  const runGlobal = async () => {
    if (isRunning.value) return

    isRunning.value = true
    isStopping.value = false
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
      }
    })

    let finalStatus: 'success' | 'error' | 'stopped' = 'success'
    try {
      const executionScopeNodeIds = new Set<string>()
      executionTargets.forEach((node) => {
        collectUpstreamNodeIds(node.id, executionScopeNodeIds)
      })
      globalRuntimeQueueNodeIds = currentNodes
        .filter((node) => executionScopeNodeIds.has(node.id))
        .filter((node) => hasMissingRequiredRuntimeInput(node))
        .map((node) => node.id)

      let lastResultId = null
      for (const node of executionTargets) {
        if (isStopping.value) {
          finalStatus = 'stopped'
          break
        }
        let result = await executeNode(node.id, false, 'global')
        while (result === 'WAIT_INPUT') {
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
      const duration = Date.now() - startTime
      addLog(
        '工作流运行结束',
        finalStatus === 'stopped' ? 'warn' : finalStatus === 'error' ? 'error' : 'info',
      )

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

  const loadHistory = async () => {
    try {
      const loadedHistory = (await storageProvider.getAllHistory()) as ExecutionRecord[]
      executionHistory.value = loadedHistory
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  const clearHistory = async () => {
    try {
      await storageProvider.clearAllHistory()
      executionHistory.value = []
      addLog('运行历史记录已清空', 'info')
    } catch (e) {
      addLog(`清空历史记录失败: ${e}`, 'error')
    }
  }

  loadHistory()
  syncSavedWorkflowSignature()

  return {
    nodes,
    edges,
    logs,
    workflowName,
    currentWorkflowId,
    isRunning,
    isStopping,
    needsViewReset,
    pendingConnection,
    activeConfigNodeId,
    pendingExecution,
    lastExecutedTerminalNodeId,
    executionHistory,
    savedWorkflows,
    isHistoryMode,
    hasUnsavedChanges,
    addLog,
    stopExecution,
    getCategoryByType,
    validateConnection,
    addAndConnectNode,
    executeNode,
    resumePendingExecution,
    runGlobal,
    getSavedWorkflows,
    saveWorkflow,
    loadWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    duplicateNode,
    removeNode,
    removeEdge,
    exportWorkflow,
    importWorkflow,
    loadHistory,
    clearHistory,
    enterHistoryMode,
    exitHistoryMode,
    createNewWorkflow,
    setPendingConnection,
    setActiveConfigNodeId,
    markWorkflowAsExplicitlyUnsaved,
  }
})


