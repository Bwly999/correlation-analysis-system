import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { afterEach } from 'vitest'
import { vi } from 'vitest'
import type { FileImportProgress } from '../../nodes/fileImport/types'
import * as fileImportTaskModule from '../../nodes/fileImport/task'
import { useWorkflowStore } from '../workflowStore'
import { nodeDefinitions } from '../../nodes/registry'
import { createJsonResult, createTableResult } from '../../nodes/result'
import { storageProvider } from '../../utils/storage'
import { workflowTemplateDefinitions } from '../../workflow/templates'

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Workflow Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should initialize with empty nodes and edges', () => {
    const store = useWorkflowStore()
    expect(store.nodes).toEqual([])
    expect(store.edges).toEqual([])
  })

  it('should cap in-memory logs to the latest 500 entries', () => {
    const store = useWorkflowStore()

    for (let index = 0; index < 520; index += 1) {
      store.addLog(`日志 ${index + 1}`)
    }

    expect(store.logs).toHaveLength(500)
    expect(store.logs[0]?.message).toBe('日志 21')
    expect(store.logs[499]?.message).toBe('日志 520')
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

  it('should create a new unsaved workflow from a template', () => {
    const store = useWorkflowStore()

    store.createWorkflowFromTemplate('correlation-analysis')

    expect(store.workflowName).toBe('相关性排查模板')
    expect(store.currentWorkflowId).toBeNull()
    expect(store.hasUnsavedChanges).toBe(true)
    expect(store.nodes.map((node) => node.data.type)).toEqual([
      'manual-json-import',
      'field-selection',
      'pearson',
    ])
    expect(store.edges).toHaveLength(2)
    expect(store.edges[0]).toMatchObject({
      source: store.nodes[0]?.id,
      target: store.nodes[1]?.id,
    })
    expect(store.edges[1]).toMatchObject({
      source: store.nodes[1]?.id,
      target: store.nodes[2]?.id,
    })
  })

  it('should load template workflow structures from export-compatible json definitions', () => {
    const correlationTemplate = workflowTemplateDefinitions.find(
      (template) => template.id === 'correlation-analysis',
    )

    expect(correlationTemplate).toBeTruthy()
    expect(correlationTemplate?.workflow.name).toBe('相关性排查模板')
    expect(correlationTemplate?.workflow.nodes.map((node) => node.data.type)).toEqual([
      'manual-json-import',
      'field-selection',
      'pearson',
    ])
    expect(correlationTemplate?.workflow.edges).toHaveLength(2)
    expect(correlationTemplate?.workflow.nodes.every((node) => node.data.output === null)).toBe(true)
  })

  it('should create a correlation template that can run immediately with manual json input', async () => {
    const store = useWorkflowStore()

    store.createWorkflowFromTemplate('correlation-analysis')

    await store.runGlobal()

    const sourceNode = store.nodes[0]
    const terminalNode = store.nodes[2]

    expect(sourceNode?.data.type).toBe('manual-json-import')
    expect(sourceNode?.data.config.jsonData).toContain('"target"')
    expect(terminalNode?.data.status).toBe('success')
    expect((terminalNode?.data.output as any)?.kind).toBe('report')
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

  it('should yield a paint turn before executing synchronous local nodes', async () => {
    const syncNodeDefinition = {
      name: 'test-sync-local-node',
      displayName: '同步本地节点',
      icon: 'zap',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: () => createJsonResult({ ok: true }),
    }

    nodeDefinitions.push(syncNodeDefinition)

    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    let executeStarted = false
    const scheduledPaintCallbacks: Array<() => void> = []

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        scheduledPaintCallbacks.push(() => callback(16))
        return 1
      }),
    )

    syncNodeDefinition.execute = () => {
      executeStarted = true
      return createJsonResult({ ok: true })
    }

    try {
      const store = useWorkflowStore()
      const node = store.addAndConnectNode('test-sync-local-node', '同步节点', { x: 0, y: 0 })!

      const executionPromise = store.executeNode(node.id, true)

      expect(store.isRunning).toBe(true)
      expect(store.activeExecutionScope).toBe('single')
      expect(store.activeExecutionNodeId).toBe(node.id)
      expect(executeStarted).toBe(false)

      await Promise.resolve()

      expect(executeStarted).toBe(false)
      expect(scheduledPaintCallbacks).toHaveLength(1)

      scheduledPaintCallbacks[0]?.()
      const result = await executionPromise

      expect(result).toMatchObject({
        kind: 'json',
        payload: { ok: true },
      })
      expect(executeStarted).toBe(true)
      expect(node.data.status).toBe('success')
    } finally {
      const index = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-sync-local-node',
      )
      if (index >= 0) nodeDefinitions.splice(index, 1)

      if (originalRequestAnimationFrame) {
        vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame)
      } else {
        vi.unstubAllGlobals()
      }
    }
  })

  it('should track file import background progress and clear task state after completion', async () => {
    const deferred = createDeferred<ReturnType<typeof createTableResult>>()
    let progressHandler: ((progress: FileImportProgress) => void) | undefined
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(16)
        return 1
      }),
    )

    try {
      vi.spyOn(fileImportTaskModule, 'createFileImportTask').mockImplementation((_file, _options, onProgress) => {
        progressHandler = onProgress
        return {
          result: deferred.promise,
          cancel: vi.fn(),
        }
      })

      const store = useWorkflowStore()
      const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
      node.data.config.fileData = new File(['col1,col2\n1,2'], 'test.csv', { type: 'text/csv' })

      const executionPromise = store.executeNode(node.id, true)
      await vi.waitFor(() => {
        expect(store.fileImportTasks[node.id]).toBeDefined()
      })

      progressHandler?.({ phase: 'parsing', progress: 35 })
      await Promise.resolve()

      expect(store.fileImportTasks[node.id]).toMatchObject({
        phase: 'parsing',
        progress: 35,
        fileName: 'test.csv',
        canCancel: true,
      })

      deferred.resolve(
        createTableResult([{ col1: 1, col2: 2 }], {
          schema: {
            fields: [
              { name: 'col1', type: 'number' },
              { name: 'col2', type: 'number' },
            ],
          },
          meta: { rowCount: 1, filename: 'test.csv', sourceType: 'csv' },
          preview: { summary: '共 1 行，2 个字段', viewer: 'table-chart-combo-viewer' },
        }),
      )

      await executionPromise

      expect(store.fileImportTasks[node.id]).toBeUndefined()
      expect(node.data.status).toBe('success')
    } finally {
      if (originalRequestAnimationFrame) {
        vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame)
      } else {
        vi.unstubAllGlobals()
      }
    }
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

  it('should refresh workflow versions after save and restore the workflow after rollback', async () => {
    const store = useWorkflowStore()
    const restoredWorkflow = {
      id: 'wf_rollback',
      name: '回滚后的工作流',
      updatedAt: 220,
      nodes: [
        {
          id: 'node_rollback',
          type: 'custom',
          position: { x: 24, y: 48 },
          data: {
            label: '回滚节点',
            type: 'manual-json-import',
            category: 'trigger' as const,
            config: {
              jsonData: JSON.stringify([{ feature: 1, target: 2 }]),
            },
            status: 'idle' as const,
            output: null,
            logs: [],
          },
        },
      ],
      edges: [],
    }

    vi.spyOn(storageProvider, 'saveWorkflow').mockResolvedValue(undefined)
    vi.spyOn(storageProvider, 'getWorkflows')
      .mockResolvedValueOnce([
        {
          id: 'wf_rollback',
          name: '版本测试工作流',
          updatedAt: 120,
          nodes: [],
          edges: [],
        } as any,
      ])
      .mockResolvedValueOnce([restoredWorkflow as any])
    vi.spyOn(storageProvider, 'getWorkflowVersions')
      .mockResolvedValueOnce([
        {
          id: 'ver_2',
          workflowId: 'wf_rollback',
          workflowName: '版本测试工作流',
          createdAt: 200,
          workflowUpdatedAt: 120,
          source: 'save',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          id: 'ver_3',
          workflowId: 'wf_rollback',
          workflowName: '回滚后的工作流',
          createdAt: 220,
          workflowUpdatedAt: 220,
          source: 'rollback',
        },
      ] as any)
    vi.spyOn(storageProvider, 'rollbackWorkflowVersion').mockResolvedValue({
      workflow: restoredWorkflow as any,
      version: {
        id: 'ver_3',
        workflowId: 'wf_rollback',
        workflowName: '回滚后的工作流',
        createdAt: 220,
        workflowUpdatedAt: 220,
        source: 'rollback',
      },
    } as any)

    store.workflowName = '版本测试工作流'

    await store.saveWorkflow('版本测试工作流')

    expect(store.workflowVersions).toEqual([
      expect.objectContaining({
        id: 'ver_2',
        workflowId: 'wf_rollback',
      }),
    ])

    await store.rollbackWorkflowVersion('ver_2')

    expect(store.workflowName).toBe('回滚后的工作流')
    expect(store.workflowVersions).toEqual([
      expect.objectContaining({
        id: 'ver_3',
        source: 'rollback',
      }),
    ])
    expect(store.nodes[0]?.data.label).toBe('回滚节点')
  })

  it('should strip runtime input values from workflow persistence snapshots', async () => {
    const store = useWorkflowStore()
    const trigger = store.addAndConnectNode('neighbor-system', '看板数据对接', { x: 0, y: 0 })!

    trigger.data.config.productName = '产品A'
    trigger.data.config.fetchMode = 'time'
    trigger.data.config.timeRange = [
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-07T00:00:00.000Z'),
    ]
    trigger.data.config.materialType = '成品'
    trigger.data.config.selectedProcesses = ['工序A']

    const saved = await store.saveWorkflow('运行时输入剥离')
    const savedNode = saved.nodes[0]

    expect(savedNode?.data.config.productName).toBe('产品A')
    expect(savedNode?.data.config.timeRange).toBeNull()
    expect(savedNode?.data.config.materialType).toBe('')
    expect(savedNode?.data.config.selectedProcesses).toEqual([])
  })

  it('should stop execution when stopExecution is called', async () => {
    let resolveExecution: () => void = () => undefined
    const slowNodeDefinition = {
      name: 'test-stoppable-node',
      displayName: 'Stoppable Node',
      icon: 'loader',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: async () => {
        await new Promise<void>((resolve) => {
          resolveExecution = resolve
        })
        return createJsonResult({ ok: true })
      },
    }

    nodeDefinitions.push(slowNodeDefinition)

    try {
      const store = useWorkflowStore()
      const node = store.addAndConnectNode('test-stoppable-node', '可中断节点', { x: 0, y: 0 })!

      const execPromise = store.executeNode(node.id, true)

      store.stopExecution()
      resolveExecution()

      const result = await execPromise
      expect(result).toBe('STOPPED')
      expect(node.data.status).toBe('idle')
    } finally {
      const nodeIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-stoppable-node')
      if (nodeIndex >= 0) nodeDefinitions.splice(nodeIndex, 1)
    }
  })

  it('should cancel active file import tasks when stopExecution is called', async () => {
    const deferred = createDeferred<ReturnType<typeof createTableResult>>()
    const cancel = vi.fn(() => {
      deferred.reject(new Error('IMPORT_CANCELLED'))
    })
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(16)
        return 1
      }),
    )

    try {
      vi.spyOn(fileImportTaskModule, 'createFileImportTask').mockImplementation(() => ({
        result: deferred.promise,
        cancel,
      }))

      const store = useWorkflowStore()
      const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
      node.data.config.fileData = new File(['col1,col2\n1,2'], 'test.csv', { type: 'text/csv' })

      const executionPromise = store.executeNode(node.id, true)
      await vi.waitFor(() => {
        expect(store.fileImportTasks[node.id]).toBeDefined()
      })

      expect(store.fileImportTasks[node.id]).toMatchObject({
        fileName: 'test.csv',
        canCancel: true,
      })

      store.stopExecution()

      await expect(executionPromise).resolves.toBe('STOPPED')
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(store.fileImportTasks[node.id]).toBeUndefined()
      expect(node.data.status).toBe('idle')
    } finally {
      if (originalRequestAnimationFrame) {
        vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame)
      } else {
        vi.unstubAllGlobals()
      }
    }
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

  it('should allow explicitly resetting saved runtime inputs and disable reuse', () => {
    const store = useWorkflowStore()
    const node = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    const file = new File(['a,b\n1,2'], 'test.csv')

    node.data.reuseLastRuntimeInputs = true
    node.data.config.fileData = file
    node.data.config.format = 'csv'

    store.resetNodeRuntimeInputs(node.id)

    expect(node.data.reuseLastRuntimeInputs).toBe(false)
    expect(node.data.config.fileData).toBeNull()
    expect(node.data.config.format).toBe('csv')
  })

  it('should reuse cached upstream trigger output during downstream debug runs', async () => {
    const triggerDefinition = {
      name: 'test-runtime-trigger',
      displayName: 'Test Runtime Trigger',
      icon: 'test',
      category: 'trigger' as const,
      description: 'test',
      properties: [
        {
          name: 'token',
          displayName: '启动参数',
          type: 'string' as const,
          default: '',
          required: true,
          isRuntimeInput: true,
        },
      ],
      execute: async (_input: null, config: { token: string }) =>
        createTableResult([{ token: config.token }]),
    }

    const actionDefinition = {
      name: 'test-debug-consumer',
      displayName: 'Test Debug Consumer',
      icon: 'test',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: async (input: { kind: string; payload: Array<{ token: string }> } | null) =>
        createJsonResult({
          kind: input?.kind ?? null,
          token: input?.payload?.[0]?.token ?? null,
        }),
    }

    nodeDefinitions.push(triggerDefinition, actionDefinition)

    try {
      const store = useWorkflowStore()
      const trigger = store.addAndConnectNode('test-runtime-trigger', '运行时触发器', { x: 0, y: 0 })!
      const action = store.addAndConnectNode('test-debug-consumer', '调试节点', { x: 300, y: 0 })!

      store.edges.push({
        id: 'e_runtime_trigger_action',
        source: trigger.id,
        target: action.id,
        type: 'n8n',
        animated: true,
      })

      const waitingResult = await store.executeNode(trigger.id, true)
      expect(waitingResult).toBe('WAIT_INPUT')

      trigger.data.config.token = 'cached-token'
      const triggerResult = await store.resumePendingExecution()
      expect(triggerResult?.kind).toBe('table')
      expect(trigger.data.output).toEqual(triggerResult)

      trigger.data.config.token = ''

      const debugResult = await store.executeNode(action.id, true)

      expect(debugResult?.kind).toBe('json')
      expect(debugResult?.payload).toEqual({
        kind: 'table',
        token: 'cached-token',
      })
      expect(
        store.logs.some((log) => log.message.includes('调试策略: 复用上游缓存，仅重新执行节点')),
      ).toBe(true)
      expect(store.pendingExecution).toBeNull()
    } finally {
      const triggerIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-runtime-trigger')
      if (triggerIndex >= 0) nodeDefinitions.splice(triggerIndex, 1)

      const actionIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-debug-consumer')
      if (actionIndex >= 0) nodeDefinitions.splice(actionIndex, 1)
    }
  })

  it('should rerun upstream nodes when downstream debug uses rerun-upstream strategy', async () => {
    const triggerDefinition = {
      name: 'test-rerun-trigger',
      displayName: 'Test Rerun Trigger',
      icon: 'test',
      category: 'trigger' as const,
      description: 'test',
      properties: [
        {
          name: 'token',
          displayName: '启动参数',
          type: 'string' as const,
          default: '',
          required: true,
          isRuntimeInput: true,
        },
      ],
      execute: async (_input: null, config: { token: string }) =>
        createTableResult([{ token: config.token }]),
    }

    const actionDefinition = {
      name: 'test-rerun-consumer',
      displayName: 'Test Rerun Consumer',
      icon: 'test',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: async (input: { kind: string; payload: Array<{ token: string }> } | null) =>
        createJsonResult({
          kind: input?.kind ?? null,
          token: input?.payload?.[0]?.token ?? null,
        }),
    }

    nodeDefinitions.push(triggerDefinition, actionDefinition)

    try {
      const store = useWorkflowStore()
      const trigger = store.addAndConnectNode('test-rerun-trigger', '运行时触发器', { x: 0, y: 0 })!
      const action = store.addAndConnectNode('test-rerun-consumer', '调试节点', { x: 300, y: 0 })!

      store.edges.push({
        id: 'e_rerun_trigger_action',
        source: trigger.id,
        target: action.id,
        type: 'n8n',
        animated: true,
      })

      const waitingResult = await store.executeNode(trigger.id, true)
      expect(waitingResult).toBe('WAIT_INPUT')

      trigger.data.config.token = 'cached-token'
      await store.resumePendingExecution()
      expect((trigger.data.output as any)?.payload?.[0]?.token).toBe('cached-token')

      trigger.data.config.token = 'fresh-token'

      const debugResult = await store.executeNode(action.id, true, 'single', {
        rerunUpstream: true,
      })

      expect(debugResult?.kind).toBe('json')
      expect(debugResult?.payload).toEqual({
        kind: 'table',
        token: 'fresh-token',
      })
      expect((trigger.data.output as any)?.payload?.[0]?.token).toBe('fresh-token')
      expect(
        store.logs.some((log) => log.message.includes('调试策略: 强制重跑上游后执行节点')),
      ).toBe(true)
    } finally {
      const triggerIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-rerun-trigger')
      if (triggerIndex >= 0) nodeDefinitions.splice(triggerIndex, 1)

      const actionIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-rerun-consumer')
      if (actionIndex >= 0) nodeDefinitions.splice(actionIndex, 1)
    }
  })

  it('should continue the current debug node after filling upstream runtime inputs', async () => {
    const triggerDefinition = {
      name: 'test-debug-runtime-trigger',
      displayName: 'Test Debug Runtime Trigger',
      icon: 'test',
      category: 'trigger' as const,
      description: 'test',
      properties: [
        {
          name: 'token',
          displayName: '启动参数',
          type: 'string' as const,
          default: '',
          required: true,
          isRuntimeInput: true,
        },
      ],
      execute: async (_input: null, config: { token: string }) =>
        createTableResult([{ token: config.token }]),
    }

    const actionDefinition = {
      name: 'test-debug-runtime-consumer',
      displayName: 'Test Debug Runtime Consumer',
      icon: 'test',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: async (input: { kind: string; payload: Array<{ token: string }> } | null) =>
        createJsonResult({
          kind: input?.kind ?? null,
          token: input?.payload?.[0]?.token ?? null,
          autoResumed: true,
        }),
    }

    nodeDefinitions.push(triggerDefinition, actionDefinition)

    try {
      const store = useWorkflowStore()
      const trigger = store.addAndConnectNode('test-debug-runtime-trigger', '运行时触发器', { x: 0, y: 0 })!
      const action = store.addAndConnectNode('test-debug-runtime-consumer', '调试节点', { x: 300, y: 0 })!

      store.edges.push({
        id: 'e_debug_runtime_trigger_action',
        source: trigger.id,
        target: action.id,
        type: 'n8n',
        animated: true,
      })

      const waitingResult = await store.executeNode(action.id, true)

      expect(waitingResult).toBe('WAIT_INPUT')
      expect(store.pendingExecution?.nodeId).toBe(trigger.id)
      expect(store.pendingExecution?.resumeNodeId).toBe(action.id)

      trigger.data.config.token = 'runtime-token'

      const resumedResult = await store.resumePendingExecution()

      expect(resumedResult?.kind).toBe('json')
      expect(resumedResult?.payload).toEqual({
        kind: 'table',
        token: 'runtime-token',
        autoResumed: true,
      })
      expect(action.data.output).toEqual(resumedResult)
      expect(action.data.status).toBe('success')
      expect(trigger.data.status).toBe('success')
      expect(store.pendingExecution).toBeNull()
    } finally {
      const triggerIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-debug-runtime-trigger')
      if (triggerIndex >= 0) nodeDefinitions.splice(triggerIndex, 1)

      const actionIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-debug-runtime-consumer')
      if (actionIndex >= 0) nodeDefinitions.splice(actionIndex, 1)
    }
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

  it('should map common execution errors to clearer chinese guidance', async () => {
    const failingDefinition = {
      name: 'test-readable-error-node',
      displayName: 'Test Readable Error Node',
      icon: 'test',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: async () => {
        throw new Error('无可分析的输入数据')
      },
    }

    nodeDefinitions.push(failingDefinition)

    try {
      const store = useWorkflowStore()
      const node = store.addAndConnectNode('test-readable-error-node', '失败节点', { x: 0, y: 0 })!

      await expect(store.executeNode(node.id, true)).rejects.toThrow(
        '当前节点没有可分析输入，请先检查上游输出或左侧模拟输入',
      )
      expect(node.data.error).toBe('当前节点没有可分析输入，请先检查上游输出或左侧模拟输入')
      expect(
        store.logs.some((log) =>
          log.message.includes('执行失败: 当前节点没有可分析输入，请先检查上游输出或左侧模拟输入'),
        ),
      ).toBe(true)
    } finally {
      const failingIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-readable-error-node')
      if (failingIndex >= 0) nodeDefinitions.splice(failingIndex, 1)
    }
  })

  it('should keep global run alive and collect runtime inputs for multiple trigger nodes', async () => {
    const runtimeTriggerDefinition = {
      name: 'test-runtime-queue-trigger',
      displayName: 'Runtime Queue Trigger',
      icon: 'database',
      category: 'trigger' as const,
      description: 'test',
      properties: [
        {
          name: 'token',
          displayName: '启动参数',
          type: 'string' as const,
          default: '',
          required: true,
          isRuntimeInput: true,
        },
      ],
      execute: async (_input: null, config: { token: string }) =>
        createTableResult([{ a: 1, b: config.token.length }]),
    }

    nodeDefinitions.push(runtimeTriggerDefinition)

    try {
      const store = useWorkflowStore()
      const trigger1 = store.addAndConnectNode('test-runtime-queue-trigger', '触发器一', {
        x: 0,
        y: 0,
      })!
      const trigger2 = store.addAndConnectNode('test-runtime-queue-trigger', '触发器二', {
        x: 0,
        y: 120,
      })!
      const mergeNode = store.addAndConnectNode('data-merge', '数据合并', { x: 320, y: 60 })!
      const terminalNode = store.addAndConnectNode('chart-display', '图表展示', { x: 640, y: 60 })!
      terminalNode.data.config = {
        chartType: 'scatter',
        xAxis: 'a',
        yAxis: 'b',
      }

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
          if (store.pendingExecution) {
            await new Promise((resolve) => setTimeout(resolve, 0))
            return
          }
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
        pendingNode.data.config.token = `runtime-${i + 1}`
        await store.resumePendingExecution()
      }

      await runPromise

      expect(store.pendingExecution).toBeNull()
      expect(store.isRunning).toBe(false)
      expect(terminalNode.data.status).toBe('success')
      expect(store.executionHistory[0]!.status).toBe('success')
    } finally {
      const definitionIndex = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-runtime-queue-trigger',
      )
      if (definitionIndex >= 0) nodeDefinitions.splice(definitionIndex, 1)
    }
  })

  it('should stop global execution when pending runtime input is cancelled', async () => {
    const store = useWorkflowStore()
    const triggerNode = store.addAndConnectNode('file-import', '文件导入', { x: 0, y: 0 })!
    const terminalNode = store.addAndConnectNode('data-export', '数据导出', { x: 240, y: 0 })!

    store.edges.push({
      id: 'e_trigger_terminal_runtime_cancel',
      source: triggerNode.id,
      target: terminalNode.id,
      type: 'n8n',
      animated: true,
    })

    const waitForPending = async () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (store.pendingExecution) return
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error('等待运行时参数输入超时')
    }

    const runPromise = store.runGlobal()

    await waitForPending()
    expect(store.isRunning).toBe(true)
    expect(store.pendingExecution?.executionScope).toBe('global')

    store.cancelPendingExecution()

    await runPromise

    expect(store.pendingExecution).toBeNull()
    expect(store.isRunning).toBe(false)
    expect(store.isStopping).toBe(false)
    expect(terminalNode.data.status).toBe('idle')
    expect(store.lastRunDashboard).toBeNull()
    expect(store.executionHistory).toHaveLength(0)
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

  it('should preserve historical node outputs when entering history mode', async () => {
    const store = useWorkflowStore()
    const triggerNode = store.addAndConnectNode('file-import', 'Trigger', { x: 0, y: 0 })!
    const terminalNode = store.addAndConnectNode('chart-display', '图表展示', { x: 300, y: 0 })!

    store.edges.push({
      id: 'e_history_trigger_terminal',
      source: triggerNode.id,
      target: terminalNode.id,
      type: 'n8n',
      animated: true,
    })

    triggerNode.data.config.fileData = new File(['x,y\n1,2'], 'history.csv')
    terminalNode.data.config = { chartType: 'scatter', xAxis: 'x', yAxis: 'y' }

    await store.runGlobal()

    const record = store.executionHistory[0]!
    const triggerSnapshot = record.nodes.find((node) => node.id === triggerNode.id)
    const terminalSnapshot = record.nodes.find((node) => node.id === terminalNode.id)

    expect(triggerSnapshot?.data.output).toMatchObject({ kind: 'table' })
    expect(terminalSnapshot?.data.output).toMatchObject({ kind: 'chart' })

    store.enterHistoryMode(record.id)

    expect(store.isHistoryMode).toBe(true)
    expect(store.nodes.find((node) => node.id === triggerNode.id)?.data.output).toMatchObject({
      kind: 'table',
    })
    expect(store.nodes.find((node) => node.id === terminalNode.id)?.data.output).toMatchObject({
      kind: 'chart',
    })
  })

  it('should preserve full table outputs in history snapshots', async () => {
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
      expect(triggerSnapshot.payload).toHaveLength(120)
      expect(triggerSnapshot.meta?.historyTruncated).toBeUndefined()
      expect(triggerSnapshot.meta?.originalRowCount).toBeUndefined()

      const record = store.executionHistory[0]!
      store.enterHistoryMode(record.id)

      const historicalTriggerOutput = store.nodes.find((node) => node.id === triggerNode.id)?.data.output as any
      expect(historicalTriggerOutput.kind).toBe('table')
      expect(historicalTriggerOutput.payload).toHaveLength(120)
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

  it('should preserve full report details in history snapshots', async () => {
    const reportTriggerDefinition = {
      name: 'test-large-report-history-trigger',
      displayName: 'Large Report Trigger',
      icon: 'database',
      category: 'trigger' as const,
      description: 'test',
      properties: [],
      execute: async () => createJsonResult({ source: 'report-input' }),
    }

    const reportTerminalDefinition = {
      name: 'test-large-report-history-terminal',
      displayName: 'Large Report Terminal',
      icon: 'file-json',
      category: 'terminal' as const,
      description: 'test',
      properties: [],
      execute: async () => ({
        kind: 'report' as const,
        payload: {
          title: '超大报告',
          sections: [
            {
              key: 'details',
              type: 'details',
              items: Array.from({ length: 120 }, (_, index) => ({
                feature: `字段_${index + 1}`,
                score: index,
              })),
              allItems: Array.from({ length: 140 }, (_, index) => ({
                feature: `明细_${index + 1}`,
                score: index,
              })),
              option: {
                series: [
                  {
                    type: 'line',
                    data: Array.from({ length: 480 }, (_, index) => index),
                  },
                ],
              },
            },
          ],
        },
        meta: {
          sourceData: Array.from({ length: 180 }, (_, index) => ({ index })),
        },
      }),
    }

    nodeDefinitions.push(reportTriggerDefinition, reportTerminalDefinition)

    try {
      const store = useWorkflowStore()
      const triggerNode = store.addAndConnectNode(
        'test-large-report-history-trigger',
        'Large Report Trigger',
        { x: 0, y: 0 },
      )!
      const terminalNode = store.addAndConnectNode(
        'test-large-report-history-terminal',
        'Large Report Terminal',
        { x: 300, y: 0 },
      )!

      store.edges.push({
        id: 'e_large_report_history_terminal',
        source: triggerNode.id,
        target: terminalNode.id,
        type: 'n8n',
        animated: true,
      })

      await store.runGlobal()

      const reportSnapshot = store.executionHistory[0]!.nodes.find(
        (node) => node.id === terminalNode.id,
      )!.data.output as any

      expect(reportSnapshot.kind).toBe('report')
      expect(reportSnapshot.meta?.historyTruncated).toBeUndefined()
      expect(reportSnapshot.meta?.sourceData).toHaveLength(180)
      expect(reportSnapshot.payload.sections[0].items).toHaveLength(120)
      expect(reportSnapshot.payload.sections[0].allItems).toHaveLength(140)
      expect(reportSnapshot.payload.sections[0].option.series[0].data).toHaveLength(480)

      const record = store.executionHistory[0]!
      store.enterHistoryMode(record.id)

      const historicalReportOutput = store.nodes.find((node) => node.id === terminalNode.id)?.data.output as any
      expect(historicalReportOutput.kind).toBe('report')
      expect(historicalReportOutput.meta?.sourceData).toHaveLength(180)
      expect(historicalReportOutput.payload.sections[0].items).toHaveLength(120)
      expect(historicalReportOutput.payload.sections[0].allItems).toHaveLength(140)
      expect(historicalReportOutput.payload.sections[0].option.series[0].data).toHaveLength(480)
    } finally {
      const triggerIndex = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-large-report-history-trigger',
      )
      if (triggerIndex >= 0) nodeDefinitions.splice(triggerIndex, 1)

      const terminalIndex = nodeDefinitions.findIndex(
        (definition) => definition.name === 'test-large-report-history-terminal',
      )
      if (terminalIndex >= 0) nodeDefinitions.splice(terminalIndex, 1)
    }
  })

  it('should execute immediate nodes without waiting for a fixed timer', async () => {
    vi.useFakeTimers()
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(16)
        return 1
      }),
    )

    const fastNodeDefinition = {
      name: 'test-fast-node',
      displayName: 'Fast Node',
      icon: 'zap',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: async () => createJsonResult({ ok: true }),
    }

    nodeDefinitions.push(fastNodeDefinition)

    try {
      const store = useWorkflowStore()
      const node = store.addAndConnectNode('test-fast-node', 'Fast Node', { x: 0, y: 0 })!

      const executionPromise = store.executeNode(node.id, true)

      expect(vi.getTimerCount()).toBe(0)
      await expect(executionPromise).resolves.toMatchObject({
        kind: 'json',
        payload: { ok: true },
      })
    } finally {
      if (originalRequestAnimationFrame) {
        vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame)
      } else {
        vi.unstubAllGlobals()
      }

      const nodeIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-fast-node')
      if (nodeIndex >= 0) nodeDefinitions.splice(nodeIndex, 1)
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

  it('should execute a node for ai inspection without mutating workflow runtime state', async () => {
    const triggerDefinition = {
      name: 'test-ai-inspection-trigger',
      displayName: 'AI Inspection Trigger',
      icon: 'test',
      category: 'trigger' as const,
      description: 'test',
      properties: [
        {
          name: 'token',
          displayName: '启动参数',
          type: 'string' as const,
          default: '',
          required: true,
          isRuntimeInput: true,
        },
      ],
      execute: async (_input: null, config: { token: string }) =>
        createTableResult([{ token: config.token, feature: 1, target: 2 }]),
    }

    const actionDefinition = {
      name: 'test-ai-inspection-action',
      displayName: 'AI Inspection Action',
      icon: 'test',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: async (input: { kind: string; payload: Array<{ token: string; feature: number; target: number }> } | null) =>
        createTableResult(input?.payload ?? []),
    }

    nodeDefinitions.push(triggerDefinition, actionDefinition)

    try {
      const store = useWorkflowStore()
      const trigger = store.addAndConnectNode('test-ai-inspection-trigger', '检查触发器', { x: 0, y: 0 })!
      const action = store.addAndConnectNode('test-ai-inspection-action', '检查动作', { x: 300, y: 0 })!

      store.edges.push({
        id: 'e_ai_inspection',
        source: trigger.id,
        target: action.id,
        type: 'n8n',
        animated: true,
      })

      trigger.data.config.token = 'inspection-token'
      const originalNodes = JSON.parse(JSON.stringify(store.nodes))
      const originalLogs = JSON.parse(JSON.stringify(store.logs))

      const result = await store.executeForAiInspection(action.id)

      expect(result?.kind).toBe('table')
      expect((result as any)?.payload?.[0]).toMatchObject({
        token: 'inspection-token',
        feature: 1,
        target: 2,
      })
      expect(store.nodes).toEqual(originalNodes)
      expect(store.logs).toEqual(originalLogs)
      expect(store.executionHistory).toHaveLength(0)
      expect(store.pendingExecution).toBeNull()
      expect(store.isRunning).toBe(false)
    } finally {
      const triggerIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-ai-inspection-trigger')
      if (triggerIndex >= 0) nodeDefinitions.splice(triggerIndex, 1)

      const actionIndex = nodeDefinitions.findIndex((definition) => definition.name === 'test-ai-inspection-action')
      if (actionIndex >= 0) nodeDefinitions.splice(actionIndex, 1)
    }
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

  it('should serialize selected nodes with only internal edges and stripped runtime state', () => {
    const store = useWorkflowStore()
    const trigger = store.addAndConnectNode('neighbor-system', '看板数据', { x: 80, y: 120 })!
    const action = store.addAndConnectNode('data-cleaning', '数据清洗', { x: 320, y: 120 })!
    const terminal = store.addAndConnectNode('pearson', 'Pearson', { x: 560, y: 120 })!

    store.connectNodesById(trigger.id, action.id)
    store.connectNodesById(action.id, terminal.id)

    trigger.selected = true
    action.selected = true
    trigger.data.status = 'success'
    trigger.data.output = createJsonResult({ rows: 3 })
    trigger.data.logs = ['运行日志']
    trigger.data.config.productName = '产品A'
    trigger.data.config.fetchMode = 'time'
    trigger.data.config.timeRange = [new Date('2026-04-01T00:00:00.000Z'), new Date('2026-04-02T00:00:00.000Z')]
    trigger.data.config.materialType = '成品'
    trigger.data.config.selectedProcesses = ['工序A']

    const selection = store.serializeNodeSelection([trigger.id, action.id])

    expect(selection.nodes).toHaveLength(2)
    expect(selection.edges).toHaveLength(1)
    expect(selection.edges[0]).toMatchObject({
      source: trigger.id,
      target: action.id,
      type: 'n8n',
    })
    expect(selection.nodes[0]?.data.status).toBe('idle')
    expect(selection.nodes[0]?.data.output).toBeNull()
    expect(selection.nodes[0]?.data.logs).toEqual([])
    expect(selection.nodes[0]?.data.config.productName).toBe('产品A')
    expect(selection.nodes[0]?.data.config.timeRange).toBeNull()
    expect(selection.nodes[0]?.data.config.materialType).toBe('')
    expect(selection.nodes[0]?.data.config.selectedProcesses).toEqual([])
  })

  it('should duplicate selected nodes immediately with offset, suffix and preserved internal edges', () => {
    const store = useWorkflowStore()
    const trigger = store.addAndConnectNode('manual-json-import', '数据输入', { x: 80, y: 120 })!
    const action = store.addAndConnectNode('data-cleaning', '数据清洗', { x: 320, y: 120 })!
    store.connectNodesById(trigger.id, action.id)
    trigger.selected = true
    action.selected = true

    const duplicated = store.duplicateSelectedNodes()

    expect(duplicated).toHaveLength(2)
    expect(store.nodes).toHaveLength(4)
    expect(duplicated[0]?.position).toEqual({ x: 120, y: 160 })
    expect(duplicated[0]?.data.label).toBe('数据输入 (副本)')
    expect(duplicated[1]?.data.label).toBe('数据清洗 (副本)')

    const duplicatedIds = new Set(duplicated.map((node) => node.id))
    const duplicatedEdges = store.edges.filter(
      (edge) => duplicatedIds.has(edge.source) && duplicatedIds.has(edge.target),
    )
    expect(duplicatedEdges).toHaveLength(1)
    expect(duplicatedEdges[0]?.type).toBe('n8n')
  })

  it('should copy selection as text and allow deserializing it back into a workflow selection payload', async () => {
    const store = useWorkflowStore()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        readText: vi.fn().mockResolvedValue(''),
        writeText,
      },
    })

    const trigger = store.addAndConnectNode('manual-json-import', '数据输入', { x: 100, y: 120 })!
    const action = store.addAndConnectNode('data-cleaning', '数据清洗', { x: 320, y: 120 })!
    store.connectNodesById(trigger.id, action.id)
    trigger.selected = true
    action.selected = true

    const text = await store.copySelectionAsText()
    expect(text).not.toBeNull()
    if (!text) {
      throw new Error('expected selection text to be created')
    }
    const parsed = store.deserializeSelectionText(text)

    expect(writeText).toHaveBeenCalledWith(text)
    expect(parsed).not.toBeNull()
    expect(parsed?.kind).toBe('workflow-selection')
    expect(parsed?.version).toBe(1)
    expect(parsed?.nodes).toHaveLength(2)
    expect(parsed?.edges).toHaveLength(1)
  })

  it('should paste a copied selection with recreated ids and preserved internal edges', async () => {
    const store = useWorkflowStore()
    const readText = vi.fn().mockResolvedValue('not-workflow-selection')
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        readText,
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    const trigger = store.addAndConnectNode('manual-json-import', '数据输入', { x: 80, y: 120 })!
    const action = store.addAndConnectNode('data-cleaning', '数据清洗', { x: 320, y: 120 })!
    store.connectNodesById(trigger.id, action.id)
    trigger.selected = true
    action.selected = true

    const copied = store.duplicateSelectionToClipboard()
    const pasted = await store.pasteClipboardSelection({ x: 900, y: 420 })

    expect(copied?.nodes).toHaveLength(2)
    expect(pasted).toHaveLength(2)
    expect(store.nodes).toHaveLength(4)

    const pastedIds = new Set(pasted.map((node) => node.id))
    expect(pastedIds.has(trigger.id)).toBe(false)
    expect(pastedIds.has(action.id)).toBe(false)

    const internalPastedEdges = store.edges.filter(
      (edge) => pastedIds.has(edge.source) && pastedIds.has(edge.target),
    )
    expect(internalPastedEdges).toHaveLength(1)
    expect(internalPastedEdges[0]?.type).toBe('n8n')
  })

  it('should batch remove selected nodes and their related edges', () => {
    const store = useWorkflowStore()
    const trigger = store.addAndConnectNode('manual-json-import', '数据输入', { x: 0, y: 0 })!
    const action = store.addAndConnectNode('data-cleaning', '数据清洗', { x: 320, y: 0 })!
    const terminal = store.addAndConnectNode('pearson', 'Pearson', { x: 640, y: 0 })!

    store.connectNodesById(trigger.id, action.id)
    store.connectNodesById(action.id, terminal.id)
    trigger.selected = true
    action.selected = true

    const removed = store.removeSelectedNodes()

    expect(removed.map((node) => node.id)).toEqual([trigger.id, action.id])
    expect(store.nodes).toHaveLength(1)
    expect(store.nodes[0]?.id).toBe(terminal.id)
    expect(store.edges).toHaveLength(0)
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

  it('should export workflow json without output fields', async () => {
    const store = useWorkflowStore()
    const trigger = store.addAndConnectNode('manual-json-import', '数据输入', { x: 0, y: 0 })!
    const action = store.addAndConnectNode('data-cleaning', '数据清洗', { x: 320, y: 0 })!

    trigger.data.config.jsonData = JSON.stringify([{ feature: 1, target: 2 }])
    trigger.data.isPinned = true
    trigger.data.output = createTableResult([{ feature: 1, target: 2 }])
    action.data.output = createJsonResult({ preview: 'cached' })

    let exportedBlob: Blob | null = null
    const click = vi.fn()
    const originalCreateElement = document.createElement.bind(document)

    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      exportedBlob = blob as Blob
      return 'blob:workflow-export'
    })
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        return {
          click,
          href: '',
          download: '',
        } as unknown as HTMLAnchorElement
      }
      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    try {
      store.exportWorkflow()

      expect(click).toHaveBeenCalledTimes(1)
      expect(exportedBlob).not.toBeNull()

      const exported = JSON.parse(await exportedBlob!.text())
      expect(exported.name).toBe('未命名工作流')
      expect(exported.nodes).toHaveLength(2)
      expect(exported.nodes.every((node: any) => !Object.prototype.hasOwnProperty.call(node.data, 'output'))).toBe(true)
      expect(exported.nodes[0]!.data.config.jsonData).toBe(JSON.stringify([{ feature: 1, target: 2 }]))
      expect(exported.edges).toEqual(store.edges)
    } finally {
      createObjectUrlSpy.mockRestore()
      revokeObjectUrlSpy.mockRestore()
      createElementSpy.mockRestore()
    }
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
          nodeType: 'data-missing-outlier',
          nodeLabel: '缺失值处理',
          position: { x: 320, y: 40 },
        },
        {
          id: 'create-terminal',
          type: 'createNode',
          nodeType: 'correlation-analysis',
          nodeLabel: '单调性分析',
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
          label: '相关性结果',
        },
        {
          id: 'update-terminal-config',
          type: 'updateNodeConfig',
          nodeRef: 'create-terminal',
          config: {
            xFields: ['x'],
            yFields: ['y'],
          },
        },
      ],
    } as any)

    expect(result.applied).toBe(true)
    expect(store.nodes).toHaveLength(3)
    expect(store.edges).toHaveLength(2)
    expect(store.nodes.map((node) => node.data.label)).toEqual(
      expect.arrayContaining(['手动输入', '缺失值处理', '相关性结果']),
    )
    const terminalNode = store.nodes.find((node) => node.data.label === '相关性结果')!
    expect(terminalNode.data.config.xFields).toEqual(['x'])
    expect(terminalNode.data.config.yFields).toEqual(['y'])
    expect(
      store.edges.some(
        (edge) =>
          edge.source === store.nodes.find((node) => node.data.label === '手动输入')!.id &&
          edge.target === store.nodes.find((node) => node.data.label === '缺失值处理')!.id,
      ),
    ).toBe(true)
  })
})

