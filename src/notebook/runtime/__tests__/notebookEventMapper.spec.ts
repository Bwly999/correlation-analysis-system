import { describe, expect, it, vi } from 'vitest'
import {
  applyNotebookEvent,
  createNotebookRuntimeState,
} from '../notebookEventMapper'

describe('notebookEventMapper', () => {
  it('message 流式事件会累积到 assistant blocks', () => {
    const state = createNotebookRuntimeState('sess-1')

    applyNotebookEvent(state, {
      type: 'message.start',
      sessionId: 'sess-1',
      messageId: 'm-1',
      role: 'assistant',
      visibility: 'assistant_visible',
    })
    applyNotebookEvent(state, {
      type: 'message.thinking_delta',
      sessionId: 'sess-1',
      messageId: 'm-1',
      delta: '先看数据结构。',
    })
    applyNotebookEvent(state, {
      type: 'message.delta',
      sessionId: 'sess-1',
      messageId: 'm-1',
      delta: '我先浏览一下字段概况。',
    })
    applyNotebookEvent(state, {
      type: 'message.completed',
      sessionId: 'sess-1',
      messageId: 'm-1',
      content: '我先浏览一下字段概况。',
      rawContent: '我先浏览一下字段概况。',
      visibility: 'assistant_visible',
    })

    const assistant = state.session.messages[0]
    expect(assistant?.role).toBe('assistant')
    expect(assistant && 'blocks' in assistant ? assistant.blocks[0]?.kind : null).toBe('thinking')
    expect(assistant && 'blocks' in assistant ? assistant.blocks[1]?.kind : null).toBe('text')
    expect(assistant && 'streaming' in assistant ? assistant.streaming : undefined).toBe(false)
  })

  it('tool.execute + tool.end 会映射成 python_exec 卡片', () => {
    const state = createNotebookRuntimeState('sess-1')
    applyNotebookEvent(state, {
      type: 'message.start',
      sessionId: 'sess-1',
      messageId: 'm-1',
      role: 'assistant',
      visibility: 'assistant_visible',
    })

    applyNotebookEvent(state, {
      type: 'tool.execute',
      sessionId: 'sess-1',
      toolCallId: 'tool-1',
      toolName: 'python_exec_inline',
      params: {
        code: 'print("hello")',
      },
    })

    applyNotebookEvent(state, {
      type: 'tool.end',
      sessionId: 'sess-1',
      toolCallId: 'tool-1',
      result: JSON.stringify({
        status: 'ok',
        stdout: 'hello\n',
        stderr: '',
      }),
      isError: false,
    })

    const assistant = state.session.messages[0]
    expect(assistant?.role).toBe('assistant')
    const toolBlock =
      assistant && 'blocks' in assistant
        ? assistant.blocks.find((block) => block.kind === 'tool')
        : null
    expect(toolBlock?.kind).toBe('tool')
    if (toolBlock?.kind === 'tool' && toolBlock.data.kind === 'python_exec') {
      expect(toolBlock.data.stdout).toBe('hello\n')
      expect(toolBlock.data.status).toBe('success')
    }
    expect(state.session.runtime.cellCount).toBe(1)
  })

  it('tool.end 含 stdoutTruncation 时透传到卡片数据', () => {
    const state = createNotebookRuntimeState('sess-1')
    applyNotebookEvent(state, {
      type: 'message.start',
      sessionId: 'sess-1',
      messageId: 'm-1',
      role: 'assistant',
      visibility: 'assistant_visible',
    })
    applyNotebookEvent(state, {
      type: 'tool.execute',
      sessionId: 'sess-1',
      toolCallId: 'tool-1',
      toolName: 'python_exec_inline',
      params: { code: 'print(big)' },
    })
    applyNotebookEvent(state, {
      type: 'tool.end',
      sessionId: 'sess-1',
      toolCallId: 'tool-1',
      result: JSON.stringify({
        status: 'ok',
        stdout: '...last lines',
        stderr: '',
        stdoutTruncation: {
          truncated: true,
          truncatedBy: 'lines',
          outputLines: 2000,
          outputBytes: 48000,
          totalLines: 5000,
          totalBytes: 200000,
        },
      }),
      isError: false,
    })

    const assistant = state.session.messages[0]
    const toolBlock =
      assistant && 'blocks' in assistant
        ? assistant.blocks.find((block) => block.kind === 'tool')
        : null
    if (toolBlock?.kind === 'tool' && toolBlock.data.kind === 'python_exec') {
      expect(toolBlock.data.stdoutTruncation?.truncated).toBe(true)
      expect(toolBlock.data.stdoutTruncation?.truncatedBy).toBe('lines')
      expect(toolBlock.data.stdoutTruncation?.totalLines).toBe(5000)
      expect(toolBlock.data.stderrTruncation).toBeUndefined()
    }
  })

  it('ask_user 回答后会更新 block 状态并恢复 running', () => {
    const state = createNotebookRuntimeState('sess-1')
    applyNotebookEvent(state, {
      type: 'message.start',
      sessionId: 'sess-1',
      messageId: 'm-1',
      role: 'assistant',
      visibility: 'assistant_visible',
    })
    applyNotebookEvent(state, {
      type: 'tool.execute',
      sessionId: 'sess-1',
      toolCallId: 'tool-ask',
      toolName: 'ask_user',
      params: {
        question: '这次你更关心解释性还是预测性？',
        options: [
          { label: '解释性优先', description: '更快形成可读结论' },
          { label: '预测性优先', description: '更关注模型效果' },
        ],
        recommendedIndex: 0,
      },
    })

    expect(state.session.agent).toBe('awaiting_user')

    applyNotebookEvent(state, {
      type: 'tool.end',
      sessionId: 'sess-1',
      toolCallId: 'tool-ask',
      result: JSON.stringify({
        answers: [{ label: '解释性优先', isCustom: false }],
      }),
      isError: false,
    })

    const assistant = state.session.messages[0]
    const askBlock =
      assistant && 'blocks' in assistant
        ? assistant.blocks.find((block) => block.kind === 'ask_user')
        : null
    expect(askBlock?.kind).toBe('ask_user')
    if (askBlock?.kind === 'ask_user') {
      expect(askBlock.data.status).toBe('answered')
    }
    expect(state.session.agent).toBe('running')
  })

  it('todo_write 在 tool.execute 时就同步更新面板数据', () => {
    const state = createNotebookRuntimeState('sess-1')
    applyNotebookEvent(state, {
      type: 'message.start',
      sessionId: 'sess-1',
      messageId: 'm-1',
      role: 'assistant',
      visibility: 'assistant_visible',
    })

    applyNotebookEvent(state, {
      type: 'tool.execute',
      sessionId: 'sess-1',
      toolCallId: 'tool-todo',
      toolName: 'todo_write',
      params: {
        items: [
          { id: '1', text: '梳理字段', state: 'in_progress' },
          { id: '2', text: '检查缺失值', state: 'pending' },
        ],
      },
    })

    expect(state.session.todos).toHaveLength(2)
    expect(state.session.todos[0]?.text).toBe('梳理字段')
  })
})
