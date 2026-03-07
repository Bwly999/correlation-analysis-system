import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    await new Promise(r => setTimeout(r, 10))
    const action = store.addAndConnectNode('data-cleaning', 'Action', { x: 300, y: 0 })!
    await new Promise(r => setTimeout(r, 10))
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

  it('should record execution history after a global run', async () => {
    const store = useWorkflowStore()
    store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    const model = store.addAndConnectNode('xgboost-shap', 'Model', { x: 300, y: 0 })!
    
    // Mock the file input to allow execution
    const trigger = store.nodes.find(n => n.data.type === 'file-import')!
    trigger.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')
    
    await store.runGlobal()
    
    expect(store.executionHistory.length).toBe(1)
    expect(store.executionHistory[0].status).toBe('success')
    expect(store.executionHistory[0].workflowName).toBe('未命名工作流')
  })
})
