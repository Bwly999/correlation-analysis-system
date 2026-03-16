import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkflowStore } from '../workflowStore'
import { nodeDefinitions } from '../../nodes/registry'

describe('Workflow Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('should initialize with empty nodes and edges', () => {
    const store = useWorkflowStore()
    expect(store.nodes).toEqual([])
    expect(store.edges).toEqual([])
  })

  it('should add a node correctly', () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Import Data', { x: 0, y: 0 })
    expect(store.nodes.length).toBe(1)
    expect(node?.data.label).toBe('Import Data')
    expect(node?.data.category).toBe('trigger')
  })

  it('should allow adding multiple trigger nodes', () => {
    const store = useWorkflowStore()
    const node1 = store.addAndConnectNode('file-import', 'Import 1', { x: 0, y: 0 })
    const node2 = store.addAndConnectNode('neighbor-system', 'Import 2', { x: 100, y: 0 })

    expect(store.nodes.length).toBe(2)
    expect(node1).not.toBeNull()
    expect(node2).not.toBeNull()
  })

  it('should validate connections correctly based on categories', async () => {
    const store = useWorkflowStore()

    // 强制等待一小会儿确保 ID 不同（如果是基于 Date.now）
    const trigger = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    await new Promise((r) => setTimeout(r, 10))
    const action = store.addAndConnectNode('data-cleaning', 'Action', { x: 300, y: 0 })!
    await new Promise((r) => setTimeout(r, 10))
    const model = store.addAndConnectNode('xgboost-shap', 'Xgboost Model', { x: 600, y: 0 })!

    // Trigger -> Action: Valid
    expect(store.validateConnection(trigger.id, action.id).valid).toBe(true)

    // Trigger -> Model: Valid (Repair check for Item 11)
    expect(store.validateConnection(trigger.id, model.id).valid).toBe(true)

    // Action -> Model: Valid
    expect(store.validateConnection(action.id, model.id).valid).toBe(true)

    // Model -> Action: Invalid (Model is terminal)
    expect(store.validateConnection(model.id, action.id).valid).toBe(false)

    // Action -> Trigger: Invalid (Cannot connect back to trigger)
    expect(store.validateConnection(action.id, trigger.id).valid).toBe(false)
  })

  it('should block connecting a second upstream edge into a single-input node', async () => {
    const store = useWorkflowStore()

    const trigger1 = store.addAndConnectNode('file-import', 'Trigger 1', { x: 0, y: 0 })!
    await new Promise((r) => setTimeout(r, 10))
    const trigger2 = store.addAndConnectNode('neighbor-system', 'Trigger 2', { x: 0, y: 120 })!
    await new Promise((r) => setTimeout(r, 10))
    const target = store.addAndConnectNode('data-cleaning', 'Cleaner', { x: 300, y: 0 })!

    store.edges.push({
      id: 'e_trigger1_target',
      source: trigger1.id,
      target: target.id,
      type: 'n8n',
      animated: true,
    })

    expect(store.validateConnection(trigger2.id, target.id).valid).toBe(false)
  })

  it('should pass all upstream payloads to a multiple-input node', async () => {
    const tempNodeDefinition = {
      name: 'test-multi-input',
      displayName: 'Test Multi Input',
      icon: 'test',
      category: 'action' as const,
      description: 'test',
      properties: [],
      inputMode: 'multiple' as const,
      minInputs: 2,
      maxInputs: null,
      execute: async (input: { inputs: Array<{ payload: { data: Array<Record<string, unknown>> } }> }) => ({
        inputCount: input.inputs.length,
        values: input.inputs.map((item) => item.payload.data[0]!.value),
      }),
    }

    nodeDefinitions.push(tempNodeDefinition)

    try {
      const store = useWorkflowStore()
      const trigger1 = store.addAndConnectNode('manual-json-import', 'Source 1', { x: 0, y: 0 })!
      const trigger2 = store.addAndConnectNode('manual-json-import', 'Source 2', { x: 0, y: 120 })!
      const target = store.addAndConnectNode('test-multi-input', 'Multi', { x: 300, y: 0 })!

      trigger1.data.config.jsonData = JSON.stringify([{ value: 'A' }])
      trigger2.data.config.jsonData = JSON.stringify([{ value: 'B' }])

      store.edges.push({
        id: 'e_t1_multi',
        source: trigger1.id,
        target: target.id,
        type: 'n8n',
        animated: true,
      })
      store.edges.push({
        id: 'e_t2_multi',
        source: trigger2.id,
        target: target.id,
        type: 'n8n',
        animated: true,
      })

      const result = await store.executeNode(target.id, true)

      expect(result.inputCount).toBe(2)
      expect(result.values).toEqual(['A', 'B'])
    } finally {
      const index = nodeDefinitions.findIndex((definition) => definition.name === 'test-multi-input')
      if (index >= 0) nodeDefinitions.splice(index, 1)
    }
  })

  it('should honor node definition defaults during global execution for legacy multi-input nodes', async () => {
    const store = useWorkflowStore()
    const trigger1 = store.addAndConnectNode('manual-json-import', '来源一', { x: 0, y: 0 })!
    const trigger2 = store.addAndConnectNode('manual-json-import', '来源二', { x: 0, y: 120 })!
    const mergeNode = store.addAndConnectNode('data-merge', '数据合并', { x: 300, y: 60 })!
    const terminalNode = store.addAndConnectNode('chart-display', '图表', { x: 600, y: 60 })!

    trigger1.data.config.jsonData = JSON.stringify([{ id: 1, city: '上海' }])
    trigger2.data.config.jsonData = JSON.stringify([{ id: 2, score: 98 }])

    // 模拟旧工作流或残缺配置：运行前未持久化数据合并节点默认参数。
    mergeNode.data.config = {}

    store.edges.push(
      {
        id: 'e_t1_merge',
        source: trigger1.id,
        target: mergeNode.id,
        type: 'n8n',
        animated: true,
      },
      {
        id: 'e_t2_merge',
        source: trigger2.id,
        target: mergeNode.id,
        type: 'n8n',
        animated: true,
      },
      {
        id: 'e_merge_terminal',
        source: mergeNode.id,
        target: terminalNode.id,
        type: 'n8n',
        animated: true,
      },
    )

    await store.runGlobal()

    expect(mergeNode.data.output?.stats?.inputCount).toBe(2)
    expect(mergeNode.data.output?.stats?.outputRows).toBe(2)
    expect(mergeNode.data.output?.data).toEqual([
      { id: 1, city: '上海', score: null },
      { id: 2, city: null, score: 98 },
    ])
  })

  it('should preserve collection merge output during global execution when consumed by chart display', async () => {
    const store = useWorkflowStore()
    const trigger1 = store.addAndConnectNode('manual-json-import', '手动输入数据1', { x: 0, y: 0 })!
    const trigger2 = store.addAndConnectNode('manual-json-import', '手动输入数据2', { x: 0, y: 120 })!
    const trigger3 = store.addAndConnectNode('manual-json-import', '手动输入数据3', { x: 0, y: 240 })!
    const mergeNode = store.addAndConnectNode('data-merge', '数据合并', { x: 300, y: 120 })!
    const terminalNode = store.addAndConnectNode('chart-display', '图表展示', { x: 600, y: 120 })!

    const sharedRows = [
      { f1: 10, f2: 20, target: 1 },
      { f1: 12, f2: 18, target: 0 },
    ]

    trigger1.data.config.jsonData = JSON.stringify(sharedRows)
    trigger2.data.config.jsonData = JSON.stringify(sharedRows)
    trigger3.data.config.jsonData = JSON.stringify(sharedRows)

    mergeNode.data.config = { mergeMode: 'collection' }
    terminalNode.data.config = { chartType: 'scatter', xAxis: 'f1', yAxis: 'target' }

    store.edges.push(
      {
        id: 'e_t1_merge_collection',
        source: trigger1.id,
        target: mergeNode.id,
        type: 'n8n',
        animated: true,
      },
      {
        id: 'e_t2_merge_collection',
        source: trigger2.id,
        target: mergeNode.id,
        type: 'n8n',
        animated: true,
      },
      {
        id: 'e_t3_merge_collection',
        source: trigger3.id,
        target: mergeNode.id,
        type: 'n8n',
        animated: true,
      },
      {
        id: 'e_merge_chart_collection',
        source: mergeNode.id,
        target: terminalNode.id,
        type: 'n8n',
        animated: true,
      },
    )

    await store.runGlobal()

    expect(mergeNode.data.output?.data).toEqual([
      { name: '手动输入数据1', data: sharedRows },
      { name: '手动输入数据2', data: sharedRows },
      { name: '手动输入数据3', data: sharedRows },
    ])
    expect(mergeNode.data.output?.stats).toEqual({
      inputCount: 3,
      groupCount: 3,
      totalRows: 6,
    })
  })

  it('should execute a single node and cache output', async () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!

    // Provide file data
    node.data.config.fileData = new File(['col1,col2\n1,2'], 'test.csv', { type: 'text/csv' })

    const result = await store.executeNode(node.id)

    expect(node.data.status).toBe('success')
    expect(result.data).toBeDefined()
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('should support workflow persistence (save/load)', async () => {
    const store = useWorkflowStore()
    store.workflowName = 'Test Workflow'
    store.addAndConnectNode('file-import', 'Node 1', { x: 0, y: 0 })

    const saved = await store.saveWorkflow()

    // Reset store
    store.nodes = []
    await store.loadWorkflow(saved.id)

    expect(store.nodes.length).toBe(1)
    expect(store.workflowName).toBe('Test Workflow')
  })

  it('should stop execution when stopExecution is called', async () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    node.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')

    // Start execution
    const execPromise = store.executeNode(node.id, true)

    // Immediately stop
    store.stopExecution()

    const result = await execPromise
    expect(result).toBe('STOPPED')
    expect(node.data.status).toBe('idle')
  })

  it('should return WAIT_INPUT if trigger node lacks runtime input', async () => {
    const store = useWorkflowStore()
    // neighbor-system has runtime input (timeRange etc) if not provided?
    // Wait, let's check file-import, it has fileData as runtime input
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    // No fileData provided

    const result = await store.executeNode(node.id)

    expect(result).toBe('WAIT_INPUT')
    expect(store.isRunning).toBe(false)
    expect(store.pendingExecution?.nodeId).toBe(node.id)
  })

  it('should resume pending debug execution for a trigger node without requiring a terminal model', async () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!

    const waitingResult = await store.executeNode(node.id, true)
    expect(waitingResult).toBe('WAIT_INPUT')
    expect(store.pendingExecution?.nodeId).toBe(node.id)

    node.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')

    const resumed = await store.resumePendingExecution()

    expect(resumed?.data).toBeDefined()
    expect(node.data.status).toBe('success')
    expect(store.pendingExecution).toBeNull()
    expect(store.logs.some((l) => l.message.includes('未找到分析模型'))).toBe(false)
  })

  it('should record execution history after a global run', async () => {
    const store = useWorkflowStore()
    const triggerNode = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    const modelNode = store.addAndConnectNode('chart-display', 'Model', { x: 300, y: 0 })!

    // 手动连接节点以确保执行链完整
    store.edges.push({
      id: 'e_trigger_model',
      source: triggerNode.id,
      target: modelNode.id,
      type: 'n8n',
      animated: true,
    })

    // Mock the file input to allow execution
    triggerNode.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')

    await store.runGlobal()

    expect(store.executionHistory.length).toBe(1)
    expect(store.executionHistory[0]!.status).toBe('success')
    expect(store.executionHistory[0]!.workflowName).toBe('未命名工作流')
  })

  it('should skip execution and return cached output when node is pinned', async () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!

    // 1. 第一次运行获取结果
    node.data.config.fileData = new File(['col,val\na,1'], 'test1.csv')
    const firstResult = await store.executeNode(node.id, true)
    const firstOutput = JSON.parse(JSON.stringify(firstResult)) // 深拷贝一份

    // 2. 开启 Pin
    node.data.isPinned = true

    // 3. 改变输入数据（理论上如果重新运行，结果会变）
    node.data.config.fileData = new File(['col,val\nb,2'], 'test2.csv')

    // 4. 再次强制运行
    const secondResult = await store.executeNode(node.id, true)

    // 验证：即使强制运行且数据变了，输出依然是第一次的结果
    expect(secondResult).toEqual(firstOutput)
    expect(store.logs.some((l) => l.message.includes('已冻结，使用历史输出数据'))).toBe(true)
  })

  it('should duplicate a node correctly', () => {
    const store = useWorkflowStore()
    const original = store.addAndConnectNode('data-cleaning', 'Original Node', { x: 100, y: 100 })!
    original.data.config.someProp = 'someValue'

    const duplicated = store.duplicateNode(original.id)!

    expect(store.nodes.length).toBe(2)
    expect(duplicated.id).not.toBe(original.id)
    expect(duplicated.data.label).toBe('Original Node (副本)')
    expect(duplicated.position).toEqual({ x: 140, y: 140 })
    expect(duplicated.data.config.someProp).toBe('someValue')
    expect(duplicated.data.status).toBe('idle')
    expect(duplicated.data.output).toBeNull()
  })
})

