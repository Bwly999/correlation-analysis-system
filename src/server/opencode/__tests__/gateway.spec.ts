import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createOpencodeServerMock,
  createOpencodeClientMock,
  sessionCreateMock,
  sessionPromptMock,
  mcpAddMock,
  mcpConnectMock,
  toolIdsMock,
  eventSubscribeMock,
  permissionReplyMock,
  serverCloseMock,
  eventAbortMock,
  executeNodesForAgentMock,
} = vi.hoisted(() => ({
  createOpencodeServerMock: vi.fn(),
  createOpencodeClientMock: vi.fn(),
  sessionCreateMock: vi.fn(),
  sessionPromptMock: vi.fn(),
  mcpAddMock: vi.fn(),
  mcpConnectMock: vi.fn(),
  toolIdsMock: vi.fn(),
  eventSubscribeMock: vi.fn(),
  permissionReplyMock: vi.fn(),
  serverCloseMock: vi.fn(),
  eventAbortMock: vi.fn(),
  executeNodesForAgentMock: vi.fn(),
}))

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeServer: createOpencodeServerMock,
  createOpencodeClient: createOpencodeClientMock,
}))

vi.mock('../../agentLoop/nodeExecutor.js', () => ({
  executeNodesForAgent: executeNodesForAgentMock,
}))

import { runAnalysisAgentSessionLoop } from '../gateway.js'

describe('runAnalysisAgentSessionLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    createOpencodeServerMock.mockResolvedValue({
      url: 'http://127.0.0.1:4096',
      close: serverCloseMock,
    })

    const eventStream = {
      controller: {
        abort: eventAbortMock,
      },
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'permission.asked',
          properties: {
            id: 'perm_1',
            sessionID: 'opencode_session_1',
            permission: 'workflow_get_analysis_session_context',
            patterns: ['*'],
            metadata: {},
            always: ['*'],
          },
        }
      },
    }

    eventSubscribeMock.mockResolvedValue(eventStream)
    toolIdsMock.mockResolvedValue({
      data: [
        'workflow_get_analysis_session_context',
        'workflow_validate_workflow_plan',
        'workflow_get_node_definition',
        'bash',
      ],
    })
    sessionCreateMock.mockResolvedValue({
      data: {
        id: 'opencode_session_1',
      },
    })
    sessionPromptMock
      .mockResolvedValueOnce({
        data: {
          info: {
            structured: {
              summary: '先构建最小相关性分析流程',
              assumptions: [],
              warnings: [],
              questions: [],
              operations: [
                {
                  id: 'node_1',
                  type: 'createNode',
                  nodeType: 'manual-json-import',
                  nodeLabel: '手动输入数据',
                },
              ],
            },
          },
          parts: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          info: {
            structured: {
              text: '当前结果已经足够回答问题，可以结束分析。',
              shouldContinue: false,
            },
          },
          parts: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          info: {
            structured: {
              summary: '价格与销量存在明显相关关系',
              findings: ['价格和销量强相关'],
              recommendations: ['建议继续补充更多时间跨度的数据'],
              caveats: [],
            },
          },
          parts: [],
        },
      })

    createOpencodeClientMock.mockReturnValue({
      mcp: {
        add: mcpAddMock,
        connect: mcpConnectMock,
      },
      tool: {
        ids: toolIdsMock,
      },
      session: {
        create: sessionCreateMock,
        prompt: sessionPromptMock,
      },
      event: {
        subscribe: eventSubscribeMock,
      },
      permission: {
        reply: permissionReplyMock,
      },
    })

    executeNodesForAgentMock.mockImplementation(async (_plan, _request, emitEvent) => {
      emitEvent({
        type: 'node_execution_started',
        nodeId: 'node_1',
        nodeLabel: '手动输入数据',
      } as any)
      emitEvent({
        type: 'node_execution_completed',
        nodeId: 'node_1',
        nodeLabel: '手动输入数据',
        summary: '表格数据，10 行，3 列',
      } as any)

      return [
        {
          nodeId: 'node_1',
          nodeLabel: '手动输入数据',
          nodeType: 'manual-json-import',
          success: true,
          resultKind: 'table',
          resultSummary: '表格数据，10 行，3 列',
        },
      ]
    })
  })

  it('通过 opencode sdk 运行一次 agent loop，并挂载 workflow MCP', async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = []

    const output = await runAnalysisAgentSessionLoop(
      {
        sessionId: 'session_1',
        userId: 'user_1',
        config: {
          maxIterations: 1,
          autoExecute: true,
          generateConclusion: true,
        },
        sessionRecord: {
          request: {
            mode: 'create',
            prompt: '分析影响销量的关键因素',
            profile: {
              id: 'custom-model',
              name: '自定义模型',
              baseUrl: 'http://example.com/v1',
              model: 'test-model',
              apiKey: 'test-key',
              enabled: true,
              source: 'custom',
            },
            nodeCatalog: [
              {
                name: 'manual-json-import',
                displayName: '手动输入数据',
                category: 'trigger',
                description: '手动输入 JSON 数据',
                inputMode: 'single',
                minInputs: 0,
                maxInputs: 0,
                allowedNextCategories: ['action'],
                properties: [],
                help: null,
                assistantHints: null,
              },
            ],
          },
          state: {
            sessionId: 'session_1',
            mode: 'create',
            status: 'completed',
            prompt: '分析影响销量的关键因素',
            draft: {
              summary: '草稿',
              assumptions: [],
              warnings: [],
              questions: [],
              nodes: [],
              edges: [],
            },
            trace: [],
            diagnostics: {
              issues: [],
            },
            missingInfo: [],
          },
        } as any,
      },
      (event) => events.push(event as any),
    )

    expect(createOpencodeServerMock).toHaveBeenCalledTimes(1)
    expect(createOpencodeServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          enabled_providers: ['workflow_ai_custom_model'],
          model: 'workflow_ai_custom_model/test-model',
        }),
      }),
    )
    expect(mcpAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'workflow',
        config: expect.objectContaining({
          type: 'remote',
          url: 'http://127.0.0.1:8787/api/opencode/workflow-mcp',
          headers: expect.objectContaining({
            'x-workflow-ai-session-id': 'session_1',
            'x-workflow-storage-user-id': 'user_1',
          }),
        }),
      }),
    )
    expect(mcpConnectMock).toHaveBeenCalledWith({ name: 'workflow' })
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: expect.arrayContaining([
          expect.objectContaining({
            permission: 'workflow_*',
            action: 'allow',
          }),
        ]),
      }),
    )
    expect(sessionPromptMock).toHaveBeenCalledTimes(3)
    expect(permissionReplyMock).toHaveBeenCalledWith({
      requestID: 'perm_1',
      reply: 'once',
    })
    expect(output).toEqual({
      iterations: [
        expect.objectContaining({
          iteration: 1,
          plan: expect.objectContaining({
            summary: '先构建最小相关性分析流程',
          }),
          executionResults: [
            expect.objectContaining({
              nodeId: 'node_1',
              success: true,
            }),
          ],
          interpretation: {
            text: '当前结果已经足够回答问题，可以结束分析。',
            shouldContinue: false,
          },
        }),
      ],
      conclusion: {
        summary: '价格与销量存在明显相关关系',
        findings: ['价格和销量强相关'],
        recommendations: ['建议继续补充更多时间跨度的数据'],
        caveats: [],
      },
      totalDurationMs: expect.any(Number),
      totalIterations: 1,
    })
    expect(events.map((event) => event.type)).toEqual([
      'loop_started',
      'loop_iteration_started',
      'node_execution_started',
      'node_execution_completed',
      'interpretation_completed',
      'loop_iteration_completed',
      'conclusion_started',
      'conclusion_completed',
      'loop_completed',
    ])
    expect(eventAbortMock).toHaveBeenCalledTimes(1)
    expect(serverCloseMock).toHaveBeenCalledTimes(1)
  })
})
