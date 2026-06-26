import { diffLines } from 'diff'
import type {
  AnyToolCall,
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

/**
 * 实时流式场景下 tool.execute / tool.end 事件本身不携带时间戳，
 * 这里在前端侧记录每个 toolCallId 的开始时刻，tool.end 到达时计算耗时。
 * key 为 toolCallId（全局唯一），tool.end 处理完即删除，正常时序无泄漏。
 */
const toolStartTimes = new Map<string, number>()

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
  title: '数据分析',
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

  const allowFreeText = options.length === 0 || Boolean(params.allowFreeText)
  const multiSelect = Boolean(params.multiSelect)

  return {
    id: toolCallId,
    question: typeof params.question === 'string' ? params.question : '请补充你的分析目标',
    options,
    multiSelect,
    allowFreeText,
    status: 'pending',
  }
}

const textFromParam = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 按换行计行数；空串为 0 行，"a\nb" 为 2 行 */
const countLines = (text: string): number => (text.length === 0 ? 0 : text.split('\n').length)

/**
 * 用行级 diff 算 fs_edit 的新增 / 删减行数。
 * added = change.added 的 count 之和；removed = change.removed 的 count 之和。
 */
const computeEditLineStats = (
  oldStr: string,
  newStr: string,
): { addedLines: number; removedLines: number } => {
  let addedLines = 0
  let removedLines = 0
  for (const change of diffLines(oldStr, newStr)) {
    if (change.added) addedLines += change.count
    else if (change.removed) removedLines += change.count
  }
  return { addedLines, removedLines }
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

/**
 * 从 details 里安全读取 stdoutTruncation / stderrTruncation 元数据。
 * 仅在 truncated=true 且 truncatedBy 合法时返回，否则 undefined（保证 UI 类型窄化）。
 */
const readTruncation = (
  raw: unknown,
):
  | {
      truncated: true
      truncatedBy: 'lines' | 'bytes'
      outputLines: number
      outputBytes: number
      totalLines: number
      totalBytes: number
    }
  | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const t = raw as Record<string, unknown>
  if (t.truncated !== true) return undefined
  if (t.truncatedBy !== 'lines' && t.truncatedBy !== 'bytes') return undefined
  return {
    truncated: true,
    truncatedBy: t.truncatedBy,
    outputLines: Number(t.outputLines) || 0,
    outputBytes: Number(t.outputBytes) || 0,
    totalLines: Number(t.totalLines) || 0,
    totalBytes: Number(t.totalBytes) || 0,
  }
}

/** 在 session 消息里按 toolCallId 查找已存在的 tool/ask_user block */
const findBlockByCallId = (
  session: NotebookSessionVm,
  toolCallId: string,
): Extract<AssistantBlock, { kind: 'tool' | 'ask_user' }> | undefined => {
  for (const message of session.messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.blocks) {
      if (
        (block.kind === 'tool' || block.kind === 'ask_user') &&
        block.data.id === toolCallId
      ) {
        return block
      }
    }
  }
  return undefined
}

/**
 * 根据工具参数构建（或更新）对应 tool block 的 data。
 * tool.start（带完整 args）和 tool.execute 共用：start 先建卡让用户看到"正在写入"，
 * execute 到达时若已存在则跳过，否则兜底建。行数/内容这类能从 args 算出的字段一次性填好，
 * 让徽章立即拿到补间终值。
 */
