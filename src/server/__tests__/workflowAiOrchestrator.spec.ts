import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'

const { streamWorkflowAiPlanMock } = vi.hoisted(() => ({
  streamWorkflowAiPlanMock: vi.fn(),
}))

vi.mock('../workflowAi/profiles.js', () => ({
  streamWorkflowAiPlan: streamWorkflowAiPlanMock,
}))

import {
  getWorkflowAiSession,
  runWorkflowAiSession,
  startWorkflowAiSession,
} from '../workflowAi/orchestrator.js'
import * as workflowAiOrchestrator from '../workflowAi/orchestrator.js'

describe('workflowAi orchestrator', () => {
  const baseRequest: WorkflowAiPlanRequest = {
    mode: 'create',
    prompt: '导入一份 JSON 表格，快速演示 Pearson 相关分析，给我最小可运行流程。',
    profile: {
      id: 'custom',
      name: '测试模型',
      baseUrl: 'http://example.com',
      model: 'test',
      apiKey: 'secret',
      enabled: true,
      source: 'custom',
    },
    contextHints: {
      recipes: [
        {
          id: 'quick-json-demo',
          name: 'JSON 快速演示',
          reason: '命中关键词：JSON、快速',
          minimalPattern: ['manual-json-import', 'pearson'],
        },
      ],
      schemaSummaries: [
        {
          nodeId: 'node_import_1',
          nodeLabel: '手动输入数据',
          resultKind: 'table',
          rowCount: 2,
          numericColumns: ['feature', 'target'],
          candidateTargetColumns: ['target'],
          candidateFeatureColumns: ['feature'],
          blockedReasons: [],
        },
      ],
    },
    nodeCatalog: [
      {
        name: 'manual-json-import',
        displayName: '手动输入数据',
        category: 'trigger',
        description: '导入 JSON 数据',
        inputMode: 'single',
        minInputs: 0,
        maxInputs: 1,
        allowedNextCategories: ['action', 'terminal'],
        properties: [],
        help: null,
        assistantHints: {
          keywords: ['json', '样例'],
        },
      },
      {
        name: 'pearson',
        displayName: 'Pearson 相关系数',
        category: 'terminal',
        description: '相关性分析',
        inputMode: 'single',
        minInputs: 1,
        maxInputs: 1,
        allowedNextCategories: [],
        properties: [],
        help: null,
        assistantHints: {
          keywords: ['pearson', '相关'],
        },
      },
    ],
  }

  beforeEach(() => {
    streamWorkflowAiPlanMock.mockReset()
  })

  it('runs a session in tool-first mode and stores recipe, draft and missing info', async () => {
    streamWorkflowAiPlanMock.mockResolvedValueOnce({
      plan: {
        summary: '创建相关性分析流',
        assumptions: [],
        warnings: [],
        questions: ['请确认目标字段'],
        operations: [
          {
            id: 'node_import',
            type: 'createNode',
            nodeType: 'manual-json-import',
            nodeLabel: '手动输入数据',
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
      },
      diagnostics: {
        status: 'success',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
        issues: [],
      },
    })

    const session = startWorkflowAiSession(baseRequest)
    const events: string[] = []

    const result = await runWorkflowAiSession(session.sessionId, (event) => {
      events.push(event.type)
    })

    const storedSession = getWorkflowAiSession(session.sessionId)

    expect(events).toContain('recipe_selected')
    expect(events).toContain('draft_updated')
    expect(events).toContain('missing_info')
    expect(result.draft.nodes).toHaveLength(2)
    expect(storedSession?.selectedRecipe?.id).toBe('quick-json-demo')
    expect(storedSession?.missingInfo[0]?.reason).toBe('请确认目标字段')
    expect(storedSession?.status).toBe('waiting_user')
  })

  it('continues a waiting session after user fills missing information', async () => {
    streamWorkflowAiPlanMock
      .mockResolvedValueOnce({
        plan: {
          summary: '创建相关性分析流',
          assumptions: [],
          warnings: [],
          questions: ['请确认目标字段'],
          operations: [
            {
              id: 'node_import',
              type: 'createNode',
              nodeType: 'manual-json-import',
              nodeLabel: '手动输入数据',
            },
            {
              id: 'node_pearson',
              type: 'createNode',
              nodeType: 'pearson',
              nodeLabel: 'Pearson 相关系数',
            },
          ],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
        },
      })
      .mockResolvedValueOnce({
        plan: {
          summary: '已根据补充信息完成相关性分析流',
          assumptions: ['目标字段使用 target'],
          warnings: [],
          questions: [],
          operations: [
            {
              id: 'node_import',
              type: 'createNode',
              nodeType: 'manual-json-import',
              nodeLabel: '手动输入数据',
            },
            {
              id: 'node_pearson',
              type: 'createNode',
              nodeType: 'pearson',
              nodeLabel: 'Pearson 相关系数',
              config: {
                yFields: ['target'],
              },
            },
            {
              id: 'edge_1',
              type: 'connectNodes',
              sourceRef: 'node_import',
              targetRef: 'node_pearson',
            },
          ],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
        },
      })

    const session = startWorkflowAiSession(baseRequest)

    await runWorkflowAiSession(session.sessionId, () => {})

    await (workflowAiOrchestrator as any).submitWorkflowAiSessionInput(session.sessionId, {
      answers: {
        question_1: '目标字段就是 target',
      },
    })

    const continuedResult = await runWorkflowAiSession(session.sessionId, () => {})
    const storedSession = getWorkflowAiSession(session.sessionId)
    const continuedRequest = streamWorkflowAiPlanMock.mock.calls[1]?.[0]

    expect(continuedResult.plan.summary).toBe('已根据补充信息完成相关性分析流')
    expect(storedSession?.missingInfo).toEqual([])
    expect(storedSession?.status).toBe('completed')
    expect(continuedRequest.contextHints?.userAnswers).toEqual([
      expect.objectContaining({
        key: 'question_1',
        value: '目标字段就是 target',
      }),
    ])
  })

  it('injects server-side inspected schema summaries into the model request when no front-end summary is provided', async () => {
    streamWorkflowAiPlanMock.mockResolvedValueOnce({
      plan: {
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
            config: {
              jsonData: '[{"feature":1,"target":2}]',
            },
          },
          {
            id: 'node_pearson',
            type: 'createNode',
            nodeType: 'pearson',
            nodeLabel: 'Pearson 相关系数',
            config: {
              xFields: ['feature'],
              yFields: ['target'],
            },
          },
          {
            id: 'edge_1',
            type: 'connectNodes',
            sourceRef: 'node_import',
            targetRef: 'node_pearson',
          },
        ],
      },
      diagnostics: {
        status: 'success',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
        issues: [],
      },
    })

    const session = startWorkflowAiSession({
      ...baseRequest,
      contextHints: undefined,
      workflowSnapshot: {
        name: '测试工作流',
        nodes: [
          {
            id: 'node_import_1',
            label: '手动输入数据',
            type: 'manual-json-import',
            category: 'trigger',
            position: { x: 0, y: 0 },
            config: {
              jsonData: '[{"feature":1,"target":2},{"feature":2,"target":3}]',
            },
          },
        ],
        edges: [],
      },
    })

    await runWorkflowAiSession(session.sessionId, () => {})

    const requestSentToModel = streamWorkflowAiPlanMock.mock.calls[0]?.[0]
    expect(requestSentToModel.contextHints?.schemaSummaries).toEqual([
      expect.objectContaining({
        nodeId: 'node_import_1',
        numericColumns: ['feature', 'target'],
        candidateTargetColumns: ['target'],
      }),
    ])
  })
})
