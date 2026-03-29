import { describe, expect, it } from 'vitest'
import type { WorkflowAiPlan } from '@/ai/types'
import {
  buildRecoverableDraftPlanFromIssues,
  createDraftGraphFromPlan,
  finalizeDraftGraphToPlan,
} from '../graph'

describe('ai draft graph', () => {
  it('round-trips a minimal create-and-connect plan through the draft graph', () => {
    const plan: WorkflowAiPlan = {
      summary: '创建相关性分析流',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        {
          id: 'node_import',
          type: 'createNode',
          nodeType: 'manual-json-import',
          nodeLabel: '手动输入数据',
          position: { x: 120, y: 80 },
          config: { jsonData: '[]' },
        },
        {
          id: 'node_pearson',
          type: 'createNode',
          nodeType: 'pearson',
          nodeLabel: 'Pearson 相关系数',
        },
        {
          id: 'edge_1',
          type: 'connectNodes',
          sourceRef: 'node_import',
          targetRef: 'node_pearson',
        },
      ],
    }

    const draft = createDraftGraphFromPlan(plan)
    const finalized = finalizeDraftGraphToPlan(draft)

    expect(finalized).toEqual(plan)
  })

  it('builds a recoverable draft plan with missing-config warnings and questions', () => {
    const plan: WorkflowAiPlan = {
      summary: '创建相关性分析流',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        {
          id: 'node_pearson',
          type: 'createNode',
          nodeType: 'pearson',
          nodeLabel: 'Pearson 相关系数',
          config: {},
        },
      ],
    }

    const recoverable = buildRecoverableDraftPlanFromIssues(plan, [
      {
        stage: 'validate',
        operationId: 'node_pearson',
        message: '节点 Pearson 相关系数 缺少必填配置: X 字段',
      },
      {
        stage: 'validate',
        operationId: 'node_pearson',
        message: '节点 Pearson 相关系数 缺少必填配置: Y 字段',
      },
    ])

    expect(recoverable.warnings).toContain('以下节点仍需手动补充配置后才能运行：Pearson 相关系数。')
    expect(recoverable.questions).toContain(
      '请为节点「Pearson 相关系数」补充以下必填配置：X 字段、Y 字段。',
    )
    expect(recoverable.operations).toEqual(plan.operations)
  })
})
