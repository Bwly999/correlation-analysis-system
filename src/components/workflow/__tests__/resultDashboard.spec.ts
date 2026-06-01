import { describe, expect, it } from 'vitest'
import { createChartResult, createReportResult, createTableResult } from '@/nodes/result'
import type { WorkflowNode } from '@/utils/storage'
import {
  buildResultDashboardGroups,
  buildResultDashboardSummary,
  getDefaultSelectedNodeIds,
} from '../resultDashboard'

type WorkflowNodeOverride = Omit<Partial<WorkflowNode>, 'data'> & {
  data?: Partial<WorkflowNode['data']>
}

const createNode = (overrides: WorkflowNodeOverride): WorkflowNode => {
  const overrideData = overrides.data ?? {}

  return {
    id: overrides.id ?? 'node-default',
    type: overrides.type ?? 'custom',
    position: overrides.position ?? { x: 0, y: 0 },
    label: overrides.label,
    data: {
      label: '默认节点',
      type: 'manual-json-import',
      category: 'action',
      config: {},
      status: 'idle',
      logs: [],
      output: null,
      ...overrideData,
    },
  } as WorkflowNode
}

describe('resultDashboard helpers', () => {
  it('defaults to terminal nodes with outputs and groups nodes by result state', () => {
    const runtimeById = {
      terminal_1: createReportResult({ title: '报告', sections: [] }),
      action_1: createTableResult([{ a: 1 }]),
    } as const
    const terminal = createNode({
      id: 'terminal_1',
      data: {
        label: '相关性分析',
        type: 'pearson',
        category: 'terminal',
        status: 'success',
      },
    })
    const action = createNode({
      id: 'action_1',
      data: {
        label: '字段筛选',
        type: 'field-selection',
        category: 'action',
        status: 'success',
      },
    })
    const failed = createNode({
      id: 'action_2',
      data: {
        label: '图表展示',
        type: 'chart-display',
        category: 'terminal',
        status: 'error',
      },
    })

    const summary = buildResultDashboardSummary({
      status: 'error',
      startTime: Date.now(),
      duration: 1200,
      workflowName: '测试工作流',
      executionTargetIds: ['terminal_1', 'action_2'],
      terminalNodeIds: ['terminal_1', 'action_2'],
      nodes: [terminal, action, failed],
      getNodeOutput: (nodeId) => runtimeById[nodeId as keyof typeof runtimeById] ?? null,
      getNodeError: (nodeId) => (nodeId === 'action_2' ? '执行失败' : undefined),
    })

    expect(getDefaultSelectedNodeIds(summary.nodes)).toEqual(['terminal_1'])

    const groups = buildResultDashboardGroups(summary.nodes)
    expect(groups.withOutput.map((item) => item.nodeId)).toEqual(['terminal_1', 'action_1'])
    expect(groups.withError.map((item) => item.nodeId)).toEqual(['action_2'])
    expect(groups.withoutOutput).toEqual([])
  })

  it('falls back to executed leaf result nodes when there is no terminal output', () => {
    const runtimeById = {
      leaf_1: createChartResult({ title: { text: '图表' } }),
      upstream_1: createTableResult([{ factor: 1 }]),
    } as const
    const leaf = createNode({
      id: 'leaf_1',
      data: {
        label: '数据体检',
        type: 'data-profiling',
        category: 'action',
        status: 'success',
      },
    })
    const upstream = createNode({
      id: 'upstream_1',
      data: {
        label: '手动输入',
        type: 'manual-json-import',
        category: 'trigger',
        status: 'success',
      },
    })

    const summary = buildResultDashboardSummary({
      status: 'success',
      startTime: Date.now(),
      duration: 900,
      workflowName: '无终止节点工作流',
      executionTargetIds: ['leaf_1'],
      terminalNodeIds: [],
      nodes: [leaf, upstream],
      getNodeOutput: (nodeId) => runtimeById[nodeId as keyof typeof runtimeById] ?? null,
      getNodeError: () => undefined,
    })

    expect(getDefaultSelectedNodeIds(summary.nodes)).toEqual(['leaf_1'])
  })
})
