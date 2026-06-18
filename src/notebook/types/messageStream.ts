/**
 * Notebook 消息流类型协议（前端展示层）。
 *
 * 来源约束：
 *   - 文档 docs/design-doc/notebook-agent/UX与交互.md §5
 *   - 文档 docs/design-doc/notebook-agent/工具集协议.md（执行结果字段）
 *
 * 该协议为「展示层」类型：把 Pi Agent SDK 流式事件归一化成 UI 可直接渲染的卡片。
 * 后续接入真实 SSE 时，由 mapper 把 SDK 事件 → 这些类型，组件不动。
 */

export type ToolStatus = 'running' | 'success' | 'failed'

/** 公共字段：每个工具调用都带 */
export interface ToolCallBase {
  id: string
  status: ToolStatus
  /** 总耗时 ms；running 状态可为空 */
  durationMs?: number
  /** 错误信息；failed 状态使用 */
  errorMessage?: string
}

/** python_exec_inline / python_exec_file */
export interface PythonExecToolCall extends ToolCallBase {
  kind: 'python_exec'
  variant: 'inline' | 'file'
  /** inline=源代码；file=文件路径 */
  code: string
  /** stdout 流式累积；可超长，组件做限高+全文展开 */
  stdout: string
  stderr: string
  /** 解释错误类型（interrupted / timeout / runtime_error 等） */
  errorType?: string
}

export interface FsWriteToolCall extends ToolCallBase {
  kind: 'fs_write'
  path: string
  bytes: number
  /** 前 200 字符预览 */
  preview: string
}

export interface FsEditToolCall extends ToolCallBase {
  kind: 'fs_edit'
  path: string
  /** 编辑后预览 */
  preview: string
}

export interface FsReadToolCall extends ToolCallBase {
  kind: 'fs_read'
  path: string
  /** 实际读到的行数 */
  linesShown: number
  /** 总行数（如已知） */
  linesTotal?: number
  content: string
  truncated: boolean
}

export interface FsGrepMatch {
  path: string
  line: number
  text: string
}

export interface FsGrepToolCall extends ToolCallBase {
  kind: 'fs_grep'
  pattern: string
  scope: string
  matches: FsGrepMatch[]
}

export type TodoState = 'pending' | 'in_progress' | 'completed'
export interface TodoItem {
  id: string
  text: string
  state: TodoState
}

export interface TodoWriteToolCall extends ToolCallBase {
  kind: 'todo_write'
  items: TodoItem[]
}

export type AnyToolCall =
  | PythonExecToolCall
  | FsWriteToolCall
  | FsEditToolCall
  | FsReadToolCall
  | FsGrepToolCall
  | TodoWriteToolCall

/** Agent 思考块（SDK 既有 thinking content） */
export interface ThinkingBlock {
  id: string
  /** 思考耗时（推理 token 阶段） */
  durationMs?: number
  text: string
}

/** ask_user 选项 */
export interface AskUserOption {
  id: string
  label: string
  detail?: string
  recommended?: boolean
}

export type AskUserStatus = 'pending' | 'answered' | 'cancelled'

export interface AskUserBlock {
  id: string
  question: string
  options: AskUserOption[]
  /** 是否允许自由文本（"你自己定" 选项） */
  allowFreeText?: boolean
  status: AskUserStatus
  /** 用户最终选择 */
  answeredOptionId?: string
  /** 用户提交的自由文本 */
  answeredText?: string
}

/** 用户消息 */
export interface UserMessage {
  id: string
  role: 'user'
  text: string
  /** 发送时间 */
  at: number
}

/** Agent 文本段（普通自然语言段） */
export interface AssistantTextBlock {
  id: string
  /** 用 markdown 渲染 */
  text: string
}

/** Agent 消息：思考 + 多个文本段 + 多个工具调用 + 0..1 ask_user，按顺序排列 */
export type AssistantBlock =
  | { kind: 'thinking'; data: ThinkingBlock }
  | { kind: 'text'; data: AssistantTextBlock }
  | { kind: 'tool'; data: AnyToolCall }
  | { kind: 'ask_user'; data: AskUserBlock }

