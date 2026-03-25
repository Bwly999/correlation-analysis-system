import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { vi } from 'vitest'
import { useWorkflowStore } from '../workflowStore'
import { nodeDefinitions } from '../../nodes/registry'
import { createJsonResult, createTableResult } from '../../nodes/result'
import { storageProvider } from '../../utils/storage'

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

  it('should load current storage user from the storage provider', async () => {
    vi.spyOn(storageProvider, 'getCurrentUser').mockResolvedValue({
      id: 'server-user-1',
      name: '服务端用户',
    })

    const store = useWorkflowStore()
    await store.loadCurrentStorageUser()

    expect(store.currentStorageUser).toEqual({
      id: 'server-user-1',
      name: '服务端用户',
    })
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

  it('should pass normalized node results to a multiple-input node without legacy aliases', async () => {
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
      execute: async (input: {
        inputs: Array<{
          result: {
            kind: string
            payload: Array<{ value: string }>
          } | null
        }>
      }) => ({
        inputCount: input.inputs.length,
        values: input.inputs.map((item) => item.result?.payload[0]!.value ?? 'missing'),
        kinds: input.inputs.map((item) => item.result?.kind ?? 'missing'),
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
      expect(result.kinds).toEqual(['table', 'table'])
    } finally {
      const index = nodeDefinitions.findIndex((definition) => definition.name === 'test-multi-input')
      if (index >= 0) nodeDefinitions.splice(index, 1)
    }
  })

  it('should pass standardized upstream node results to a multiple-input node', async () => {
    const triggerDefinition = {
      name: 'test-result-trigger',
      displayName: 'Test Result Trigger',
      icon: 'database',
      category: 'trigger' as const,
      description: 'test',
      properties: [],
      execute: async (_input: null, config: { value: string }) => ({
        kind: 'table' as const,
        payload: [{ value: config.value }],
      }),
    }

    const consumerDefinition = {
      name: 'test-result-consumer',
      displayName: 'Test Result Consumer',
      icon: 'merge',
      category: 'action' as const,
      description: 'test',
      properties: [],
      inputMode: 'multiple' as const,
      minInputs: 2,
      maxInputs: null,
      execute: async (input: {
        inputs: Array<{
          result: {
            kind: string
            payload: Array<{ value: string }>
          }
        }>
      }) => ({
        kind: 'json' as const,
        payload: {
          kinds: input.inputs.map((item) => item.result.kind),
          values: input.inputs.map((item) => item.result.payload[0]!.value),
        },
      }),
    }

    nodeDefinitions.push(triggerDefinition, consumerDefinition)

    try {
      const store = useWorkflowStore()
      const trigger1 = store.addAndConnectNode('test-result-trigger', 'Source 1', { x: 0, y: 0 })!
      const trigger2 = store.addAndConnectNode('test-result-trigger', 'Source 2', { x: 0, y: 120 })!
      const consumer = store.addAndConnectNode('test-result-consumer', 'Consumer', { x: 300, y: 0 })!

      trigger1.data.config.value = 'A'
      trigger2.data.config.value = 'B'

      store.edges.push(
        {
          id: 'e_result_t1_consumer',
          source: trigger1.id,
          target: consumer.id,
          type: 'n8n',
          animated: true,
        },
        {
          id: 'e_result_t2_consumer',
          source: trigger2.id,
          target: consumer.id,
          type: 'n8n',
          animated: true,
        },
      )

      const result = await store.executeNode(consumer.id, true)

      expect(result.kind).toBe('json')
      expect(result.payload).toEqual({
        kinds: ['table', 'table'],
        values: ['A', 'B'],
      })
    } finally {
      const triggerIndex = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-result-trigger',
      )
      if (triggerIndex >= 0) nodeDefinitions.splice(triggerIndex, 1)

      const consumerIndex = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-result-consumer',
      )
      if (consumerIndex >= 0) nodeDefinitions.splice(consumerIndex, 1)
    }
  })

  it('should honor node definition defaults during global execution for protocol multi-input nodes', async () => {
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

    const mergeOutput = mergeNode.data.output as any

    expect(mergeOutput?.kind).toBe('table')
    expect(mergeOutput?.meta?.stats?.inputCount).toBe(2)
    expect(mergeOutput?.meta?.stats?.outputRows).toBe(2)
    expect(mergeOutput?.payload).toEqual([
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

    const mergeOutput = mergeNode.data.output as any

    expect(mergeOutput?.kind).toBe('tableCollection')
    expect(mergeOutput?.payload).toEqual([
      { name: '手动输入数据1', data: sharedRows },
      { name: '手动输入数据2', data: sharedRows },
      { name: '手动输入数据3', data: sharedRows },
    ])
    expect(mergeOutput?.meta?.stats).toEqual({
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
    expect(result.kind).toBe('table')
    expect(result.payload).toBeDefined()
    expect(result.payload.length).toBeGreaterThan(0)
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

  it('should default trigger nodes to not reuse previous runtime inputs', () => {
    const store = useWorkflowStore()

    const fileNode = store.addAndConnectNode('file-import', '文件导入', { x: 0, y: 0 })!
    const neighborNode = store.addAndConnectNode('neighbor-system', '看板数据对接', { x: 0, y: 120 })!

    expect(fileNode.data.reuseLastRuntimeInputs).toBe(false)
    expect(neighborNode.data.reuseLastRuntimeInputs).toBe(false)
  })

  it('should require runtime input again on the next run when reuse is disabled', async () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!

    const waitingResult = await store.executeNode(node.id, true)
    expect(waitingResult).toBe('WAIT_INPUT')
    expect(store.pendingExecution?.nodeId).toBe(node.id)

    node.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')
    const firstResult = await store.resumePendingExecution()

    expect(firstResult?.kind).toBe('table')
    expect(store.pendingExecution).toBeNull()

    node.data.output = null
    node.data.status = 'idle'

    const secondResult = await store.executeNode(node.id, true)

    expect(secondResult).toBe('WAIT_INPUT')
    expect(store.pendingExecution?.nodeId).toBe(node.id)
    expect(node.data.status).toBe('idle')
  })

  it('should reuse previous runtime inputs on the next run when reuse is enabled', async () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!

    node.data.reuseLastRuntimeInputs = true

    const waitingResult = await store.executeNode(node.id, true)
    expect(waitingResult).toBe('WAIT_INPUT')
    expect(store.pendingExecution?.nodeId).toBe(node.id)

    node.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')
    const firstResult = await store.resumePendingExecution()

    expect(firstResult?.kind).toBe('table')
    expect(store.pendingExecution).toBeNull()

    node.data.output = null
    node.data.status = 'idle'

    const secondResult = await store.executeNode(node.id, true)

    expect(secondResult?.kind).toBe('table')
    expect(store.pendingExecution).toBeNull()
    expect(node.data.status).toBe('success')
  })

  it('should resume pending debug execution for a trigger node without requiring a terminal model', async () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!

    const waitingResult = await store.executeNode(node.id, true)
    expect(waitingResult).toBe('WAIT_INPUT')
    expect(store.pendingExecution?.nodeId).toBe(node.id)

    node.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')

    const resumed = await store.resumePendingExecution()

    expect(resumed?.kind).toBe('table')
    expect(resumed?.payload).toBeDefined()
    expect(node.data.status).toBe('success')
    expect(store.pendingExecution).toBeNull()
    expect(store.logs.some((l) => l.message.includes('未找到分析模型'))).toBe(false)
  })

  it('should keep global run alive and collect runtime inputs for multiple trigger nodes', async () => {
    const store = useWorkflowStore()
    const trigger1 = store.addAndConnectNode('file-import', '触发器一', { x: 0, y: 0 })!
    const trigger2 = store.addAndConnectNode('file-import', '触发器二', { x: 0, y: 120 })!
    const mergeNode = store.addAndConnectNode('data-merge', '数据合并', { x: 320, y: 60 })!
    const terminalNode = store.addAndConnectNode('chart-display', '图表展示', { x: 640, y: 60 })!

    store.edges.push(
      {
        id: 'e_trigger1_merge_runtime',
        source: trigger1.id,
        target: mergeNode.id,
        type: 'n8n',
        animated: true,
      },
      {
        id: 'e_trigger2_merge_runtime',
        source: trigger2.id,
        target: mergeNode.id,
        type: 'n8n',
        animated: true,
      },
      {
        id: 'e_merge_terminal_runtime',
        source: mergeNode.id,
        target: terminalNode.id,
        type: 'n8n',
        animated: true,
      },
    )

    const waitForPending = async () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (store.pendingExecution) return
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error('等待运行时参数输入超时')
    }

    const runPromise = store.runGlobal()

    for (let i = 0; i < 2; i += 1) {
      await waitForPending()
      expect(store.pendingExecution?.executionScope).toBe('global')
      expect(store.pendingExecution?.promptTotal).toBe(2)
      expect(store.pendingExecution?.promptIndex).toBe(i + 1)
      const pendingNode = store.nodes.find((node) => node.id === store.pendingExecution?.nodeId)!
      pendingNode.data.config.fileData = new File(['a,b\n1,2'], `runtime-${i}.csv`)
      await store.resumePendingExecution()
    }

    await runPromise

    expect(store.pendingExecution).toBeNull()
    expect(store.isRunning).toBe(false)
    expect(terminalNode.data.status).toBe('success')
    expect(store.executionHistory[0]!.status).toBe('success')
  })

  it('should only require visible runtime inputs for trigger nodes', async () => {
    const conditionalTriggerDefinition = {
      name: 'test-conditional-trigger',
      displayName: 'Test Conditional Trigger',
      icon: 'test',
      category: 'trigger' as const,
      description: 'test',
      properties: [
        {
          name: 'mode',
          displayName: '模式',
          type: 'select-button' as const,
          default: 'a',
          isRuntimeInput: true,
          options: [
            { name: '模式 A', value: 'a' },
            { name: '模式 B', value: 'b' },
          ],
        },
        {
          name: 'inputA',
          displayName: '输入 A',
          type: 'datetime-range' as const,
          default: null,
          required: true,
          isRuntimeInput: true,
          displayIf: (config: Record<string, string>) => config.mode === 'a',
        },
        {
          name: 'inputB',
          displayName: '输入 B',
          type: 'string' as const,
          default: '',
          required: true,
          isRuntimeInput: true,
          displayIf: (config: Record<string, string>) => config.mode === 'b',
        },
      ],
      execute: async (_input: unknown, config: Record<string, string>) => ({
        mode: config.mode,
        value: config.mode === 'a' ? config.inputA : config.inputB,
      }),
    }

    nodeDefinitions.push(conditionalTriggerDefinition)

    try {
      const store = useWorkflowStore()
      const node = store.addAndConnectNode(
        'test-conditional-trigger',
        '条件触发器',
        { x: 0, y: 0 },
      )!

      node.data.config = {
        mode: 'b',
        inputB: 'only-visible-input',
      }

      const result = await store.executeNode(node.id, true)

      expect(result).toEqual({
        mode: 'b',
        value: 'only-visible-input',
      })
      expect(store.pendingExecution).toBeNull()
      expect(node.data.status).toBe('success')
    } finally {
      const index = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-conditional-trigger',
      )
      if (index >= 0) nodeDefinitions.splice(index, 1)
    }
  })

  it('should treat empty string runtime inputs as missing when they are visible and required', async () => {
    const stringTriggerDefinition = {
      name: 'test-string-trigger',
      displayName: 'Test String Trigger',
      icon: 'test',
      category: 'trigger' as const,
      description: 'test',
      properties: [
        {
          name: 'keyword',
          displayName: '关键词',
          type: 'textarea' as const,
          default: '',
          required: true,
          isRuntimeInput: true,
        },
      ],
      execute: async () => ({ ok: true }),
    }

    nodeDefinitions.push(stringTriggerDefinition)

    try {
      const store = useWorkflowStore()
      const node = store.addAndConnectNode('test-string-trigger', '字符串触发器', { x: 0, y: 0 })!

      node.data.config = {
        keyword: '',
      }

      const result = await store.executeNode(node.id, true)

      expect(result).toBe('WAIT_INPUT')
      expect(store.pendingExecution?.nodeId).toBe(node.id)
      expect(node.data.status).toBe('idle')
    } finally {
      const index = nodeDefinitions.findIndex((definition) => definition.name === 'test-string-trigger')
      if (index >= 0) nodeDefinitions.splice(index, 1)
    }
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
    expect(store.executionHistory[0]!.edges[0]).toMatchObject({
      source: triggerNode.id,
      target: modelNode.id,
    })
    expect(
      store.executionHistory[0]!.nodes.find((node) => node.id === triggerNode.id)?.data.output,
    ).toMatchObject({
      kind: 'table',
    })
  })

  it('should truncate oversized table outputs in history snapshots while preserving result metadata', async () => {
    const largeTriggerDefinition = {
      name: 'test-large-history-trigger',
      displayName: 'Large Trigger',
      icon: 'database',
      category: 'trigger' as const,
      description: 'test',
      properties: [],
      execute: async () =>
        createTableResult(
          Array.from({ length: 120 }, (_, index) => ({
            index,
            value: index * 2,
          })),
        ),
    }

    const terminalDefinition = {
      name: 'test-history-terminal',
      displayName: 'History Terminal',
      icon: 'file-json',
      category: 'terminal' as const,
      description: 'test',
      properties: [],
      execute: async (input: unknown) => createJsonResult({ received: input !== null }),
    }

    nodeDefinitions.push(largeTriggerDefinition, terminalDefinition)

    try {
      const store = useWorkflowStore()
      const triggerNode = store.addAndConnectNode(
        'test-large-history-trigger',
        'Large Trigger',
        { x: 0, y: 0 },
      )!
      const terminalNode = store.addAndConnectNode('test-history-terminal', 'Terminal', {
        x: 300,
        y: 0,
      })!

      store.edges.push({
        id: 'e_large_history_terminal',
        source: triggerNode.id,
        target: terminalNode.id,
        type: 'n8n',
        animated: true,
      })

      await store.runGlobal()

      const triggerSnapshot = store.executionHistory[0]!.nodes.find(
        (node) => node.id === triggerNode.id,
      )!.data.output as any

      expect(triggerSnapshot.kind).toBe('table')
      expect(triggerSnapshot.payload).toHaveLength(10)
      expect(triggerSnapshot.meta?.historyTruncated).toBe(true)
      expect(triggerSnapshot.meta?.originalRowCount).toBe(120)
    } finally {
      const triggerIndex = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-large-history-trigger',
      )
      if (triggerIndex >= 0) nodeDefinitions.splice(triggerIndex, 1)

      const terminalIndex = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-history-terminal',
      )
      if (terminalIndex >= 0) nodeDefinitions.splice(terminalIndex, 1)
    }
  })

  it('should run successfully without terminal nodes by executing leaf nodes', async () => {
    const store = useWorkflowStore()
    const triggerNode = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    triggerNode.data.config.fileData = new File(['a,b\n1,2'], 'test.csv')

    await store.runGlobal()

    expect(triggerNode.data.status).toBe('success')
    expect(store.logs.some((l) => l.message.includes('未找到分析模型'))).toBe(false)
    expect(store.logs.some((l) => l.message.includes('末端节点执行模式'))).toBe(true)
    expect(store.executionHistory[0]!.status).toBe('success')
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

  it('should duplicate a workflow with a custom name', async () => {
    const store = useWorkflowStore()

    await store.saveWorkflow('原始工作流')

    const duplicated = await store.duplicateWorkflow(store.currentWorkflowId!, '新的工作流名称')

    expect(duplicated).not.toBeNull()
    expect(store.savedWorkflows).toHaveLength(2)
    expect(store.savedWorkflows.some((workflow) => workflow.name === '新的工作流名称')).toBe(true)
    expect(store.logs.some((log) => log.message.includes('新的工作流名称'))).toBe(true)
  })

  it('should create and restore an editable snapshot for ai-assisted changes', () => {
    const store = useWorkflowStore()
    const trigger = store.addAndConnectNode('manual-json-import', '数据输入', { x: 0, y: 0 })!

    const snapshotId = store.createEditableSnapshot()

    trigger.data.label = '已修改的数据输入'
    store.addAndConnectNode('data-cleaning', '数据清洗', { x: 320, y: 0 })

    expect(store.nodes).toHaveLength(2)

    const restored = store.restoreEditableSnapshot(snapshotId)

    expect(restored).toBe(true)
    expect(store.nodes).toHaveLength(1)
    expect(store.nodes[0]!.data.label).toBe('数据输入')
  })

  it('should apply a validated ai plan with node creation, config updates, connections and layout', () => {
    const store = useWorkflowStore()

    const result = store.applyWorkflowAiPlan({
      summary: '导入数据后做清洗和 Pearson 分析',
      assumptions: [],
      warnings: [],
      operations: [
        {
          id: 'create-trigger',
          type: 'createNode',
          nodeType: 'manual-json-import',
          nodeLabel: '手动输入',
          position: { x: 40, y: 40 },
          config: {
            jsonData: JSON.stringify([{ x: 1, y: 2 }]),
          },
        },
        {
          id: 'create-cleaning',
          type: 'createNode',
          nodeType: 'data-cleaning',
          nodeLabel: '数据清洗',
          position: { x: 320, y: 40 },
        },
        {
          id: 'create-terminal',
          type: 'createNode',
          nodeType: 'pearson',
          nodeLabel: 'Pearson 分析',
          position: { x: 640, y: 40 },
        },
        {
          id: 'connect-trigger-cleaning',
          type: 'connectNodes',
          sourceRef: 'create-trigger',
          targetRef: 'create-cleaning',
        },
        {
          id: 'connect-cleaning-terminal',
          type: 'connectNodes',
          sourceRef: 'create-cleaning',
          targetRef: 'create-terminal',
        },
        {
          id: 'rename-terminal',
          type: 'renameNode',
          nodeRef: 'create-terminal',
          label: '线性相关分析',
        },
        {
          id: 'update-terminal-config',
          type: 'updateNodeConfig',
          nodeRef: 'create-terminal',
          config: {
            targetField: 'y',
          },
        },
      ],
    } as any)

    expect(result.applied).toBe(true)
    expect(store.nodes).toHaveLength(3)
    expect(store.edges).toHaveLength(2)
    expect(store.nodes.map((node) => node.data.label)).toEqual(
      expect.arrayContaining(['手动输入', '数据清洗', '线性相关分析']),
    )
    const terminalNode = store.nodes.find((node) => node.data.label === '线性相关分析')!
    expect(terminalNode.data.config.targetField).toBe('y')
    expect(
      store.edges.some(
        (edge) =>
          edge.source === store.nodes.find((node) => node.data.label === '手动输入')!.id &&
          edge.target === store.nodes.find((node) => node.data.label === '数据清洗')!.id,
      ),
    ).toBe(true)
  })
})

