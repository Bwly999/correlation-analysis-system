import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowStore } from '../workflowStore'
import { storageProvider } from '@/utils/storage'

describe('workflow unsaved state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('tracks unsaved changes after editing and resets after saving', async () => {
    const store = useWorkflowStore()

    expect(store.hasUnsavedChanges).toBe(false)

    store.addAndConnectNode('file-import', '导入数据', { x: 0, y: 0 })

    expect(store.hasUnsavedChanges).toBe(true)

    await store.saveWorkflow('测试工作流')

    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('marks a loaded workflow as clean until it changes again', async () => {
    const store = useWorkflowStore()

    store.addAndConnectNode('file-import', '导入数据', { x: 0, y: 0 })
    const saved = await store.saveWorkflow('已保存工作流')

    store.createNewWorkflow()
    expect(store.hasUnsavedChanges).toBe(false)

    await store.loadWorkflow(saved.id)
    expect(store.hasUnsavedChanges).toBe(false)

    store.workflowName = '已保存工作流-修改后'
    expect(store.hasUnsavedChanges).toBe(true)
  })

  it('keeps a saved workflow clean after running it', async () => {
    const store = useWorkflowStore()

    const trigger = store.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })
    const terminal = store.addAndConnectNode('chart-display', '图表展示', { x: 280, y: 0 })

    store.edges = [
      {
        id: 'edge_saved_run_clean',
        source: trigger.id,
        target: terminal.id,
        type: 'n8n',
        animated: true,
      },
    ]

    await store.saveWorkflow('运行后不应变脏')

    expect(store.hasUnsavedChanges).toBe(false)

    await store.runGlobal()

    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('keeps a loaded legacy workflow clean after runtime fills default config', async () => {
    await storageProvider.saveWorkflow({
      id: 'legacy_workflow',
      name: '旧工作流',
      updatedAt: Date.now(),
      nodes: [
        {
          id: 'trigger_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          label: '手动输入数据',
          data: {
            label: '手动输入数据',
            type: 'manual-json-import',
            category: 'trigger',
            status: 'idle',
            config: {
              jsonData: '[{"x":1,"y":2},{"x":3,"y":4}]',
            },
            logs: [],
            useManualInput: false,
            manualInput: '',
            isPinned: false,
          },
        },
        {
          id: 'terminal_1',
          type: 'custom',
          position: { x: 280, y: 0 },
          label: '图表展示',
          data: {
            label: '图表展示',
            type: 'chart-display',
            category: 'terminal',
            status: 'idle',
            config: {},
            logs: [],
            useManualInput: false,
            manualInput: '',
            isPinned: false,
          },
        },
      ],
      edges: [
        {
          id: 'legacy_edge',
          source: 'trigger_1',
          target: 'terminal_1',
          type: 'n8n',
          animated: true,
        },
      ],
    })

    const store = useWorkflowStore()
    await store.loadWorkflow('legacy_workflow')

    expect(store.hasUnsavedChanges).toBe(false)

    await store.runGlobal()

    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('does not treat transient node selection state as unsaved changes', async () => {
    const store = useWorkflowStore()

    const node = store.addAndConnectNode('file-import', '导入数据', { x: 0, y: 0 })
    await store.saveWorkflow('选择状态不应变脏')

    expect(store.hasUnsavedChanges).toBe(false)

    node.selected = true
    node.dragging = true

    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('does not treat transient edge runtime state as unsaved changes', async () => {
    const store = useWorkflowStore()

    const trigger = store.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })
    const terminal = store.addAndConnectNode('chart-display', '图表展示', { x: 280, y: 0 })

    store.edges = [
      {
        id: 'edge_transient_runtime_state',
        source: trigger.id,
        target: terminal.id,
        type: 'n8n',
        animated: true,
      } as any,
    ]

    await store.saveWorkflow('边状态不应变脏')

    expect(store.hasUnsavedChanges).toBe(false)

    ;(store.edges[0] as any).selected = true
    ;(store.edges[0] as any).sourceX = 120
    ;(store.edges[0] as any).targetX = 360

    expect(store.hasUnsavedChanges).toBe(false)
  })
})