const buildToolBlockData = (
  toolName: string,
  toolCallId: string,
  params: Record<string, unknown>,
):
  | { kind: 'tool'; data: AnyToolCall }
  | { kind: 'ask_user'; data: AskUserBlock } => {
  switch (toolName) {
    case 'python_exec_inline':
    case 'python_exec_file':
      return {
        kind: 'tool',
        data: {
          id: toolCallId,
          kind: 'python_exec',
          variant: toolName === 'python_exec_file' ? 'file' : 'inline',
          code:
            toolName === 'python_exec_file'
              ? String(params.path ?? '')
              : String(params.code ?? ''),
          stdout: '',
          stderr: '',
          status: 'running',
        },
      }
    case 'fs_read':
      return {
        kind: 'tool',
        data: {
          id: toolCallId,
          kind: 'fs_read',
          path: String(params.path ?? ''),
          linesShown: 0,
          content: '',
          truncated: false,
          status: 'running',
        },
      }
    case 'fs_write': {
      const content = textFromParam(params.content)
      return {
        kind: 'tool',
        data: {
          id: toolCallId,
          kind: 'fs_write',
          path: String(params.path ?? ''),
          bytes: 0,
          content,
          addedLines: countLines(content),
          status: 'running',
        },
      }
    }
    case 'fs_edit': {
      const oldStr = textFromParam(params.oldStr)
      const newStr = textFromParam(params.newStr)
      const { addedLines, removedLines } = computeEditLineStats(oldStr, newStr)
      return {
        kind: 'tool',
        data: {
          id: toolCallId,
          kind: 'fs_edit',
          path: String(params.path ?? ''),
          oldStr,
          newStr,
          addedLines,
          removedLines,
          status: 'running',
        },
      }
    }
    case 'fs_grep':
      return {
        kind: 'tool',
        data: {
          id: toolCallId,
          kind: 'fs_grep',
          pattern: String(params.pattern ?? ''),
          scope: typeof params.path === 'string' && params.path.length > 0 ? params.path : 'workspace',
          matches: [],
          status: 'running',
        },
      }
    case 'todo_write':
      return {
        kind: 'tool',
        data: {
          id: toolCallId,
          kind: 'todo_write',
          items: normalizeTodoItems(params.items),
          status: 'running',
        },
      }
    case 'ask_user':
      return { kind: 'ask_user', data: buildAskUserBlock(toolCallId, params) }
    default:
      // 未提供专用卡片的工具走通用兜底：参数原样存，等 tool.end 填 result。
      return {
        kind: 'tool',
        data: {
          id: toolCallId,
          kind: 'generic_tool',
          toolName,
          params,
          status: 'running',
        },
      }
  }
}

/**
 * tool.start：后端在 LLM 生成完整参数后、实际执行前发出。
 * 提前建卡让用户立刻看到"正在写入"并启动行数补间动画，而不必等 OPFS 写完。
 * 幂等：若 toolCallId 已有 block（重复事件）则跳过。
 */
const applyToolStart = (
  session: NotebookSessionVm,
  event: Extract<NotebookAgentEvent, { type: 'tool.start' }>,
) => {
  if (findBlockByCallId(session, event.toolCall.id)) return

  const assistant = [...session.messages]
      .reverse()
      .find((message): message is AssistantMessage => message.role === 'assistant')
  if (!assistant) return

  const params =
    event.toolCall.args && typeof event.toolCall.args === 'object'
      ? (event.toolCall.args as Record<string, unknown>)
      : {}

  // ask_user 不在 start 阶段建卡（其副作用 await_user 由 execute 阶段处理），留给 execute。
  if (event.toolCall.toolName === 'ask_user') return

  if (event.toolCall.toolName !== 'ask_user') {
    toolStartTimes.set(event.toolCall.id, now())
  }

  const built = buildToolBlockData(event.toolCall.toolName, event.toolCall.id, params)
  if (built.kind === 'tool' && built.data.kind === 'todo_write') {
    session.todos = built.data.items
  }
  assistant.blocks.push(built)
}

