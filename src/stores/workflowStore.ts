import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import { type Node, type Edge } from '@vue-flow/core'
import { getNodeDefinition } from '@/nodes/registry'
import {
  storageProvider,
  type WorkflowNode,
  type SavedWorkflow,
  type ExecutionRecord,
} from '@/utils/storage'

export const CONNECTION_RULES: Record<string, string[]> = {
  trigger: ['action', 'terminal'],
  action: ['action', 'terminal'],
  terminal: [],
}

export const useWorkflowStore = defineStore('workflow', () => {
  const nodes = ref<WorkflowNode[]>([])
  const edges = ref<Edge[]>([])
  const logs = ref<{ time: string; level: string; message: string; nodeId?: string }[]>([])
  const workflowName = ref('未命名工作流')
  const currentWorkflowId = ref<string | null>(null)

  const isRunning = ref(false)
  const isStopping = ref(false)
  const needsViewReset = ref(false) // 视图复位信号

  const pendingConnection = ref<{
    sourceNodeId: string
    sourceHandleId?: string
    edgeId?: string
  } | null>(null)

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
  const executionHistory = ref<ExecutionRecord[]>([])
  const savedWorkflows = ref<SavedWorkflow[]>([])

  // 历史模式相关状态
  const isHistoryMode = ref(false)
  const originalWorkflowState = ref<{
    nodes: WorkflowNode[]
    edges: Edge[]
    name: string
    id: string | null
  } | null>(null)

  // --- 持久化操作封装 ---

  const refreshWorkflows = async () => {
    savedWorkflows.value = await storageProvider.getWorkflows()
    return savedWorkflows.value
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

  const createNewWorkflow = () => {
    nodes.value = []
    edges.value = []
    logs.value = []
    workflowName.value = '未命名工作流'
    currentWorkflowId.value = null
    isHistoryMode.value = false
    originalWorkflowState.value = null
    addLog('已创建新工作流', 'info')
  }

  const saveWorkflow = async (name?: string) => {
    if (name) workflowName.value = name
    const id = currentWorkflowId.value || `wf_${Date.now()}`
    currentWorkflowId.value = id
    const workflow: SavedWorkflow = {
      id,
      name: workflowName.value,
      nodes: nodes.value.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: 'idle',
          output: n.data.isPinned ? n.data.output : null,
        },
      })),
      edges: edges.value,
      updatedAt: Date.now(),
    }
    await storageProvider.saveWorkflow(workflow)
    await refreshWorkflows()
    addLog(`工作流 "${workflow.name}" 已保存`, 'info')
    return workflow
  }

  const loadWorkflow = async (id: string) => {
    const workflow = await storageProvider.getWorkflow(id)
    if (workflow) {
      nodes.value = workflow.nodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          status: 'idle',
          output: n.data.isPinned ? n.data.output : null,
        },
      }))
      edges.value = workflow.edges
      workflowName.value = workflow.name
      currentWorkflowId.value = workflow.id
      addLog(`已加载工作流: ${workflow.name}`, 'info')
      needsViewReset.value = true
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
        nodes: original.nodes.map((n: any) => ({
          ...n,
          data: {
            ...n.data,
            status: 'idle',
            output: n.data.isPinned ? n.data.output : null,
          },
        })),
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
    const cleanNodes = nodes.value.map((n) => ({
      ...n,
      data: {
        ...n.data,
        status: 'idle',
        output: n.data.isPinned ? n.data.output : null,
      },
    }))
    const workflow = { name: workflowName.value, nodes: cleanNodes, edges: edges.value }
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
        const importedNodes = (workflow.nodes || []).map((n: any) => ({
          ...n,
          data: {
            ...n.data,
            status: 'idle',
            output: n.data.isPinned ? n.data.output : null,
          },
        }))
        nodes.value = importedNodes
        edges.value = workflow.edges || []
        workflowName.value = workflow.name || '导入的工作流'
        currentWorkflowId.value = null
        addLog(`成功导入工作流: ${workflowName.value}`, 'info')
      } catch (_err) {
        addLog(`导入失败: 格式错误`, 'error')
      }
    }
    reader.readAsText(file)
  }

  const enterHistoryMode = (recordId: string) => {
    const record = executionHistory.value.find((r) => r.id === recordId)
    if (!record) return

    if (!isHistoryMode.value) {
      originalWorkflowState.value = {
        nodes: JSON.parse(JSON.stringify(nodes.value)),
        edges: JSON.parse(JSON.stringify(edges.value)),
        name: workflowName.value,
        id: currentWorkflowId.value,
      }
    }

    isHistoryMode.value = true
    nodes.value = JSON.parse(JSON.stringify(record.nodes))
    edges.value = JSON.parse(JSON.stringify(record.edges))
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
    edges.value
      .filter((edge) => edge.target === targetNodeId)
      .forEach((edge) => collectUpstreamNodeIds(edge.source, acc))
    return acc
  }

  const validateConnection = (sourceNodeId: string, targetNodeId: string) => {
    const sourceNode = nodes.value.find((n) => n.id === sourceNodeId)
    const targetNode = nodes.value.find((n) => n.id === targetNodeId)
    if (!sourceNode || !targetNode) return { valid: false, message: '节点不存在' }
    const sourceCat = sourceNode.data.category as keyof typeof CONNECTION_RULES
    const targetCat = targetNode.data.category
    if (!CONNECTION_RULES[sourceCat]?.includes(targetCat)) {
      const msg = `流程规范限制: ${sourceCat} 无法连接到 ${targetCat}`
      addLog(msg, 'error')
      return { valid: false, message: msg }
    }

    const targetIncomingEdges = edges.value.filter((edge) => edge.target === targetNodeId)
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
    const defaultConfig: any = {}
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
    nodes.value.push(newNode)
    if (pendingConnection.value) {
      const { sourceNodeId, sourceHandleId, edgeId } = pendingConnection.value
      if (edgeId) {
        const oldEdge = edges.value.find((e) => e.id === edgeId)
        if (oldEdge) {
          const targetNodeId = oldEdge.target
          edges.value = edges.value.filter((e) => e.id !== edgeId)
          edges.value.push({
            id: `e_${Date.now()}_1`,
            source: sourceNodeId,
            target: newNode.id,
            type: 'n8n',
            animated: true,
          })
          edges.value.push({
            id: `e_${Date.now()}_2`,
            source: newNode.id,
            target: targetNodeId,
            type: 'n8n',
            animated: true,
          })
        }
      } else {
        edges.value.push({
          id: `e_${Date.now()}`,
          source: sourceNodeId,
          target: newNode.id,
          sourceHandle: sourceHandleId,
          type: 'n8n',
          animated: true,
        })
      }
      pendingConnection.value = null
    }
    return newNode
  }

  const duplicateNode = (nodeId: string) => {
    const original = nodes.value.find((n) => n.id === nodeId)
    if (!original) return null

    const newNode: WorkflowNode = JSON.parse(JSON.stringify(original))
    newNode.id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    newNode.position = {
      x: original.position.x + 40,
      y: original.position.y + 40,
    }
    newNode.data.label = `${original.data.label} (副本)`
    newNode.data.status = 'idle'
    newNode.data.output = null
    newNode.data.logs = []

    nodes.value.push(newNode)
    addLog(`已复制节点: ${original.data.label}`, 'info')
    return newNode
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

  const executeNode = async (
    nodeId: string,
    forceUpdate = false,
    executionScope: 'single' | 'global' = 'single',
  ): Promise<any> => {
    const node = nodes.value.find((n) => n.id === nodeId)
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
            throw new Error('手动输入 JSON 格式错误', { cause: e })
          }
        }
        const result = await definition.execute(parsedInput, resolvedConfig)
        node.data.output = markRaw(result)
        node.data.status = 'success'
        return result
      }

      if (!forceUpdate && node.data.output) return node.data.output

      node.data.status = 'running'

      const incomingEdges = edges.value.filter((e) => e.target === nodeId)
      const inputs = []
      const structuredInputs = []
      for (const [index, edge] of incomingEdges.entries()) {
        if (isStopping.value) throw new Error('User Aborted')
        const result = await executeNode(edge.source, forceUpdate, executionScope)
        if (result === 'WAIT_INPUT' || result === 'STOPPED') {
          node.data.status = 'idle'
          return result
        }
        const sourceNode = nodes.value.find((n) => n.id === edge.source)
        inputs.push(result)
        structuredInputs.push({
          sourceNodeId: edge.source,
          sourceNodeLabel: sourceNode?.data.label ?? edge.source,
          edgeId: edge.id,
          order: index,
          payload: result ?? null,
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

      const executionInput =
        inputMode === 'multiple'
          ? { inputs: structuredInputs }
          : inputs[0] || null

      const result = await definition.execute(executionInput, resolvedConfig)

      node.data.output = markRaw(result)
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

    const terminalNodes = nodes.value.filter((n) => n.data.category === 'terminal')
    const fallbackLeafNodes = nodes.value.filter(
      (node) => !edges.value.some((edge) => edge.source === node.id),
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

    nodes.value.forEach((n) => {
      if (!n.data.isPinned) {
        n.data.status = 'idle'
        n.data.output = null
      }
    })

    let finalStatus: 'success' | 'error' | 'stopped' = 'success'
    try {
      const executionScopeNodeIds = new Set<string>()
      executionTargets.forEach((node) => {
        collectUpstreamNodeIds(node.id, executionScopeNodeIds)
      })
      globalRuntimeQueueNodeIds = nodes.value
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
        nodes: nodes.value.map((n) => {
          const snapshot = JSON.parse(JSON.stringify(n))
          if (
            snapshot.data?.output?.data &&
            Array.isArray(snapshot.data.output.data) &&
            snapshot.data.output.data.length > 100
          ) {
            snapshot.data.output.data = snapshot.data.output.data.slice(0, 10)
            snapshot.data.output._truncated = true
          }
          return snapshot
        }),
        edges: JSON.parse(JSON.stringify(edges.value)),
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
      const newHistory = [record, ...executionHistory.value].slice(0, 20)
      executionHistory.value = newHistory
      addLog(`保存历史记录到存储失败，已保存至内存`, 'warn')
    }
  }

  const loadHistory = async () => {
    try {
      executionHistory.value = await storageProvider.getAllHistory()
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
    exportWorkflow,
    importWorkflow,
    loadHistory,
    clearHistory,
    enterHistoryMode,
    exitHistoryMode,
    createNewWorkflow,
  }
})


