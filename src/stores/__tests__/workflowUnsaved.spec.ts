import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowStore } from '../workflowStore'

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
})