const applyToolExecute = (
  session: NotebookSessionVm,
  event: Extract<NotebookAgentEvent, { type: 'tool.execute' }>,
) => {
  // tool.start 已建卡 → 复用，不重复创建（仅 ask_user 会在 execute 建卡）。
  if (findBlockByCallId(session, event.toolCallId)) {
    // ask_user 的副作用在 execute 阶段才落（start 阶段已跳过）
    if (event.toolName === 'ask_user') {
      session.agent = 'awaiting_user'
      session.runtime.isRunning = false
    }
    return
  }

  const assistant = [...session.messages]
    .reverse()
    .find((message): message is AssistantMessage => message.role === 'assistant')
  if (!assistant) return

  // 记录工具开始时刻（ask_user 这种等用户的工具不计入正常耗时，下面跳过记录）
  if (event.toolName !== 'ask_user') {
    toolStartTimes.set(event.toolCallId, now())
  }

  const params =
    event.params && typeof event.params === 'object'
      ? (event.params as Record<string, unknown>)
      : {}

  const built = buildToolBlockData(event.toolName, event.toolCallId, params)
  if (built.kind === 'tool' && built.data.kind === 'todo_write') {
    session.todos = built.data.items
  }
  assistant.blocks.push(built)
  if (built.kind === 'ask_user') {
    session.agent = 'awaiting_user'
    session.runtime.isRunning = false
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
        // 用前端记录的开始时刻计算耗时；缺失（如历史回放/异常）时保持 undefined，由 UI 自行隐藏
        const startedAt = toolStartTimes.get(event.toolCallId)
        if (startedAt != null) {
          block.data.durationMs = Math.max(0, now() - startedAt)
          toolStartTimes.delete(event.toolCallId)
        }
        if (event.isError) {
          block.data.errorMessage = event.result
        }

        const details = parseToolResultDetails(event.result)
        if (block.data.kind === 'python_exec') {
          block.data.stdout = typeof details?.stdout === 'string' ? details.stdout : ''
          block.data.stderr = typeof details?.stderr === 'string' ? details.stderr : ''
          const stdoutT = readTruncation(details?.stdoutTruncation)
          if (stdoutT) block.data.stdoutTruncation = stdoutT
          const stderrT = readTruncation(details?.stderrTruncation)
          if (stderrT) block.data.stderrTruncation = stderrT
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

        // 通用兜底：直接落原始 result 字符串，卡片层自行 parse 展示
        if (block.data.kind === 'generic_tool') {
          block.data.result = event.result
          return
        }
      }

      if (block.kind === 'ask_user' && block.data.id === event.toolCallId) {
        if (event.isError) {
          block.data.status = 'cancelled'
          session.agent = 'failed'
        } else {
          const details = parseToolResultDetails(event.result)
          const answerList = Array.isArray(details?.answers) ? details.answers : []
          block.data.status = 'answered'
          const answeredOptionIds: string[] = []
          let customText: string | undefined
          for (const answer of answerList) {
            if (!answer || typeof answer !== 'object') continue
            const label = 'label' in answer && typeof answer.label === 'string' ? answer.label : ''
            const isCustom = 'isCustom' in answer && answer.isCustom === true
            if (isCustom) {
              // 自由文本：归入 __free_text__ 项 + answeredText 回显原文
              answeredOptionIds.push('__free_text__')
              customText = label
            } else {
              const matched = block.data.options.find((option) => option.label === label)
              if (matched) answeredOptionIds.push(matched.id)
            }
          }
          if (answeredOptionIds.length > 0) {
            block.data.answeredOptionIds = answeredOptionIds
          }
          if (customText !== undefined) {
            block.data.answeredText = customText
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
      title: '数据分析',
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
    sessionId?: string
    title?: string
    messages: NotebookHistoryMessageItem[]
    toolCalls?: NotebookHistoryToolItem[]
  },
): void => {
  const session = state.session
  if (history.sessionId) {
    session.sessionId = history.sessionId
    state.activeConversationId = history.sessionId
  }
  if (history.title) {
    session.title = history.title
  }
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
  const activeId = state.activeConversationId ?? session.sessionId
  const existingConversation = state.conversations.find((item) => item.id === activeId)
  if (existingConversation) {
    // 仅同步标题；回放历史本身不是「活动」，不更新 updatedAt 以免把会话顶到列表最前。
    existingConversation.title = session.title
  }
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
          ...(readTruncation(details?.stdoutTruncation)
            ? { stdoutTruncation: readTruncation(details?.stdoutTruncation) }
            : {}),
          ...(readTruncation(details?.stderrTruncation)
            ? { stderrTruncation: readTruncation(details?.stderrTruncation) }
            : {}),
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
    case 'fs_write': {
      const content = textFromParam(params.content)
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'fs_write',
          path: String(params.path ?? ''),
          bytes: typeof details?.bytes === 'number' ? details.bytes : 0,
          content,
          addedLines: countLines(content),
          status,
          durationMs,
        },
      }
    }
    case 'fs_edit': {
      const oldStr = textFromParam(params.oldStr)
      const newStr = textFromParam(params.newStr)
      const { addedLines, removedLines } = computeEditLineStats(oldStr, newStr)
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'fs_edit',
          path: String(params.path ?? ''),
          oldStr,
          newStr,
          addedLines,
          removedLines,
          status,
          durationMs,
        },
      }
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
      // 未知工具回放也走通用兜底，避免历史工具调用被静默吞掉
      return {
        kind: 'tool',
        data: {
          id: tc.id,
          kind: 'generic_tool',
          toolName: tc.toolName,
          params,
          result: tc.result,
          status,
          durationMs,
        },
      }
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
    case 'session.model_changed': {
      // 切换模型后重置 contextUsage：旧模型的 token 数对新模型无意义，
      // 置为 null 让 UI 回到"待统计"灰态，待下一轮 agent_end 重新上报。
      session.runtime.currentModelId = event.profileId
      session.runtime.currentModelName = event.modelName
      session.runtime.contextUsage = {
        tokens: null,
        contextWindow: event.contextWindow,
        percent: null,
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
    case 'session.title_updated': {
      const title = String(event.title ?? '').trim()
      if (!title) return
      // 事件来自哪个会话：默认视为当前会话；若与当前会话不符，仅更新对应 conversation
      const sessionId = event.sessionId
      if (session.sessionId === sessionId) {
        session.title = title
      }
      const conversation = state.conversations.find((item) => item.id === sessionId)
      if (conversation) {
        conversation.title = title
        conversation.updatedAt = Date.now()
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
    case 'tool.start':
      applyToolStart(session, event as Extract<NotebookAgentEvent, { type: 'tool.start' }>)
      return
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
