import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import { type Node, type Edge } from '@vue-flow/core'
import { getNodeDefinition } from '@/nodes/registry'

export interface WorkflowNode extends Node {
  data: {
    label: string
    type: string 
    category: 'trigger' | 'action' | 'terminal'
    config: any
    status: 'idle' | 'running' | 'success' | 'error'
    output?: any 
    manualInput?: any 
    useManualInput?: boolean 
    logs: string[]
  }
}

export interface SavedWorkflow {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: Edge[]
  updatedAt: number
}

export interface ExecutionRecord {
  id: string
  workflowId: string
  workflowName: string
  startTime: number
  duration: number
  status: 'success' | 'error' | 'stopped'
  nodes: any[]
  edges: any[]
}

export const CONNECTION_RULES: Record<string, string[]> = {
  'trigger': ['action', 'terminal'],
  'action': ['action', 'terminal'],
  'terminal': []
}

export const useWorkflowStore = defineStore('workflow', () => {
  const nodes = ref<WorkflowNode[]>([])
  const edges = ref<Edge[]>([])
  const logs = ref<{ time: string, level: string, message: string, nodeId?: string }[]>([])
  const workflowName = ref('未命名工作流')
  const currentWorkflowId = ref<string | null>(null)
  
  const isRunning = ref(false)
  const isStopping = ref(false)
  
  const pendingConnection = ref<{
    sourceNodeId: string;
    sourceHandleId?: string;
    edgeId?: string;
  } | null>(null)

  const activeConfigNodeId = ref<string | null>(null)
  const pendingExecution = ref<{ nodeId: string, forceUpdate: boolean } | null>(null)
  const lastExecutedTerminalNodeId = ref<string | null>(null)
  const executionHistory = ref<ExecutionRecord[]>([])

  const addLog = (message: string, level: 'info' | 'error' | 'warn' = 'info', nodeId?: string) => {
    logs.value.push({
      time: new Date().toLocaleTimeString(),
      level,
      message,
      nodeId
    })
  }

  const stopExecution = () => {
    if (isRunning.value) {
      isStopping.value = true
      addLog('正在停止工作流...', 'warn')
    }
  }

  const getCategoryByType = (type: string): 'trigger' | 'action' | 'terminal' => {
    const definition = getNodeDefinition(type)
    return definition ? definition.category : 'action'
  }

  const validateConnection = (sourceNodeId: string, targetNodeId: string) => {
    const sourceNode = nodes.value.find(n => n.id === sourceNodeId)
    const targetNode = nodes.value.find(n => n.id === targetNodeId)
    if (!sourceNode || !targetNode) return { valid: false, message: '节点不存在' }
    const sourceCat = sourceNode.data.category
    const targetCat = targetNode.data.category
    if (!CONNECTION_RULES[sourceCat]?.includes(targetCat)) {
      const msg = `流程规范限制: ${sourceCat} 无法连接到 ${targetCat}`
      addLog(msg, 'error')
      return { valid: false, message: msg }
    }
    return { valid: true }
  }

  const checkTriggerExists = () => {
    return nodes.value.some(n => n.data.category === 'trigger')
  }

  const addAndConnectNode = (type: string, label: string, position: { x: number, y: number }) => {
    const definition = getNodeDefinition(type)
    const category = getCategoryByType(type)
    if (category === 'trigger' && checkTriggerExists()) {
      addLog('流程规范限制: 工作流只能包含一个数据获取节点', 'error')
      return null
    }
    const defaultConfig: any = {}
    definition?.properties.forEach(p => {
      if (p.default !== undefined) defaultConfig[p.name] = p.default
    })
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`,
      type: 'custom',
      position,
      label,
      data: { 
        label, type, category, status: 'idle', 
        config: defaultConfig, 
        logs: []
      },
    }
    nodes.value.push(newNode)
    if (pendingConnection.value) {
      const { sourceNodeId, sourceHandleId, edgeId } = pendingConnection.value
      if (edgeId) {
        const oldEdge = edges.value.find(e => e.id === edgeId)
        if (oldEdge) {
          const targetNodeId = oldEdge.target
          edges.value = edges.value.filter(e => e.id !== edgeId)
          edges.value.push({ id: `e_${Date.now()}_1`, source: sourceNodeId, target: newNode.id, type: 'n8n', animated: true })
          edges.value.push({ id: `e_${Date.now()}_2`, source: newNode.id, target: targetNodeId, type: 'n8n', animated: true })
        }
      } else {
        edges.value.push({ id: `e_${Date.now()}`, source: sourceNodeId, target: newNode.id, sourceHandle: sourceHandleId, type: 'n8n', animated: true })
      }
      pendingConnection.value = null
    }
    return newNode
  }

  const isValueValid = (value: any, type: string) => {
    if (value === undefined || value === null) return false
    if (type === 'file') {
      return value instanceof File || (typeof value === 'object' && value.name)
    }
    return true
  }

  const executeNode = async (nodeId: string, forceUpdate = false): Promise<any> => {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return

    try {
      if (isStopping.value) throw new Error('User Aborted')

      const definition = getNodeDefinition(node.data.type)
      if (!definition) {
        addLog(`未找到定义: ${node.data.type}`, 'error', nodeId)
        return
      }

      if (definition.category === 'trigger') {
        const missingRuntimeProps = definition.properties.filter(p => 
          p.isRuntimeInput && !isValueValid(node.data.config[p.name], p.type)
        )
        if (missingRuntimeProps.length > 0) {
          addLog(`节点 ${node.data.label} 缺少运行时输入`, 'info', nodeId)
          pendingExecution.value = { nodeId, forceUpdate }
          isRunning.value = false
          return 'WAIT_INPUT'
        }
      }

      if (node.data.useManualInput && node.data.manualInput && !forceUpdate) {
        addLog(`节点 ${node.data.label} 使用手动模拟输入运行`, 'info', nodeId)
        const result = await definition.execute(node.data.manualInput, node.data.config)
        node.data.output = markRaw(result)
        node.data.status = 'success'
        return result
      }

      if (!forceUpdate && node.data.output) return node.data.output

      node.data.status = 'running'
      
      const incomingEdges = edges.value.filter(e => e.target === nodeId)
      const inputs = []
      for (const edge of incomingEdges) {
        if (isStopping.value) throw new Error('User Aborted')
        const result = await executeNode(edge.source, forceUpdate)
        if (result === 'WAIT_INPUT' || result === 'STOPPED') return result
        inputs.push(result)
      }

      if (isStopping.value) throw new Error('User Aborted')
      await new Promise(resolve => setTimeout(resolve, 300))
      if (isStopping.value) throw new Error('User Aborted')

      const result = await definition.execute(inputs[0] || null, node.data.config)
      
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
    }
  }

  const runGlobal = async () => {
    if (isRunning.value) return
    
    isRunning.value = true
    isStopping.value = false
    const startTime = Date.now()
    addLog('开始全局运行...', 'info')
    
    const terminalNodes = nodes.value.filter(n => n.data.category === 'terminal')
    if (terminalNodes.length === 0) {
      addLog('运行失败: 未找到分析模型', 'error')
      isRunning.value = false
      return
    }
    
    let finalStatus: 'success' | 'error' | 'stopped' = 'success'
    try {
      let lastResultId = null
      for (const node of terminalNodes) {
        if (isStopping.value) {
          finalStatus = 'stopped'
          break
        }
        const result = await executeNode(node.id, true)
        if (result === 'WAIT_INPUT') {
           isRunning.value = false
           return 
        }
        if (result === 'STOPPED') {
          finalStatus = 'stopped'
          break 
        }
        lastResultId = node.id
      }
      lastExecutedTerminalNodeId.value = lastResultId
    } catch (err) {
      finalStatus = 'error'
      addLog(`全局运行中断: ${err}`, 'error')
    } finally {
      isRunning.value = false
      isStopping.value = false
      const duration = Date.now() - startTime
      addLog('工作流运行结束', finalStatus === 'stopped' ? 'warn' : (finalStatus === 'error' ? 'error' : 'info'))
      
      const record: ExecutionRecord = {
        id: `exec_${Date.now()}`,
        workflowId: currentWorkflowId.value || 'temp',
        workflowName: workflowName.value,
        startTime,
        duration,
        status: finalStatus,
        nodes: JSON.parse(JSON.stringify(nodes.value)),
        edges: JSON.parse(JSON.stringify(edges.value))
      }
      saveExecution(record)
    }
  }

  const saveExecution = (record: ExecutionRecord) => {
    const history = JSON.parse(localStorage.getItem('execution_history') || '[]')
    history.unshift(record)
    const limitedHistory = history.slice(0, 50)
    localStorage.setItem('execution_history', JSON.stringify(limitedHistory))
    executionHistory.value = limitedHistory
  }

  const loadHistory = () => {
    executionHistory.value = JSON.parse(localStorage.getItem('execution_history') || '[]')
  }

  const saveWorkflow = (name?: string) => {
    if (name) workflowName.value = name
    const id = currentWorkflowId.value || `wf_${Date.now()}`
    currentWorkflowId.value = id
    const workflow: SavedWorkflow = {
      id, name: workflowName.value, nodes: nodes.value, edges: edges.value, updatedAt: Date.now()
    }
    localStorage.setItem('saved_workflows', JSON.stringify(
      JSON.parse(localStorage.getItem('saved_workflows') || '[]').filter((w: any) => w.id !== id).concat(workflow)
    ))
    addLog(`工作流 "${workflow.name}" 已保存`, 'info')
    return workflow
  }

  const loadWorkflow = (id: string) => {
    const saved = JSON.parse(localStorage.getItem('saved_workflows') || '[]')
    const workflow = saved.find((w: any) => w.id === id)
    if (workflow) {
      nodes.value = workflow.nodes
      edges.value = workflow.edges
      workflowName.value = workflow.name
      currentWorkflowId.value = workflow.id
      addLog(`已加载工作流: ${workflow.name}`, 'info')
    }
  }

  const exportWorkflow = () => {
    const workflow = { name: workflowName.value, nodes: nodes.value, edges: edges.value }
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${workflowName.value}.json`; a.click(); URL.revokeObjectURL(url)
    addLog(`工作流已导出`, 'info')
  }

  const importWorkflow = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workflow = JSON.parse(e.target?.result as string)
        nodes.value = workflow.nodes || []; edges.value = workflow.edges || []
        workflowName.value = workflow.name || '导入的工作流'; currentWorkflowId.value = null
        addLog(`成功导入工作流: ${workflowName.value}`, 'info')
      } catch (err) { addLog(`导入失败: 格式错误`, 'error') }
    }
    reader.readAsText(file)
  }

  return {
    nodes, edges, logs, workflowName, currentWorkflowId, isRunning, isStopping,
    pendingConnection, activeConfigNodeId, pendingExecution, lastExecutedTerminalNodeId,
    executionHistory,
    addLog, stopExecution, getCategoryByType, validateConnection, addAndConnectNode, executeNode, runGlobal,
    saveWorkflow, loadWorkflow, exportWorkflow, importWorkflow, loadHistory
  }
})
