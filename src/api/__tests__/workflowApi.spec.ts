import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { WorkflowApi } from '../workflowApi'
import { useWorkflowStore } from '@/stores/workflowStore'

describe('WorkflowApi', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('runs the real workflow path and returns persisted execution details', async () => {
    const store = useWorkflowStore()
    const trigger = WorkflowApi.addNode('manual-json-import', '数据输入', { x: 0, y: 0 })
    const terminal = WorkflowApi.addNode('pearson', 'Pearson', { x: 320, y: 0 })

    trigger.data.config.jsonData = JSON.stringify([
      { price: 10, sales: 100 },
      { price: 12, sales: 120 },
      { price: 14, sales: 140 },
      { price: 16, sales: 155 },
    ])
    terminal.data.config.xFields = ['price']
    terminal.data.config.yFields = ['sales']

    WorkflowApi.connectNodes(trigger.id, terminal.id)

    const result = await WorkflowApi.runWorkflow()

    expect(result).toMatchObject({
      ok: true,
      scope: 'global',
      status: 'success',
      executionId: expect.any(String),
      dashboardSummary: expect.objectContaining({
        workflowName: store.workflowName,
        executionTargetIds: [terminal.id],
      }),
    })
    expect(store.executionHistory[0]?.id).toBe(result.executionId)
    expect(store.lastRunDashboard?.status).toBe('success')
    expect(store.nodes.find((node) => node.id === terminal.id)?.data.status).toBe('success')
  })
})
