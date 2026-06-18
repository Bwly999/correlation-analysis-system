import type {
  AssistantBlock,
  AssistantMessage,
  AskUserBlock,
  AskUserOption,
  NotebookConversation,
  NotebookSessionVm,
  TodoItem,
  ToolStatus,
} from '../types/messageStream'
import type { NotebookAgentEvent } from './notebookAgentClient'

const now = () => Date.now()

const normalizeTodoItems = (items: unknown): TodoItem[] => {
  if (!Array.isArray(items)) return []
  return items.map((item, index) => {
    const id =
      item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'
        ? item.id
        : `todo-${index + 1}`
    const title = (() => {
      if (item && typeof item === 'object') {
        if ('title' in item && typeof item.title === 'string') return item.title
        if ('text' in item && typeof item.text === 'string') return item.text
      }
      return `任务 ${index + 1}`
    })()
    const rawStatus =
      item && typeof item === 'object'
        ? 'status' in item && typeof item.status === 'string'
          ? item.status
          : 'state' in item && typeof item.state === 'string'
            ? item.state
            : 'pending'
        : 'pending'

    return {
      id,
      text: title,
      state:
        rawStatus === 'completed' || rawStatus === 'in_progress' || rawStatus === 'pending'
          ? rawStatus
          : 'pending',
    }
  })
}

const createBaseSession = (sessionId: string): NotebookSessionVm => ({
  sessionId,
  title: '分析笔记本',
  phase: { kind: 'ready' },
  agent: 'idle',
  runtime: {
    memoryMb: 0,
    cellCount: 0,
    agentSeconds: 0,
    isRunning: false,
  },
  messages: [],
  todos: [],
  connection: 'online',
})

const ensureAssistantMessage = (
  session: NotebookSessionVm,
  messageId: string,
): AssistantMessage => {
  const existing = session.messages.find(
    (message): message is AssistantMessage =>
      message.role === 'assistant' && message.id === messageId,
  )
  if (existing) return existing

  const created: AssistantMessage = {
    id: messageId,
    role: 'assistant',
    blocks: [],
    streaming: true,
    at: now(),
  }
  session.messages.push(created)
  return created
}

const pushOrAppendTextBlock = (
  message: AssistantMessage,
  delta: string,
) => {
  const last = message.blocks[message.blocks.length - 1]
  if (last?.kind === 'text') {
    last.data.text += delta
    return
  }
  message.blocks.push({
    kind: 'text',
    data: {
      id: `text-${message.id}-${message.blocks.length + 1}`,
      text: delta,
    },
  })
}

const pushOrAppendThinkingBlock = (
  message: AssistantMessage,
  delta: string,
) => {
  const last = message.blocks[message.blocks.length - 1]
  if (last?.kind === 'thinking') {
    last.data.text += delta
    return
  }
  message.blocks.push({
    kind: 'thinking',
    data: {
      id: `thinking-${message.id}-${message.blocks.length + 1}`,
      text: delta,
    },
  })
}

const buildAskUserBlock = (
  toolCallId: string,
  params: Record<string, unknown>,
): AskUserBlock => {
  const optionList = Array.isArray(params.options) ? params.options : []
  const recommendedIndex =
    typeof params.recommendedIndex === 'number' ? params.recommendedIndex : -1

  const options: AskUserOption[] = optionList.map((option, index) => {
    const label =
      option && typeof option === 'object' && 'label' in option && typeof option.label === 'string'
        ? option.label
        : `选项 ${index + 1}`
    const detail =
      option && typeof option === 'object' && 'description' in option && typeof option.description === 'string'
        ? option.description
        : undefined

    return {
      id: `${toolCallId}-option-${index + 1}`,
      label,
      ...(detail ? { detail } : {}),
      ...(index === recommendedIndex ? { recommended: true } : {}),
    }
  })

  const allowFreeText = options.length === 0 || Boolean(params.multiSelect)

  return {
    id: toolCallId,
    question: typeof params.question === 'string' ? params.question : '请补充你的分析目标',
    options,
    allowFreeText,
    status: 'pending',
  }
}

