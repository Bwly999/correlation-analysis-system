import { describe, expect, it } from 'vitest'
import { bridgePiEvent } from '../eventBridge.js'
import { createSessionRecord, type PiAgentSessionRecord } from '../sessionStore.js'

const createRecord = (): PiAgentSessionRecord => ({
  ...createSessionRecord({
    mode: 'create',
    prompt: '分析销量',
    profile: {
      id: 'profile_1',
      name: '测试模型',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-test',
      enabled: true,
      source: 'custom',
    },
    nodeCatalog: [],
    dataSources: [],
  }, 'user_1'),
})

describe('piAgent eventBridge', () => {
  it('creates assistant-visible messages with dedicated visibility metadata and preserves raw content separately', () => {
    const record = createRecord()
    const currentMessageId = { value: '' }

    const startEvents = bridgePiEvent(
      {
        type: 'message_start',
        message: {
          role: 'assistant',
          content: [],
        },
      },
      record,
      currentMessageId,
    )
    expect(startEvents).toHaveLength(1)
    expect(startEvents[0]).toEqual(
      expect.objectContaining({
        type: 'message.start',
        role: 'assistant',
        visibility: 'assistant_visible',
      }),
    )
    expect(record.messages[0]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        visibility: 'assistant_visible',
        rawContent: '',
      }),
    )

    const completedEvents = bridgePiEvent(
      {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '建议先读取分析上下文，再判断价格因子。' },
          ],
        },
      },
      record,
      currentMessageId,
    )

    expect(completedEvents).toHaveLength(1)
    expect(completedEvents[0]).toEqual(
      expect.objectContaining({
        type: 'message.completed',
        content: '建议先读取分析上下文，再判断价格因子。',
        rawContent: '建议先读取分析上下文，再判断价格因子。',
      }),
    )
    expect(record.messages[0]).toEqual(
      expect.objectContaining({
        content: '建议先读取分析上下文，再判断价格因子。',
        rawContent: '建议先读取分析上下文，再判断价格因子。',
        status: 'completed',
      }),
    )
  })

  it('keeps tool results in tool events instead of mixing them into assistant message content', () => {
    const record = createRecord()
    const currentMessageId = { value: '' }

    bridgePiEvent(
      {
        type: 'message_start',
        message: {
          role: 'assistant',
          content: [],
        },
      },
      record,
      currentMessageId,
    )
    bridgePiEvent(
      {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '先执行工作流，再回读结果。' }],
        },
      },
      record,
      currentMessageId,
    )

    const toolEvents = bridgePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'tool_1',
        toolName: 'workflow_get_session_context',
        result: {
          content: [{ type: 'text', text: '{"mode":"create","count":2}' }],
        },
        isError: false,
      },
      record,
      currentMessageId,
    )

    expect(toolEvents).toHaveLength(1)
    expect(toolEvents[0]).toEqual(
      expect.objectContaining({
        type: 'tool.end',
        result: '{"mode":"create","count":2}',
      }),
    )
    expect(record.messages[0]?.content).toBe('先执行工作流，再回读结果。')
  })

  it('ignores user message lifecycle events so user input will not appear again as assistant content', () => {
    const record = createRecord()
    const currentMessageId = { value: '' }

    const startEvents = bridgePiEvent(
      {
        type: 'message_start',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '帮我分析价格因子' }],
        },
      },
      record,
      currentMessageId,
    )

    const completedEvents = bridgePiEvent(
      {
        type: 'message_end',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '帮我分析价格因子' }],
        },
      },
      record,
      currentMessageId,
    )

    expect(startEvents).toHaveLength(0)
    expect(completedEvents).toHaveLength(0)
    expect(record.messages).toHaveLength(0)
    expect(currentMessageId.value).toBe('')
  })

  it('ignores tool result message lifecycle events so raw tool output will not be shown in assistant bubbles', () => {
    const record = createRecord()
    const currentMessageId = { value: '' }

    bridgePiEvent(
      {
        type: 'message_start',
        message: {
          role: 'assistant',
          content: [],
        },
      },
      record,
      currentMessageId,
    )
    bridgePiEvent(
      {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '我先读取上下文。' }],
        },
      },
      record,
      currentMessageId,
    )

    const startEvents = bridgePiEvent(
      {
        type: 'message_start',
        message: {
          role: 'toolResult',
          toolCallId: 'tool_1',
          toolName: 'workflow_get_session_context',
          content: [{ type: 'text', text: '{"mode":"create","count":2}' }],
        },
      },
      record,
      currentMessageId,
    )
    const completedEvents = bridgePiEvent(
      {
        type: 'message_end',
        message: {
          role: 'toolResult',
          toolCallId: 'tool_1',
          toolName: 'workflow_get_session_context',
          content: [{ type: 'text', text: '{"mode":"create","count":2}' }],
        },
      },
      record,
      currentMessageId,
    )

    expect(startEvents).toHaveLength(0)
    expect(completedEvents).toHaveLength(0)
    expect(record.messages).toHaveLength(1)
    expect(record.messages[0]?.content).toBe('我先读取上下文。')
    expect(record.messages[0]?.rawContent).toBe('我先读取上下文。')
  })
})
