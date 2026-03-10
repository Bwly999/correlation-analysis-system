import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkflowStore } from '../workflowStore'

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

  it('should not allow adding multiple trigger nodes', () => {
    const store = useWorkflowStore()
    store.addAndConnectNode('file-import', 'Import 1', { x: 0, y: 0 })
    // 第二个 trigger 应该返回 null
    const node2 = store.addAndConnectNode('neighbor-system', 'Import 2', { x: 100, y: 0 })

    expect(store.nodes.length).toBe(1)
    expect(node2).toBeNull()
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

  it('should support workflow persistence (save/load)', () => {
    const store = useWorkflowStore()
    store.workflowName = 'Test Workflow'
    store.addAndConnectNode('file-import', 'Node 1', { x: 0, y: 0 })

    const saved = store.saveWorkflow()

    // Reset store
    store.nodes = []
    store.loadWorkflow(saved.id)

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
    expect(store.executionHistory[0].status).toBe('success')
    expect(store.executionHistory[0].workflowName).toBe('未命名工作流')
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
})