const previewText = (value: unknown) => {
  const text =
    typeof value === 'string'
      ? value
      : value == null
        ? ''
        : JSON.stringify(value, null, 2)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

const parseToolResultText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const parseToolResultDetails = (result: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(result)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const applyToolExecute = (
  session: NotebookSessionVm,
  event: Extract<NotebookAgentEvent, { type: 'tool.execute' }>,
) => {
  const assistant = [...session.messages]
    .reverse()
    .find((message): message is AssistantMessage => message.role === 'assistant')
  if (!assistant) return

  const params =
    event.params && typeof event.params === 'object'
      ? (event.params as Record<string, unknown>)
      : {}

  switch (event.toolName) {
    case 'python_exec_inline':
    case 'python_exec_file':
      assistant.blocks.push({
        kind: 'tool',
        data: {
          id: event.toolCallId,
          kind: 'python_exec',
          variant: event.toolName === 'python_exec_file' ? 'file' : 'inline',
          code:
            event.toolName === 'python_exec_file'
              ? String(params.path ?? '')
              : String(params.code ?? ''),
          stdout: '',
          stderr: '',
          status: 'running',
        },
      })
      break
    case 'fs_read':
      assistant.blocks.push({
        kind: 'tool',
        data: {
          id: event.toolCallId,
          kind: 'fs_read',
          path: String(params.path ?? ''),
          linesShown: 0,
          content: '',
          truncated: false,
          status: 'running',
        },
      })
      break
    case 'fs_write':
      assistant.blocks.push({
        kind: 'tool',
        data: {
          id: event.toolCallId,
          kind: 'fs_write',
          path: String(params.path ?? ''),
          bytes: 0,
          preview: previewText(params.content),
          status: 'running',
        },
      })
      break
    case 'fs_edit':
      assistant.blocks.push({
        kind: 'tool',
        data: {
          id: event.toolCallId,
          kind: 'fs_edit',
          path: String(params.path ?? ''),
          preview: previewText(params.newStr),
          status: 'running',
        },
      })
      break
    case 'fs_grep':
      assistant.blocks.push({
        kind: 'tool',
        data: {
          id: event.toolCallId,
          kind: 'fs_grep',
          pattern: String(params.pattern ?? ''),
          scope: typeof params.path === 'string' && params.path.length > 0 ? params.path : 'workspace',
          matches: [],
          status: 'running',
        },
      })
      break
    case 'todo_write':
      {
        const todoItems = normalizeTodoItems(params.items)
        assistant.blocks.push({
          kind: 'tool',
          data: {
            id: event.toolCallId,
            kind: 'todo_write',
            items: todoItems,
            status: 'running',
          },
        })
        session.todos = todoItems
      }
      break
    case 'ask_user':
      assistant.blocks.push({
        kind: 'ask_user',
        data: buildAskUserBlock(event.toolCallId, params),
      })
      session.agent = 'awaiting_user'
      session.runtime.isRunning = false
      break
  }
}

const applyToolEnd = (
  session: NotebookSessionVm,
  event: Extract<NotebookAgentEvent, { type: 'tool.end' }>,
) => {
  for (const message of session.messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.blocks) {
      if (block.kind === 'tool' && block.data.id === event.toolCallId) {
        block.data.status = event.isError ? 'failed' : 'success'
        block.data.durationMs = block.data.durationMs ?? 0
        if (event.isError) {
          block.data.errorMessage = event.result
        }

        const details = parseToolResultDetails(event.result)
        if (block.data.kind === 'python_exec') {
          block.data.stdout = typeof details?.stdout === 'string' ? details.stdout : ''
          block.data.stderr = typeof details?.stderr === 'string' ? details.stderr : ''
          if (typeof details?.error?.message === 'string') {
            block.data.errorMessage = details.error.message
          }
          if (typeof details?.status === 'string' && details.status !== 'ok') {
            block.data.errorType = details.status
          }
          session.runtime.cellCount += 1
          return
        }

        if (block.data.kind === 'fs_write') {
          block.data.bytes = typeof details?.bytes === 'number' ? details.bytes : block.data.bytes
          if (typeof details?.path === 'string') {
            block.data.path = details.path
          }
          return
        }

        if (block.data.kind === 'fs_edit') {
          if (typeof details?.path === 'string') {
            block.data.path = details.path
          }
          return
        }

        if (block.data.kind === 'fs_read') {
          block.data.content = typeof details?.content === 'string' ? details.content : parseToolResultText(details)
          block.data.linesShown = block.data.content ? block.data.content.split('\n').length : 0
          block.data.linesTotal =
            typeof details?.totalLines === 'number' ? details.totalLines : undefined
          block.data.truncated = Boolean(details?.truncated)
          return
        }

        if (block.data.kind === 'fs_grep') {
          block.data.matches = Array.isArray(details?.matches)
            ? details.matches
                .map((match) => {
                  if (!match || typeof match !== 'object') return null
                  return {
                    path: typeof match.path === 'string' ? match.path : '',
                    line: typeof match.lineNumber === 'number' ? match.lineNumber : 0,
                    text: typeof match.line === 'string' ? match.line : '',
                  }
                })
                .filter((match): match is NonNullable<typeof match> => Boolean(match))
            : []
          return
        }

        if (block.data.kind === 'todo_write') {
          const items = normalizeTodoItems(details?.items)
          if (items.length > 0) {
            block.data.items = items
            session.todos = items
          }
          return
        }
      }

      if (block.kind === 'ask_user' && block.data.id === event.toolCallId) {
        if (event.isError) {
          block.data.status = 'cancelled'
          session.agent = 'failed'
        } else {
          const details = parseToolResultDetails(event.result)
          const answer = Array.isArray(details?.answers) ? details.answers[0] : null
          block.data.status = 'answered'
          if (answer && typeof answer === 'object') {
            const label = 'label' in answer && typeof answer.label === 'string' ? answer.label : ''
            const matched = block.data.options.find((option) => option.label === label)
            block.data.answeredOptionId = matched?.id ?? '__free_text__'
            block.data.answeredText =
              'isCustom' in answer && answer.isCustom ? label : undefined
          }
          session.agent = 'running'
          session.runtime.isRunning = true
        }
        return
      }
    }
  }
}

export interface NotebookRuntimeState {
  session: NotebookSessionVm
  conversations: NotebookConversation[]
  activeConversationId: string | null
}

export const createNotebookRuntimeState = (sessionId: string): NotebookRuntimeState => ({
  session: createBaseSession(sessionId),
  conversations: [
    {
      id: sessionId,
      title: '分析笔记本',
      updatedAt: Date.now(),
    },
  ],
  activeConversationId: sessionId,
})

/**
 * 从后端历史记录回放 VM 状态（「继续上次分析」刷新页面后调用）。
 *
 * 后端的 messages（user/assistant 文本）和 toolCalls（扁平数组，无 messageId 归属）
 * 按时间线合并重建 session.messages：
 *   - user message → UserMessage
 *   - assistant message → AssistantMessage（content 转 text block，thinking 转 thinking block）
 *   - toolCall → 一条独立的 AssistantMessage，含单个 tool block（按 startedAt 插入时间线）
 *
 * 说明：工具调用在后端是扁平结构，无法精确还原"属于哪条 assistant 消息"，
 * 故按时间顺序穿插为独立消息，保证历史活动轨迹完整可见。
 */
export interface NotebookHistoryMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  createdAt: number
}

