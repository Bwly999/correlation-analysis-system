import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePiAgentStore } from '../piAgentStore'
import { usePiAgentConfigStore } from '../piAgentConfigStore'

const {
  createPiAgentSessionMock,
  resolvePiAgentToolResultMock,
  sendPiAgentMessageMock,
  streamPiAgentEventsMock,
  fetchSystemModelProfilesMock,
} = vi.hoisted(() => ({
  createPiAgentSessionMock: vi.fn(),
  resolvePiAgentToolResultMock: vi.fn(),
  sendPiAgentMessageMock: vi.fn(),
  streamPiAgentEventsMock: vi.fn(),
  fetchSystemModelProfilesMock: vi.fn(),
}))

vi.mock('@/services/piAgentClient', () => ({
  createPiAgentSession: createPiAgentSessionMock,
  resolvePiAgentToolResult: resolvePiAgentToolResultMock,
  sendPiAgentMessage: sendPiAgentMessageMock,
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
    await configStore.loadProfiles()
    store.inputText = '帮我分析销量'

    await store.sendMessage()

    expect(createPiAgentSessionMock).toHaveBeenCalledTimes(1)
    expect(sendPiAgentMessageMock).toHaveBeenCalledWith('pi_session_1', '帮我分析销量')
    expect(store.sessionId).toBe('pi_session_1')
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: '帮我分析销量',
      }),
    )
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
