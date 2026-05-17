import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePiAgentStore } from '../piAgentStore'
import { usePiAgentConfigStore } from '../piAgentConfigStore'
import { useWorkflowStore } from '../workflowStore'

const {
  createPiAgentSessionMock,
  resolvePiAgentToolResultMock,
  sendPiAgentMessageMock,
  syncPiAgentCanvasMock,
  streamPiAgentEventsMock,
  fetchSystemModelProfilesMock,
} = vi.hoisted(() => ({
  createPiAgentSessionMock: vi.fn(),
  resolvePiAgentToolResultMock: vi.fn(),
  sendPiAgentMessageMock: vi.fn(),
  syncPiAgentCanvasMock: vi.fn(),
  streamPiAgentEventsMock: vi.fn(),
  fetchSystemModelProfilesMock: vi.fn(),
}))

vi.mock('@/services/piAgentClient', () => ({
  createPiAgentSession: createPiAgentSessionMock,
  resolvePiAgentToolResult: resolvePiAgentToolResultMock,
  sendPiAgentMessage: sendPiAgentMessageMock,
  syncPiAgentCanvas: syncPiAgentCanvasMock,
  streamPiAgentEvents: streamPiAgentEventsMock,
}))

vi.mock('@/services/modelProfiles', () => ({
  fetchSystemModelProfiles: fetchSystemModelProfilesMock,
  testWorkflowAiModelProfile: vi.fn(),
}))