export interface NotebookHistoryToolItem {
  id: string
  toolName: string
  args: unknown
  status: 'running' | 'success' | 'failed'
  result?: string
  isError?: boolean
  startedAt: number
  finishedAt?: number
}

export const hydrateFromHistory = (
  state: NotebookRuntimeState,
  history: {
    messages: NotebookHistoryMessageItem[]
    toolCalls?: NotebookHistoryToolItem[]
  },
): void => {
  const session = state.session
  session.messages = []

  type TimelineItem =
    | { kind: 'message'; data: NotebookHistoryMessageItem }
    | { kind: 'tool'; data: NotebookHistoryToolItem }

  const timeline: TimelineItem[] = []
  for (const msg of history.messages) {
    timeline.push({ kind: 'message', data: msg })
  }
  for (const tc of history.toolCalls ?? []) {
    timeline.push({ kind: 'tool', data: tc })
  }
  // 按 createdAt / startedAt 升序排列
  timeline.sort((a, b) => {
    const ta = a.kind === 'message' ? a.data.createdAt : a.data.startedAt
    const tb = b.kind === 'message' ? b.data.createdAt : b.data.startedAt
    return ta - tb
  })

  for (const item of timeline) {
    if (item.kind === 'message') {
      const msg = item.data
      if (msg.role === 'user') {
        session.messages.push({
          id: msg.id,
          role: 'user',
          text: msg.content,
          at: msg.createdAt,
        })
      } else {
        const blocks: AssistantBlock[] = []
        if (msg.thinking && msg.thinking.length > 0) {
          blocks.push({
            kind: 'thinking',
            data: {
              id: `thinking-${msg.id}`,
              text: msg.thinking,
            },
          })
        }
        if (msg.content && msg.content.length > 0) {
          blocks.push({
            kind: 'text',
            data: {
              id: `text-${msg.id}`,
              text: msg.content,
            },
          })
        }
        session.messages.push({
          id: msg.id,
          role: 'assistant',
          blocks,
          streaming: false,
          at: msg.createdAt,
        })
      }
    } else {
      const tc = item.data
      const toolBlock = buildHistoryToolBlock(tc)
      if (toolBlock) {
        session.messages.push({
          id: `tool-msg-${tc.id}`,
          role: 'assistant',
          blocks: [toolBlock],
          streaming: false,
          at: tc.startedAt,
        })
      }
    }
  }

  // 历史回放后处于 idle 状态，等待用户继续对话
  session.agent = 'idle'
  session.runtime.isRunning = false
  state.conversations[0]!.updatedAt = Date.now()
}

