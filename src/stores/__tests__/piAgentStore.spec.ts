import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePiAgentStore } from '../piAgentStore'
import { usePiAgentConfigStore } from '../piAgentConfigStore'
import { useWorkflowStore } from '../workflowStore'

const {
  createPiAgentSessionMock,
  getPiAgentSessionMock,
  resolvePiAgentToolResultMock,
  sendPiAgentMessageMock,
  syncPiAgentCanvasMock,
  streamPiAgentEventsMock,
  fetchSystemModelProfilesMock,
} = vi.hoisted(() => ({
  createPiAgentSessionMock: vi.fn(),
  getPiAgentSessionMock: vi.fn(),
  resolvePiAgentToolResultMock: vi.fn(),
  sendPiAgentMessageMock: vi.fn(),
  syncPiAgentCanvasMock: vi.fn(),
  streamPiAgentEventsMock: vi.fn(),
  fetchSystemModelProfilesMock: vi.fn(),
}))

vi.mock('@/services/piAgentClient', () => ({
  createPiAgentSession: createPiAgentSessionMock,
  getPiAgentSession: getPiAgentSessionMock,
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
    getPiAgentSessionMock.mockResolvedValue(null)
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
    const largeConfigRows = Array.from({ length: 40 }, (_, index) => ({
      feature: index,
      target: index * 2,
    }))
    const largeOutputRows = Array.from({ length: 25 }, (_, index) =>
      Object.fromEntries(
        Array.from({ length: 210 }, (_inner, fieldIndex) => [
          `field_${fieldIndex}`,
          `${index}_${fieldIndex}`,
        ]),
      ))
    firstNode.data.config = {
      jsonData: JSON.stringify(largeConfigRows),
      keepField: 'target',
    }
    firstNode.data.output = {
      kind: 'table',
      payload: largeOutputRows,
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
    expect(sendPiAgentMessageMock).toHaveBeenCalledWith('pi_session_1', '帮我分析销量')
    expect(store.sessionId).toBe('pi_session_1')
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        visibility: 'user',
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

  it('syncs canvas after workflow_update_partial_workflow applies canvas operations', async () => {
    const store = usePiAgentStore()
    const workflowStore = useWorkflowStore()

    store.sessionId = 'pi_session_1'
    workflowStore.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })
    const firstNode = workflowStore.nodes[0]
    if (!firstNode) throw new Error('缺少测试节点')

    await store['handleEvent']?.({
      type: 'tool.execute',
      sessionId: 'pi_session_1',
      toolCallId: 'tool_update',
      toolName: 'workflow_update_partial_workflow',
      params: {
        summary: '更新现有节点',
        operations: [
          {
            id: 'update_1',
            type: 'updateNodeConfig',
            nodeRef: firstNode.id,
            config: {
              jsonData: '[{"sales":100}]',
            },
          },
          {
            id: 'rename_1',
            type: 'renameNode',
            nodeRef: firstNode.id,
            label: '销售数据输入',
          },
          {
            id: 'move_1',
            type: 'moveNode',
            nodeRef: firstNode.id,
            position: { x: 100, y: 100 },
          },
        ],
      },
    })

    await vi.waitFor(() => {
      expect(resolvePiAgentToolResultMock).toHaveBeenCalledTimes(1)
    })
    expect(syncPiAgentCanvasMock).toHaveBeenCalledTimes(1)
    expect(workflowStore.nodes[0]?.data.label).toBe('销售数据输入')
    expect(workflowStore.nodes[0]?.data.config).toMatchObject({
      jsonData: '[{"sales":100}]',
    })
    expect(workflowStore.nodes[0]?.position).toEqual({ x: 100, y: 100 })
  })

  it('resolves workflow_get_node_catalog with frontend local node query results without syncing canvas', async () => {
    const store = usePiAgentStore()
    store.sessionId = 'pi_session_1'

    await store['handleEvent']?.({
      type: 'tool.execute',
      sessionId: 'pi_session_1',
      toolCallId: 'tool_catalog',
      toolName: 'workflow_get_node_catalog',
      params: { limit: 1, offset: 0 },
    })

    await vi.waitFor(() => {
      expect(resolvePiAgentToolResultMock).toHaveBeenCalledTimes(1)
    })

    expect(syncPiAgentCanvasMock).not.toHaveBeenCalled()
    const payload = resolvePiAgentToolResultMock.mock.calls[0]?.[2]
    expect(payload.isError).toBeUndefined()
    expect(payload.details.ok).toBe(true)
    expect(payload.details.status).toBe('success')
    expect(payload.details.summary).toContain('已读取节点目录')
    expect(payload.content[0].text).toContain('"total"')
    expect(payload.content[0].text).toContain('"items"')
  })

  it('resolves workflow_get_node runtime requirements with frontend local node query results without syncing canvas', async () => {
    const store = usePiAgentStore()
    store.sessionId = 'pi_session_1'

    await store['handleEvent']?.({
      type: 'tool.execute',
      sessionId: 'pi_session_1',
      toolCallId: 'tool_node',
      toolName: 'workflow_get_node',
      params: {
        nodeType: 'manual-json-import',
        mode: 'runtime_requirements',
        config: {
          jsonData: '[{"sales": 1}]',
        },
      },
    })

    await vi.waitFor(() => {
      expect(resolvePiAgentToolResultMock).toHaveBeenCalledTimes(1)
    })

    expect(syncPiAgentCanvasMock).not.toHaveBeenCalled()
    const payload = resolvePiAgentToolResultMock.mock.calls[0]?.[2]
    expect(payload.isError).toBeUndefined()
    expect(payload.details.ok).toBe(true)
    expect(payload.details.status).toBe('success')
    expect(payload.details.summary).toContain('已读取节点运行要求')
    expect(payload.content[0].text).toContain('"runtimeRequirements"')
    expect(payload.content[0].text).toContain('"jsonData"')
  })

  it('applies streamed assistant events into message list and status', async () => {
    const store = usePiAgentStore()

    store['handleEvent']?.({
      type: 'message.start',
      sessionId: 'pi_session_1',
      messageId: 'assistant_1',
      role: 'assistant',
      visibility: 'assistant_visible',
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
      rawContent: '价格是当前最值得优先验证的候选因子。',
      visibility: 'assistant_visible',
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
          visibility: 'assistant_visible',
          content: '价格是当前最值得优先验证的候选因子。',
          rawContent: '价格是当前最值得优先验证的候选因子。',
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

  it('recovers from a broken event stream by syncing the latest session snapshot', async () => {
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
    streamPiAgentEventsMock.mockImplementationOnce(
      async () =>
        new Promise<void>((_resolve, reject) => {
          setTimeout(() => reject(new Error('事件流已断开')), 0)
        }),
    )
    getPiAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'pi_session_1',
      status: 'interrupted',
      activeTurnState: 'interrupted',
      lastTurnEndedEarly: false,
      lastStopReason: 'interrupted',
      lastMessageRole: 'assistant',
      endedWithToolResult: false,
      lastResumeTrigger: 'followUp',
      lastObservedToolName: 'workflow_get_node',
      lastAssistantMessageText: '这轮已中断，请继续发送下一条消息。',
      pendingFollowUps: [],
      mode: 'edit',
      prompt: '帮我分析销量',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now(),
      messages: [
        {
          id: 'user_1',
          role: 'user',
          visibility: 'user',
          content: '帮我分析销量',
          rawContent: '帮我分析销量',
          thinking: '',
          status: 'completed',
          toolCalls: [],
          createdAt: Date.now() - 1,
        },
        {
          id: 'assistant_1',
          role: 'assistant',
          visibility: 'assistant_visible',
          content: '这轮已中断，请继续发送下一条消息。',
          rawContent: '这轮已中断，请继续发送下一条消息。',
          thinking: '',
          status: 'completed',
          toolCalls: [
            {
              id: 'tool_1',
              toolName: 'workflow_get_node',
              displayName: '读取节点信息',
              args: {},
              status: 'success',
              result: '已完成',
            },
          ],
          createdAt: Date.now(),
        },
      ],
      toolCalls: [
        {
          id: 'tool_1',
          toolName: 'workflow_get_node',
          displayName: '读取节点信息',
          args: {},
          status: 'success',
          result: '已完成',
        },
      ],
    })

    const store = usePiAgentStore()
    await store.sendMessage('帮我分析销量')

    await vi.waitFor(() => {
      expect(store.status).toBe('interrupted')
    })
    expect(getPiAgentSessionMock).toHaveBeenCalledWith('pi_session_1')
    expect(store.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assistant_1',
          content: '这轮已中断，请继续发送下一条消息。',
          toolCalls: [
            expect.objectContaining({
              id: 'tool_1',
              status: 'success',
            }),
          ],
        }),
      ]),
    )
    expect(store.errorMessage).toContain('本轮已中断')
  })

  it('shows a read-only observation stop hint from session diagnosis and clears it after sending a new message', async () => {
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
    sendPiAgentMessageMock.mockResolvedValue({ ok: true })
    streamPiAgentEventsMock.mockImplementation(async (_sessionId: string, options?: { onEvent?: (event: unknown) => void }) =>
      new Promise<void>(() => {
        options?.onEvent?.({
          type: 'session.stop_diagnosis',
          sessionId: 'pi_session_1',
          stopReason: 'read_only_observation_end',
          endedWithToolResult: false,
          lastObservedToolName: 'workflow_get_node',
          lastAssistantMessageText: '好的，我来查看两个节点的配置。',
          message: '本轮在读取信息后已停止，可继续追问或继续分析',
        })
      }))
    getPiAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'pi_session_1',
      status: 'completed',
      activeTurnState: 'idle',
      lastTurnEndedEarly: true,
      lastStopReason: 'read_only_observation_end',
      lastMessageRole: 'assistant',
      endedWithToolResult: false,
      lastResumeTrigger: 'prompt',
      lastObservedToolName: 'workflow_get_node',
      lastAssistantMessageText: '好的，我来查看两个节点的配置。',
      pendingFollowUps: [],
      mode: 'edit',
      prompt: '帮我分析销量',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now(),
      messages: [],
      toolCalls: [],
    })

    const store = usePiAgentStore()
    await store.sendMessage('继续')

    await vi.waitFor(() => {
      expect(store.errorMessage).toContain('读取信息后已停止')
    })

    await store.sendMessage('继续分析')

    expect(sendPiAgentMessageMock).toHaveBeenLastCalledWith('pi_session_1', '继续分析')
    expect(store.errorMessage).toBe('')
  })

  it('aborts the active event stream when disconnect is called', async () => {
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

    let observedSignal: AbortSignal | null = null
    streamPiAgentEventsMock.mockImplementationOnce(
      async (_sessionId: string, options?: { signal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
          observedSignal = options?.signal ?? null
          observedSignal?.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        }),
    )

    const store = usePiAgentStore()
    const sessionReady = store.ensureSession('帮我分析销量')
    await vi.waitFor(() => {
      expect(streamPiAgentEventsMock).toHaveBeenCalledTimes(1)
    })

    if (!observedSignal) throw new Error('缺少 AbortSignal')
    const signal = observedSignal as AbortSignal
    expect(signal.aborted).toBe(false)
    store.disconnect()
    expect(signal.aborted).toBe(true)

    await sessionReady
  })

  it('restores early-ended state from session detail and shows it as resumable instead of failed', async () => {
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
    streamPiAgentEventsMock.mockImplementationOnce(
      async () =>
        new Promise<void>((_resolve, reject) => {
          setTimeout(() => reject(new Error('事件流已断开')), 0)
        }),
    )
    getPiAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'pi_session_1',
      status: 'completed',
      mode: 'edit',
      prompt: '帮我分析销量',
      updatedAt: Date.now(),
      createdAt: Date.now() - 1000,
      activeTurnState: 'idle',
      lastTurnEndedEarly: false,
      lastStopReason: 'failed',
      lastMessageRole: 'toolResult',
      endedWithToolResult: true,
      lastResumeTrigger: 'continue',
      lastObservedToolName: 'workflow_get_node',
      lastAssistantMessageText: '',
      pendingFollowUps: [],
      messages: [],
      toolCalls: [
        {
          id: 'tool_1',
          toolName: 'workflow_get_node',
          displayName: '读取节点信息',
          args: {},
          status: 'success',
          result: '已完成',
        },
      ],
    })

    const store = usePiAgentStore()
    await store.sendMessage('帮我分析销量')

    await vi.waitFor(() => {
      expect(store.status).toBe('completed')
    })
    expect(store.errorMessage).toContain('读取信息后已停止')
  })

  it('tracks queued and drained continue events without showing a failure state', async () => {
    const store = usePiAgentStore()

    store['handleEvent']?.({
      type: 'follow_up_queued',
      sessionId: 'pi_session_1',
      message: '继续',
      queueLength: 1,
    })

    expect(store.status).toBe('completed')
    expect(store.errorMessage).toContain('已加入继续处理队列')

    store['handleEvent']?.({
      type: 'follow_up_drained',
      sessionId: 'pi_session_1',
      message: '继续',
      queueLength: 0,
    })

    expect(store.status).toBe('running')
    expect(store.errorMessage).toBe('')
  })

  it('shows a resumable failure hint when the backend reports an empty end after tool results', () => {
    const store = usePiAgentStore()

    store['handleEvent']?.({
      type: 'session.stop_diagnosis',
      sessionId: 'pi_session_1',
      stopReason: 'failed',
      endedWithToolResult: true,
      lastObservedToolName: 'workflow_get_node',
      message: '本轮未产生回复，可重试继续分析',
    })

    expect(store.status).toBe('failed')
    expect(store.lastStopReason).toBe('failed')
    expect(store.errorMessage).toContain('本轮未产生回复')
  })

  it('keeps the resumable failure hint when recovering a session snapshot that ended on toolResult without assistant output', async () => {
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
    streamPiAgentEventsMock.mockImplementationOnce(
      async () =>
        new Promise<void>((_resolve, reject) => {
          setTimeout(() => reject(new Error('事件流已断开')), 0)
        }),
    )
    getPiAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'pi_session_1',
      status: 'failed',
      mode: 'edit',
      prompt: '帮我分析销量',
      updatedAt: Date.now(),
      createdAt: Date.now() - 1000,
      activeTurnState: 'idle',
      lastTurnEndedEarly: false,
      lastStopReason: 'failed',
      lastMessageRole: 'toolResult',
      endedWithToolResult: true,
      lastResumeTrigger: 'continue',
      lastObservedToolName: 'workflow_get_node',
      lastAssistantMessageText: '',
      pendingFollowUps: [],
      messages: [],
      toolCalls: [
        {
          id: 'tool_1',
          toolName: 'workflow_get_node',
          displayName: '读取节点信息',
          args: {},
          status: 'success',
          result: '已完成',
        },
      ],
    })

    const store = usePiAgentStore()
    await store.ensureSession('帮我分析销量')

    await vi.waitFor(() => {
      expect(store.lastStopReason).toBe('failed')
    })
    expect(store.errorMessage).toContain('可重试继续分析')
  })
})