describe('piAgentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    syncPiAgentCanvasMock.mockResolvedValue({
      projection: {} as any,
      syncSummary: '已同步当前画布，共 0 个节点、0 条连线',
    })
  })

  it('fails clearly when no model profile is available', async () => {
    fetchSystemModelProfilesMock.mockResolvedValueOnce([])

    const store = usePiAgentStore()
    const ok = await store.ensureSession('帮我分析销量')

    expect(ok).toBe(false)
    expect(store.status).toBe('failed')
    expect(store.errorMessage).toContain('未配置模型')
  })

  it('creates a session and sends the first message through pi agent client', async () => {
    fetchSystemModelProfilesMock.mockResolvedValueOnce([
      {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system' as const,
      },
    ])
    createPiAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'pi_session_1',
      status: 'idle',
      mode: 'edit',
      prompt: '帮我分析销量',
    })
    sendPiAgentMessageMock.mockResolvedValueOnce({ ok: true })
    streamPiAgentEventsMock.mockResolvedValueOnce(undefined)

    const configStore = usePiAgentConfigStore()
    const store = usePiAgentStore()
    const workflowStore = useWorkflowStore()
    await configStore.loadProfiles()
    workflowStore.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })
    const firstNode = workflowStore.nodes[0]
    if (!firstNode) throw new Error('缺少测试节点')
    firstNode.data.config = {
      jsonData: JSON.stringify(
        Array.from({ length: 2000 }, (_, index) => ({
          feature: index,
          target: index * 2,
        })),
      ),
      keepField: 'target',
    }
    firstNode.data.output = {
      kind: 'table',
      payload: Array.from({ length: 2000 }, (_, index) =>
        Object.fromEntries(
          Array.from({ length: 260 }, (_inner, fieldIndex) => [
            `field_${fieldIndex}`,
            `${index}_${fieldIndex}`,
          ]),
        )),
    } as any
    store.inputText = '帮我分析销量'

    await store.sendMessage()

    expect(createPiAgentSessionMock).toHaveBeenCalledTimes(1)
    expect(createPiAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowSnapshot: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                config: expect.objectContaining({
                  jsonData: expect.objectContaining({
                    _truncated: true,
                    _type: 'string',
                  }),
                  keepField: 'target',
                }),
                output: expect.objectContaining({
                  kind: 'table',
                  payload: expect.any(Array),
                  _truncated: true,
                }),
              }),
            }),
          ]),
        }),
      }),
    )
    expect(syncPiAgentCanvasMock).toHaveBeenCalledWith('pi_session_1', {
      name: workflowStore.workflowName,
      nodes: expect.any(Array),
      edges: expect.any(Array),
    })
    const syncedSnapshot = syncPiAgentCanvasMock.mock.calls[0]?.[1]
    expect(syncedSnapshot).toBeTruthy()
    const syncedNode = syncedSnapshot?.nodes?.[0] as Record<string, any>
    expect(syncedNode.data.config.jsonData._truncated).toBe(true)
    expect(syncedNode.data.output.payload).toHaveLength(3)
    expect(Object.keys(syncedNode.data.output.payload[0] ?? {})).toHaveLength(200)
    expect(sendPiAgentMessageMock).toHaveBeenCalledWith('pi_session_1', '帮我分析销量')
    expect(store.sessionId).toBe('pi_session_1')
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: '帮我分析销量',
      }),
    )
  })

  it('stops sending when canvas sync before message fails', async () => {
    fetchSystemModelProfilesMock.mockResolvedValueOnce([
      {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system' as const,
      },
    ])
    createPiAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'pi_session_1',
      status: 'idle',
      mode: 'edit',
      prompt: '帮我分析销量',
    })
    syncPiAgentCanvasMock.mockRejectedValueOnce(new Error('同步当前画布失败'))
    streamPiAgentEventsMock.mockResolvedValueOnce(undefined)

    const configStore = usePiAgentConfigStore()
    const store = usePiAgentStore()
    const workflowStore = useWorkflowStore()
    await configStore.loadProfiles()
    workflowStore.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })

    await store.sendMessage('帮我分析销量')

    expect(sendPiAgentMessageMock).not.toHaveBeenCalled()
    expect(store.status).toBe('failed')
    expect(store.errorMessage).toContain('同步当前画布失败')
  })

  it('syncs canvas after structure/config tools but skips moveNode', async () => {
    const store = usePiAgentStore()
    const workflowStore = useWorkflowStore()

    store.sessionId = 'pi_session_1'
    workflowStore.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })

    await store['handleEvent']?.({
      type: 'tool.execute',
      sessionId: 'pi_session_1',
      toolCallId: 'tool_add',
      toolName: 'wf_addNode',
      params: {
        nodeType: 'chart-display',
        label: '图表展示',
        position: { x: 320, y: 0 },
      },
    })

    await store['handleEvent']?.({
      type: 'tool.execute',
      sessionId: 'pi_session_1',
      toolCallId: 'tool_move',
      toolName: 'wf_moveNode',
      params: {
        nodeId: workflowStore.nodes[0]?.id,
        position: { x: 100, y: 100 },
      },
    })

    expect(syncPiAgentCanvasMock).toHaveBeenCalledTimes(1)
    expect(resolvePiAgentToolResultMock).toHaveBeenCalledTimes(1)
  })

  it('applies streamed assistant events into message list and status', async () => {
    const store = usePiAgentStore()

    store['handleEvent']?.({
      type: 'message.start',
      sessionId: 'pi_session_1',
      messageId: 'assistant_1',
      role: 'assistant',
    })
    store['handleEvent']?.({
      type: 'message.delta',
      sessionId: 'pi_session_1',
      messageId: 'assistant_1',
      delta: '正在分析价格字段…',
    })
    store['handleEvent']?.({
      type: 'message.thinking_delta',
      sessionId: 'pi_session_1',
      messageId: 'assistant_1',
      delta: '先读取上下文',
    })
    store['handleEvent']?.({
      type: 'tool.start',
      sessionId: 'pi_session_1',
      toolCall: {
        id: 'tool_1',
        toolName: 'wf_executeWorkflow',
        displayName: '执行工作流/调试节点',
        args: {},
        status: 'running',
      },
    })
    store['handleEvent']?.({
      type: 'tool.end',
      sessionId: 'pi_session_1',
      toolCallId: 'tool_1',
      result: '执行成功',
      isError: false,
    })
    store['handleEvent']?.({
      type: 'message.completed',
      sessionId: 'pi_session_1',
      messageId: 'assistant_1',
      content: '价格是当前最值得优先验证的候选因子。',
    })
    store['handleEvent']?.({
      type: 'session.status',
      sessionId: 'pi_session_1',
      status: 'completed',
    })

    expect(store.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assistant_1',
          role: 'assistant',
          content: '价格是当前最值得优先验证的候选因子。',
          thinking: '先读取上下文',
          status: 'completed',
          toolCalls: [
            expect.objectContaining({
              id: 'tool_1',
              status: 'success',
              result: '执行成功',
            }),
          ],
        }),
      ]),
    )
    expect(store.status).toBe('completed')
  })
})