/**
 * 把后端 toolCall 记录转成展示层 tool block。
 * 回放场景只保留最终态（status/result），不还原流式过程。
 */
const buildHistoryToolBlock = (tc: NotebookHistoryToolItem): AssistantBlock | null => {
  const params =
    tc.args && typeof tc.args === 'object' ? (tc.args as Record<string, unknown>) : {}
  const details = tc.result ? parseToolResultDetails(tc.result) : null
  const status: ToolStatus = tc.isError || tc.status === 'failed' ? 'failed' : 'success'
  const durationMs =
    typeof tc.finishedAt === 'number' ? Math.max(0, tc.finishedAt - tc.startedAt) : undefined

  switch (tc.toolName) {
    case 'python_exec_inline':
    case 'python_exec_file':
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'python_exec',
          variant: tc.toolName === 'python_exec_file' ? 'file' : 'inline',
          code:
            tc.toolName === 'python_exec_file'
              ? String(params.path ?? '')
              : String(params.code ?? ''),
          stdout: typeof details?.stdout === 'string' ? details.stdout : '',
          stderr: typeof details?.stderr === 'string' ? details.stderr : '',
          status,
          durationMs,
          ...(status === 'failed' && tc.result ? { errorMessage: tc.result } : {}),
        },
      }
    case 'fs_read':
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'fs_read',
          path: String(params.path ?? ''),
          linesShown:
            typeof details?.content === 'string'
              ? details.content.split('\n').length
              : 0,
          content: typeof details?.content === 'string' ? details.content : '',
          truncated: Boolean(details?.truncated),
          status,
          durationMs,
        },
      }
    case 'fs_write':
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'fs_write',
          path: String(params.path ?? ''),
          bytes: typeof details?.bytes === 'number' ? details.bytes : 0,
          preview: previewText(params.content),
          status,
          durationMs,
        },
      }
    case 'fs_edit':
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'fs_edit',
          path: String(params.path ?? ''),
          preview: previewText(params.newStr),
          status,
          durationMs,
        },
      }
    case 'fs_grep':
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'fs_grep',
          pattern: String(params.pattern ?? ''),
          scope:
            typeof params.path === 'string' && params.path.length > 0
              ? params.path
              : 'workspace',
          matches: [],
          status,
          durationMs,
        },
      }
    case 'todo_write': {
      const items = normalizeTodoItems(details?.items ?? params.items)
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'todo_write',
          items,
          status,
          durationMs,
        },
      }
    }
    default:
      return null
  }
}