export interface AssistantMessage {
  id: string
  role: 'assistant'
  blocks: AssistantBlock[]
  /** 是否是当前 streaming 的最后一条 */
  streaming?: boolean
  at: number
}

/**
 * 系统提示消息（非 user / assistant，用于在时间线上标注会话级事件）。
 *
 * 当前用途：上下文压缩完成后留痕 —— 让用户看到"这里发生过压缩"，
 * 而非压缩后流里凭空消失一段对话。刷新页面后不回放（后端 sessionStore
 * 只存 user/assistant），与压缩"早期对话被摘要替代"的性质一致。
 */
export interface SystemNoticeMessage {
  id: string
  role: 'system'
  /** 提示种类 */
  kind: 'compaction'
  at: number
  /** 触发来源 */
  reason: 'manual' | 'threshold' | 'overflow'
  /** 压缩前 token 数（用于展示"释放了 X tokens"） */
  tokensBefore: number | null
}

export type NotebookMessage = UserMessage | AssistantMessage | SystemNoticeMessage

// ──────────────────────────────────────────────
// Runtime / Loading / Banner / Toast
// ──────────────────────────────────────────────

export type LoadingStage = 'load_runtime' | 'load_packages' | 'mount_fs' | 'lock_sandbox'

export interface LoadingProgress {
  stage: LoadingStage
  /** 0..100 */
  percent: number
  /** 当前正在加载的包名 / 阶段细节 */
  detail?: string
}

export interface LoadingFailure {
  reason: string
  detail?: string
}

export type SessionPhase =
  | { kind: 'loading'; progress: LoadingProgress }
  | { kind: 'failed'; failure: LoadingFailure }
  | { kind: 'ready' }

export interface RuntimeStats {
  /** Worker 内存使用（MB） */
  memoryMb: number
  /** 累计 python_exec_* 调用次数 */
  cellCount: number
  /** session 开始至今 Agent 工作秒数 */
  agentSeconds: number
  /** Agent 是否正在跑（影响"停止"按钮）*/
  isRunning: boolean
  /** Python 是否被重启过（用于状态条提示） */
  recentlyRestarted?: boolean
  /** Worker 自动重启累计次数（watch 此字段变化触发"环境已重启"吐司，UX §8.1） */
  restartCount?: number
  /** 模型上下文窗口使用情况（每轮结束由后端推送） */
  contextUsage?: {
    tokens: number | null
    contextWindow: number
    percent: number | null
  }
  /** 正在压缩中（SDK compaction_start 到 compaction_end 之间） */
  compactionInProgress?: boolean
  /** 历史压缩记录（仅保留最近若干条，用于 hover 面板展示） */
  compactionHistory?: CompactionRecord[]
}

/** 一次上下文压缩的元数据记录（不存 summary 全文，仅元数据） */
export interface CompactionRecord {
  id: string
  reason: 'manual' | 'threshold' | 'overflow'
  finishedAt: number
  /** 压缩前 token 数（用于展示"节省了 X tokens"） */
  tokensBefore: number | null
  aborted: boolean
}

export type AgentLifecycle = 'idle' | 'running' | 'awaiting_user' | 'completed' | 'failed'

// ──────────────────────────────────────────────
// 顶级 ViewModel：交给 NotebookView 的 props
// ──────────────────────────────────────────────

export interface NotebookSessionVm {
  sessionId: string
  /** 标题；用户可改 */
  title: string
  phase: SessionPhase
  agent: AgentLifecycle
  runtime: RuntimeStats
  messages: NotebookMessage[]
  /** 当前活跃 todo（todo_write 累计的最后一份） */
  todos: TodoItem[]
  /** 网络/连接状态 */
  connection: 'online' | 'reconnecting' | 'offline'
}

// ──────────────────────────────────────────────
// 对话列表（左侧 sidebar 用）
// ──────────────────────────────────────────────

/**
 * 一条历史对话的展示态。
 *
 * 列表由父站灌入：本组件只负责呈现与触发选择/新建/自定义事件，
 * 不持有真实持久化逻辑。
 */
export interface NotebookConversation {
  id: string
  title: string
  /** 最后活动时间（ms）— 列表按此倒序 */
  updatedAt: number
  /** 简短摘要，未使用时为空 */
  preview?: string
}
