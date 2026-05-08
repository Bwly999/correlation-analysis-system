import { describe, expect, it, vi } from 'vitest'
import { runAgentKernel } from '../kernel.js'
import type { AgentKernelRuntimeAdapter } from '../opencodeAdapter.js'
import type { WorkflowAiPlanRequest } from '../../../../ai/types.js'

const buildRequest = (overrides: Partial<WorkflowAiPlanRequest> = {}): WorkflowAiPlanRequest => ({
  mode: 'edit',
  prompt: '分析价格和销量关系',
  profile: {
    id: 'profile_1',
    name: '默认模型',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    apiKey: 'test-key',
    enabled: true,
    source: 'custom',
  },
  nodeCatalog: [],
  contextHints: {
    schemaSummaries: [
      {
        nodeId: 'sales',
        nodeLabel: '销量表',
        resultKind: 'table',
        numericColumns: ['price', 'sales'],
        candidateTargetColumns: ['sales'],
        candidateFeatureColumns: ['price'],
        blockedReasons: [],
      },
    ],
  },
  ...overrides,
})

describe('agent kernel runner', () => {
  it('returns waiting_user without calling the model when agentic analysis lacks data context', async () => {
    const adapter: AgentKernelRuntimeAdapter = {
      runPrompt: vi.fn(),
    }
    const events: any[] = []

    const result = await runAgentKernel({
      sessionId: 'agent_1',
      message: '请自动分析销量影响因素',
      request: buildRequest({
        contextHints: undefined,
        dataSources: [],
      }),
      autonomy: 'agentic',
      adapter,
      emitEvent: (event) => events.push(event),
    })

    expect(adapter.runPrompt).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      intent: expect.objectContaining({
        kind: 'agentic_analysis',
        skillName: 'agentic-data-analysis',
      }),
      verification: {
        status: 'waiting_user',
        message: '需要先提供可分析的数据源或字段摘要',
      },
    })
    expect(events).toEqual([
      expect.objectContaining({
        type: 'agentic.stage.updated',
        run: expect.objectContaining({
          stage: 'waiting_user',
          message: '需要先提供可分析的数据源或字段摘要',
        }),
      }),
    ])
  })

  it('runs the selected skill through the opencode adapter when tool loop is required', async () => {
    const adapter: AgentKernelRuntimeAdapter = {
      runPrompt: vi.fn().mockResolvedValue({
        observations: [
          {
            type: 'tool_result',
            toolName: 'workflow_test_workflow',
            structuredContent: {
              ok: true,
              executionId: 'exec_1',
              status: 'success',
            },
          },
          {
            type: 'tool_result',
            toolName: 'workflow_extract_result_evidence',
            structuredContent: {
              evidence: [{ evidenceId: 'exec_1:node_pearson_1' }],
            },
          },
        ],
      }),
    }

    const result = await runAgentKernel({
      sessionId: 'agent_1',
      message: '请自动分析价格和销量关系，并生成报告',
      request: buildRequest(),
      autonomy: 'agentic',
      adapter,
    })

    expect(adapter.runPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'agent_1',
        skill: expect.objectContaining({
          name: 'agentic-data-analysis',
        }),
        intent: expect.objectContaining({
          kind: 'agentic_analysis',
        }),
      }),
    )
    expect(result.verification).toEqual({
      status: 'completed',
      message: '已具备执行记录和可追溯证据',
    })
  })

  it('continues the tool loop when verifier asks for more evidence', async () => {
    const adapter: AgentKernelRuntimeAdapter = {
      runPrompt: vi.fn()
        .mockResolvedValueOnce({
          observations: [
            {
              type: 'assistant_message',
              content: '价格对销量有明显影响。',
            },
          ],
        })
        .mockResolvedValueOnce({
          observations: [
            {
              type: 'tool_result',
              toolName: 'workflow_test_workflow',
              structuredContent: {
                ok: true,
                executionId: 'exec_1',
                status: 'success',
              },
            },
            {
              type: 'tool_result',
              toolName: 'workflow_extract_result_evidence',
              structuredContent: {
                evidence: [{ evidenceId: 'exec_1:node_pearson_1' }],
              },
            },
          ],
        }),
    }
    const events: any[] = []

    const result = await runAgentKernel({
      sessionId: 'agent_1',
      message: '请自动分析价格和销量关系，并生成报告',
      request: buildRequest(),
      autonomy: 'agentic',
      adapter,
      maxIterations: 2,
      emitEvent: (event) => events.push(event),
    })

    expect(adapter.runPrompt).toHaveBeenCalledTimes(2)
    expect(adapter.runPrompt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        previousObservations: expect.arrayContaining([
          expect.objectContaining({
            type: 'assistant_message',
            content: '价格对销量有明显影响。',
          }),
        ]),
        verification: {
          status: 'needs_evidence',
          message: '报告核心结论缺少可追溯 evidenceId',
        },
      }),
    )
    expect(result.verification).toEqual({
      status: 'completed',
      message: '已具备执行记录和可追溯证据',
    })
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'agentic.stage.updated',
          run: expect.objectContaining({
            stage: 'needs_evidence',
          }),
        }),
        expect.objectContaining({
          type: 'agentic.stage.updated',
          run: expect.objectContaining({
            stage: 'completed',
          }),
        }),
      ]),
    )
  })

  it('fails safely when max iterations are exhausted without evidence', async () => {
    const adapter: AgentKernelRuntimeAdapter = {
      runPrompt: vi.fn().mockResolvedValue({
        observations: [
          {
            type: 'assistant_message',
            content: '价格可能影响销量，但暂时没有 evidenceId。',
          },
        ],
      }),
    }

    const result = await runAgentKernel({
      sessionId: 'agent_1',
      message: '请自动分析价格和销量关系，并生成报告',
      request: buildRequest(),
      autonomy: 'agentic',
      adapter,
      maxIterations: 2,
    })

    expect(adapter.runPrompt).toHaveBeenCalledTimes(2)
    expect(result.verification).toEqual({
      status: 'failed',
      message: 'Agent Kernel 已达到最大迭代次数，仍未满足完成条件：报告核心结论缺少可追溯 evidenceId',
    })
  })
})