export const applyNotebookEvent = (
  state: NotebookRuntimeState,
  event: NotebookAgentEvent,
) => {
  const session = state.session
  switch (event.type) {
    case 'stream.ready':
    case 'stream.heartbeat':
      return
    case 'session.context_usage': {
      session.runtime.contextUsage = {
        tokens: event.tokens,
        contextWindow: event.contextWindow,
        percent: event.percent,
      }
      return
    }
    case 'session.compaction_start': {
      session.runtime.compactionInProgress = true
      return
    }
    case 'session.compaction_end': {
      session.runtime.compactionInProgress = false
      if (!event.aborted) {
        const finishedAt = Date.now()
        const noticeId = event.firstKeptEntryId ?? `compact-${finishedAt}`
        // 1. 压缩历史（hover 面板用，最多 5 条）
        const history = session.runtime.compactionHistory ?? []
        history.push({
          id: noticeId,
          reason: event.reason,
          finishedAt,
          tokensBefore: event.tokensBefore,
          aborted: false,
        })
        session.runtime.compactionHistory = history.slice(-5)
        // 2. 在消息流时间线上留痕：push 一条系统提示消息，
        //    让用户看到"这里压缩过"，而非压缩后对话凭空缺一段。
        session.messages.push({
          id: `notice-${noticeId}`,
          role: 'system',
          kind: 'compaction',
          at: finishedAt,
          reason: event.reason,
          tokensBefore: event.tokensBefore,
        })
      }
      return
    }
    case 'session.status': {
      const status = String(event.status ?? '')
      if (status === 'running') {
        session.agent = 'running'
        session.runtime.isRunning = true
      } else if (status === 'completed') {
        session.agent = 'completed'
        session.runtime.isRunning = false
      } else if (status === 'failed') {
        session.agent = 'failed'
        session.runtime.isRunning = false
      } else if (status === 'cancelled') {
        // 用户主动终止：落到 idle，并把所有正在 streaming 的 assistant 消息停止（避免"正在落笔"脉动卡住）
        session.agent = 'idle'
        session.runtime.isRunning = false
        for (const message of session.messages) {
          if (message.role === 'assistant' && message.streaming) {
            message.streaming = false
          }
        }
      } else {
        session.agent = 'idle'
        session.runtime.isRunning = false
      }
      return
    }
    case 'message.start': {
      const messageId = String(event.messageId ?? '')
      ensureAssistantMessage(session, messageId)
      return
    }
    case 'message.delta': {
      const assistant = ensureAssistantMessage(session, String(event.messageId ?? ''))
      pushOrAppendTextBlock(assistant, String(event.delta ?? ''))
      return
    }
    case 'message.thinking_delta': {
      const assistant = ensureAssistantMessage(session, String(event.messageId ?? ''))
      pushOrAppendThinkingBlock(assistant, String(event.delta ?? ''))
      return
    }
    case 'message.completed': {
      const assistant = ensureAssistantMessage(session, String(event.messageId ?? ''))
      assistant.streaming = false
      const content = String(event.content ?? '')
      if (content.length > 0) {
        const textBlocks = assistant.blocks.filter(
          (block): block is Extract<AssistantBlock, { kind: 'text' }> => block.kind === 'text',
        )
        const joined = textBlocks.map((block) => block.data.text).join('')
        if (!joined) {
          pushOrAppendTextBlock(assistant, content)
        }
      }
      return
    }
    case 'tool.execute':
      applyToolExecute(session, event as Extract<NotebookAgentEvent, { type: 'tool.execute' }>)
      return
    case 'tool.end':
      applyToolEnd(session, event as Extract<NotebookAgentEvent, { type: 'tool.end' }>)
      return
    case 'error': {
      session.agent = 'failed'
      session.runtime.isRunning = false
      session.messages.push({
        id: `error-${now()}`,
        role: 'assistant',
        blocks: [
          {
            kind: 'text',
            data: {
              id: `error-text-${now()}`,
              text: `发生错误：${String(event.message ?? '未知错误')}`,
            },
          },
        ],
        at: now(),
      })
      return
    }
  }
}
