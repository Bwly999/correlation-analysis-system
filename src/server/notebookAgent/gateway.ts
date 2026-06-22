/**
 * Notebook Agent gateway。
 *
 * 复用 Pi SDK 做推理，但工具执行严格走 notebook 的前端 bridge，
 * 与画布 Pi Agent 主链平级、零耦合。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import {
  createAgentSession,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import { buildNotebookSystemPrompt } from './systemPrompt.js'
import {
  appendNotebookMessage,
  archiveNotebookSession,
  createNotebookSession,
  deleteNotebookSession,
  getNotebookSession,
  listNotebookSessionsByUser,
  markNotebookSessionBootstrapPrompted,
  updateNotebookSessionRecord,
  updateNotebookSessionTitle,
  updateNotebookToolCall,
  type NotebookSessionRecord,
} from './sessionStore.js'
import type { ImportCsvMeta } from '../../notebook/shared/parentBridge.js'
import type { AuditEntry } from '../../notebook/runtime/auditLogger.js'
import { createNotebookTools } from './tools.js'
import { FrontendBridge, FrontendBridgeTimeoutError } from '../piAgent/frontendBridge.js'
import {
  buildModelFromProfile,
  createModelRegistryFromProfile,
  createPiAgentResourceLoader,
} from '../piAgent/runtimeFactory.js'
import { getSystemModelProfiles } from '../piAgent/modelProfiles.js'
import { bridgeNotebookEvent, type NotebookAgentSseEvent } from './eventBridge.js'
import {
  generateNotebookSessionTitle,
  isDefaultNotebookTitle,
} from './titleGenerator.js'
import {
  createNotebookSessionObjectStorage,
  isNotebookSessionS3Enabled,
} from './sessionStorage.js'

interface NotebookAgentRuntime {
  sessionId: string
  record: NotebookSessionRecord
  session: AgentSession
  sessionFile: string
  bridge: FrontendBridge
  eventListeners: Set<(event: NotebookAgentSseEvent) => void>
  currentMessageId: { value: string }
  bootstrapStarted: boolean
  streamSubscribed: boolean
  unsubscribe?: () => void
}

const runtimes = new Map<string, NotebookAgentRuntime>()
const NOTEBOOK_BOOTSTRAP_PROMPT =
  '请先开始需求澄清：用 grill-me 风格向用户提 1-3 个最关键的问题，然后再写 todo_write 计划。'

export interface CreateNotebookSessionInput {
  userId: string
  initialDataMeta?: ImportCsvMeta
  origin: string
}

export interface CreateNotebookSessionResult {
  sessionId: string
  systemPrompt: string
}

const emitRuntimeEvent = (runtime: NotebookAgentRuntime, event: NotebookAgentSseEvent) => {
  for (const listener of runtime.eventListeners) {
    try {
      listener(event)
    } catch {
      // ignore listener errors
    }
  }
}

const tryStartNotebookBootstrap = (runtime: NotebookAgentRuntime) => {
  if (runtime.bootstrapStarted || !runtime.streamSubscribed) return
  // 空白笔记本（未导入数据）不主动触发 bootstrap：没有上下文可澄清需求。
  if (!runtime.record.initialDataMeta) return
  if (!runtime.record.dataReady || runtime.record.messages.length > 0) return
  if (runtime.record.bootstrapPromptedAt) return
  runtime.bootstrapStarted = true
  markNotebookSessionBootstrapPrompted(runtime.sessionId)
  void Promise.resolve()
    .then(() => runtime.session.prompt(NOTEBOOK_BOOTSTRAP_PROMPT))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      updateNotebookSessionRecord(runtime.sessionId, { status: 'failed' })
      emitRuntimeEvent(runtime, { type: 'error', sessionId: runtime.sessionId, message })
    })
}

const getDefaultNotebookProfile = () => {
  const profiles = getSystemModelProfiles()
  if (profiles.length === 0) {
    throw new Error('未找到可用的 Notebook Agent 模型配置')
  }
  return profiles[0]!
}

/** notebook agent JSONL 会话文件存放目录（相对于 cwd） */
const resolveNotebookSessionDir = () =>
  process.env.NOTEBOOK_SESSION_DIR?.trim() || join(process.cwd(), '.workflow-storage', 'notebook-agent-sessions')

// --- S3 远端同步（可选，未配置 S3 环境变量时自动跳过） ---

const S3_KEY_PREFIX = 'notebook-agent/sessions/'

let _s3Storage: ReturnType<typeof createNotebookSessionObjectStorage> | null = null
let _s3StorageChecked = false

const getS3Storage = () => {
  if (!_s3StorageChecked) {
    _s3StorageChecked = true
    if (isNotebookSessionS3Enabled()) {
      _s3Storage = createNotebookSessionObjectStorage()
    }
  }
  return _s3Storage
}

/** 确保本地 session 目录存在 */
const ensureSessionDir = (): string => {
  const dir = resolveNotebookSessionDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 将本地 session 目录中所有 JSONL 文件同步到 S3 */
const syncSessionFilesToS3 = async (): Promise<void> => {
  const s3 = getS3Storage()
  if (!s3) return
  const dir = resolveNotebookSessionDir()
  if (!existsSync(dir)) return
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8')
      await s3.putObject(`${S3_KEY_PREFIX}${file}`, content)
    }
  } catch {
    // S3 sync failure is non-fatal
  }
}

/** 从 S3 下载 session 文件到本地（仅下载本地不存在的文件） */
const syncSessionFilesFromS3 = async (): Promise<void> => {
  const s3 = getS3Storage()
  if (!s3) return
  const dir = ensureSessionDir()
  try {
    const keys = await s3.listObjectKeys(S3_KEY_PREFIX)
    for (const key of keys) {
      const filename = key.split('/').pop()
      if (!filename || !filename.endsWith('.jsonl')) continue
      const localPath = join(dir, filename)
      if (existsSync(localPath)) continue
      const content = await s3.getObject(key)
      if (content) {
        writeFileSync(localPath, content, 'utf-8')
      }
    }
  } catch {
    // S3 sync failure is non-fatal
  }
}

/** 将单个 session JSONL 文件上传到 S3 */
const syncSessionFileToS3 = async (sessionFile: string): Promise<void> => {
  const s3 = getS3Storage()
  if (!s3) return
  if (!sessionFile || !existsSync(sessionFile)) return
  try {
    const filename = sessionFile.split(/[\\/]/).pop()
    if (!filename) return
    const content = readFileSync(sessionFile, 'utf-8')
    await s3.putObject(`${S3_KEY_PREFIX}${filename}`, content)
  } catch {
    // S3 sync failure is non-fatal
  }
}

/** 删除本地 session JSONL 文件及其 S3 远端副本 */
const deleteSessionFile = async (sessionFile: string): Promise<void> => {
  // 删除本地文件
  if (sessionFile) {
    try {
      if (existsSync(sessionFile)) {
        unlinkSync(sessionFile)
      }
    } catch {
      // ignore
    }
  }
  // 删除 S3 远端副本
  const s3 = getS3Storage()
  if (!s3) return
  try {
    const filename = sessionFile.split(/[\\/]/).pop()
    if (!filename) return
    await s3.deleteObject(`${S3_KEY_PREFIX}${filename}`)
  } catch {
    // S3 delete failure is non-fatal
  }
}

export const createNotebookAgentSession = async (
  input: CreateNotebookSessionInput,
): Promise<CreateNotebookSessionResult> => {
  const record = createNotebookSession({
    userId: input.userId,
    initialDataMeta: input.initialDataMeta,
    origin: input.origin,
  })
  const systemPrompt = buildNotebookSystemPrompt({
    initialDataMeta: input.initialDataMeta,
  })
  await buildAndRegisterRuntime(record, systemPrompt)
  return { sessionId: record.sessionId, systemPrompt }
}

/**
 * 构建 Pi SDK runtime 并注册到 runtimes Map。供 create / resume 复用。
 */
const buildAndRegisterRuntime = async (
  record: NotebookSessionRecord,
  systemPrompt: string,
): Promise<NotebookAgentRuntime> => {
  const profile = getDefaultNotebookProfile()
  const eventListeners = new Set<(event: NotebookAgentSseEvent) => void>()
  const bridge = new FrontendBridge((event) => {
    const runtime = runtimes.get(record.sessionId)
    if (!runtime) return
    emitRuntimeEvent(runtime, {
      type: 'tool.execute',
      sessionId: record.sessionId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      params: event.params,
    })
  })
  const tools = createNotebookTools(bridge)
  const { authStorage, modelRegistry } = createModelRegistryFromProfile(profile)
  const model = buildModelFromProfile(profile)
  const resourceLoader = createPiAgentResourceLoader(() => systemPrompt)
  await resourceLoader.reload()
  const sessionManager = SessionManager.create(process.cwd(), ensureSessionDir())
  const { session } = await createAgentSession({
    sessionManager,
    authStorage,
    modelRegistry,
    model: model as never,
    thinkingLevel: 'low',
    cwd: process.cwd(),
    customTools: tools,
    resourceLoader,
    noTools: 'builtin',
  })

  const runtime: NotebookAgentRuntime = {
    sessionId: record.sessionId,
    record,
    session,
    sessionFile: sessionManager.getSessionFile(),
    bridge,
    eventListeners,
    currentMessageId: { value: '' },
    bootstrapStarted: false,
    streamSubscribed: false,
  }
  runtime.bootstrapStarted = Boolean(record.bootstrapPromptedAt)

  const unsubscribe = session.subscribe((event) => {
    const sseEvents = bridgeNotebookEvent(event, record, runtime.currentMessageId)
    for (const sseEvent of sseEvents) {
      emitRuntimeEvent(runtime, sseEvent)
    }
    // 一轮结束后上报上下文窗口使用情况（SDK 同步方法，数据此时最新）
    if (event.type === 'agent_end') {
      const usage = runtime.session.getContextUsage?.()
      if (usage) {
        emitRuntimeEvent(runtime, {
          type: 'session.context_usage',
          sessionId: runtime.sessionId,
          tokens: usage.tokens,
          contextWindow: usage.contextWindow,
          percent: usage.percent,
        })
      }
      // 首轮对话且标题仍是默认占位名：异步让 LLM 生成短标题，写回并推送。
      // 不 await、不阻塞主流程；失败/为空静默忽略。用户手动改过名后不再覆盖。
      const userMsgCount = record.messages.filter((m) => m.role === 'user').length
      if (userMsgCount === 1 && isDefaultNotebookTitle(record.title)) {
        void generateNotebookSessionTitle(record)
          .then((title) => {
            if (!title || title === record.title) return
            if (!isDefaultNotebookTitle(record.title)) return
            updateNotebookSessionTitle(runtime.sessionId, title)
            emitRuntimeEvent(runtime, {
              type: 'session.title_updated',
              sessionId: runtime.sessionId,
              title,
            })
          })
          .catch(() => {
            // 标题生成失败不影响主流程
          })
      }
    }
    // 压缩结束后 SDK 内部上下文已变（早期消息被摘要替代），
    // 立即重报一次 contextUsage：tokens 通常大幅下降，或为 null 等下一轮恢复。
    if (event.type === 'compaction_end') {
      const usage = runtime.session.getContextUsage?.()
      if (usage) {
        emitRuntimeEvent(runtime, {
          type: 'session.context_usage',
          sessionId: runtime.sessionId,
          tokens: usage.tokens,
          contextWindow: usage.contextWindow,
          percent: usage.percent,
        })
      }
    }
  })
  runtime.unsubscribe = unsubscribe
  runtimes.set(record.sessionId, runtime)
  return runtime
}

/**
 * Resume：为已归档（runtime 已释放）的会话重建 runtime，保留历史 record。
 * 若 runtime 仍在线则直接返回。用于「继续上次分析」刷新页面后的场景。
 * @returns true=runtime 已就绪；false=会话 record 不存在
 */
export const ensureNotebookAgentRuntime = async (
  sessionId: string,
): Promise<boolean> => {
  if (runtimes.has(sessionId)) return true
  const record = getNotebookSession(sessionId)
  if (!record) return false
  const systemPrompt = buildNotebookSystemPrompt({
    initialDataMeta: record.initialDataMeta,
  })
  await buildAndRegisterRuntime(record, systemPrompt)
  return true
}

export const getNotebookAgentSessionOwner = (sessionId: string): string | null =>
  getNotebookSession(sessionId)?.userId ?? null

export const getNotebookAgentSessionView = (sessionId: string) => {
  const r = getNotebookSession(sessionId)
  if (!r) return undefined
  return summarize(r)
}

/**
 * 列出某用户最近的 notebook 会话概要（用于前端「继续上次分析」入口）。
 */
export const listNotebookAgentSessionsByUser = (
  userId: string,
): Array<{
  sessionId: string
  title: string
  initialDataMeta?: ImportCsvMeta
  status: NotebookSessionRecord['status']
  archivedAt?: number
  createdAt: number
  updatedAt: number
  messageCount: number
  lastUserMessagePreview?: string
}> => {
  return listNotebookSessionsByUser(userId).map((r) => {
    const lastUserMsg = [...r.messages]
      .reverse()
      .find((m) => m.role === 'user')
    return {
      sessionId: r.sessionId,
      title: r.title,
      initialDataMeta: r.initialDataMeta,
      status: r.status,
      archivedAt: r.archivedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messageCount: r.messages.length,
      lastUserMessagePreview: lastUserMsg
        ? lastUserMsg.content.slice(0, 60)
        : undefined,
    }
  })
}

export const updateNotebookAgentSessionTitle = (
  sessionId: string,
  title: string,
): boolean => {
  return updateNotebookSessionTitle(sessionId, title)
}

/**
 * 软关闭：释放 runtime（Pi SDK AgentSession），但保留 sessionStore record，
 * 以便「继续上次分析」时能回放历史。runtime 可后续 resume 时按需重建。
 *
 * 关闭时同步 session JSONL 文件到 S3（若已配置），实现远端归档。
 */
export const closeNotebookAgentSession = (sessionId: string): boolean => {
  const r = getNotebookSession(sessionId)
  if (!r) return false
  const runtime = runtimes.get(sessionId)
  if (runtime) {
    // 软关闭前将 session JSONL 文件同步到 S3
    void syncSessionFileToS3(runtime.sessionFile)
    runtime.bridge.dispose()
    runtime.unsubscribe?.()
    runtime.session.dispose()
    runtime.eventListeners.clear()
  }
  runtimes.delete(sessionId)
  // 软关闭：标记 archivedAt，record 保留（不改 status，不清审计——历史需要保留）。
  // 前端 resume 时若 runtime 已不在，拿到的 status 仍能反映最后状态。
  archiveNotebookSession(sessionId)
  return true
}

/**
 * 彻底删除会话 record + runtime（显式 DELETE 端点调用）。
 *
 * 同时清理本地 JSONL 文件，以及 S3 远端副本（若已配置）。
 */
export const destroyNotebookAgentSession = (sessionId: string): boolean => {
  const runtime = runtimes.get(sessionId)
  if (runtime) {
    // 删除本地 + S3 远端 session JSONL 文件
    void deleteSessionFile(runtime.sessionFile)
    runtime.bridge.dispose()
    runtime.unsubscribe?.()
    runtime.session.dispose()
    runtime.eventListeners.clear()
  }
  runtimes.delete(sessionId)
  clearNotebookAuditEntries(sessionId)
  return deleteNotebookSession(sessionId)
}

export const sendNotebookAgentMessage = async (
  sessionId: string,
  payload: {
    id: string
    content: string
  },
): Promise<boolean> => {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return false

  appendNotebookMessage(sessionId, {
    id: payload.id,
    role: 'user',
    content: payload.content,
    status: 'completed',
    createdAt: Date.now(),
  })
  updateNotebookSessionRecord(sessionId, { status: 'running' })

  void (async () => {
    try {
      await runtime.session.prompt(payload.content)
    } catch (error) {
      // 用户已主动 abort 时，record.status 已是 idle：忽略 abort 引发的错误，避免覆盖 cancelled 状态并弹错误消息
      if (runtime.record.status === 'idle') return
      const message = error instanceof Error ? error.message : String(error)
      updateNotebookSessionRecord(sessionId, { status: 'failed' })
      emitRuntimeEvent(runtime, { type: 'error', sessionId, message })
      if (error instanceof FrontendBridgeTimeoutError) {
        runtime.bridge.cancelPendingRequests('前端执行超时')
      }
    }
  })()

  return true
}

/**
 * 终止当前轮 Agent 推理（用户主动取消）。
 * 照搬 jsTransformAgentGateway.abortJsTransformAgentRun 模式：
 *   清队列 → 取消挂起的工具调用 → 标记 idle → session.abort() → 广播 session.status:"cancelled"。
 *
 * 关键顺序：必须在 session.abort() 之前就把 record.status 置为 idle，
 * 否则 abort 触发的 agent_end 事件经 eventBridge 时 record.status 仍是 'running'，
 * 会广播错误的 'completed' 让前端误以为还在跑。
 */
export const abortNotebookAgentSession = async (
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> => {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return { ok: false, error: '会话不存在' }

  runtime.session.clearQueue()
  runtime.bridge.cancelPendingRequests('当前轮已取消')
  // 先标记 idle，防止 abort 期间到达的 agent_end 事件覆盖状态
  updateNotebookSessionRecord(sessionId, { status: 'idle' })
  await runtime.session.abort()

  emitRuntimeEvent(runtime, {
    type: 'session.status',
    sessionId,
    status: 'cancelled',
  })

  return { ok: true }
}

/**
 * 手动触发上下文压缩。
 *
 * 走 Pi SDK 的 session.compact()：由 SDK 用 LLM 把早期对话总结成结构化摘要，
 * 替换原始消息。压缩过程的 compaction_start / compaction_end 事件会经
 * session.subscribe 自动推到前端，无需这里手动 emit。
 *
 * @param customInstructions 可选的自定义摘要指令（如"重点保留代码变更"）
 * @returns ok=true=已触发；ok=false + error=会话不存在或压缩失败
 */
export const compactNotebookAgentSession = async (
  sessionId: string,
  customInstructions?: string,
): Promise<{ ok: boolean; error?: string }> => {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return { ok: false, error: '会话不存在' }
  try {
    await runtime.session.compact(customInstructions)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

export const finishNotebookAgentToolCall = (
  sessionId: string,
  toolCallId: string,
  payload: {
    content?: Array<{ type: 'text'; text: string }>
    details?: Record<string, unknown>
    result?: string
    isError?: boolean
  },
): boolean => {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return false

  updateNotebookToolCall(sessionId, toolCallId, {
    status: payload.isError ? 'failed' : 'success',
    result: payload.result ?? JSON.stringify(payload.details ?? {}, null, 2),
    isError: payload.isError,
    finishedAt: Date.now(),
  })

  if (payload.isError) {
    return runtime.bridge.rejectResult(
      toolCallId,
      new Error(
        payload.content?.[0]?.text ||
          payload.result ||
          JSON.stringify(payload.details ?? { message: 'Notebook 工具执行失败' }),
      ),
    )
  }

  return runtime.bridge.resolveResult(toolCallId, {
    content: payload.content ?? [{ type: 'text', text: JSON.stringify(payload.details ?? {}, null, 2) }],
    details: (payload.details ?? {}) as never,
  })
}

const summarize = (r: NotebookSessionRecord) => ({
  sessionId: r.sessionId,
  title: r.title,
  status: r.status,
  origin: r.origin,
  initialDataMeta: r.initialDataMeta,
  messages: r.messages,
  toolCalls: r.toolCalls,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})

export const subscribeNotebookAgentEvents = (
  sessionId: string,
  listener: (event: NotebookAgentSseEvent) => void,
): (() => void) | null => {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return null
  runtime.eventListeners.add(listener)
  runtime.streamSubscribed = true
  tryStartNotebookBootstrap(runtime)
  return () => {
    runtime.eventListeners.delete(listener)
  }
}

export const markNotebookAgentSessionReady = (sessionId: string): boolean => {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return false
  runtime.record.dataReady = true
  updateNotebookSessionRecord(sessionId, { dataReady: true })
  tryStartNotebookBootstrap(runtime)
  return true
}

/** 审计日志存储（内存，session 维度；session 关闭时清）。M1 用内存即可。 */
const auditBuffers = new Map<string, AuditEntry[]>()

/**
 * 向 Agent 上下文注入一条 system message（不触发新一轮，挂在下一条用户消息之前）。
 *
 * 用途：Worker 硬超时 / 崩溃自愈重启后，告知 Agent "Python 环境已重启，Workspace 文件保留"，
 * 让其下一轮动作能正确处理已失效的 in-memory 状态（如已 import 的模块、已加载的 DataFrame）。
 *
 * 实现：走 Pi SDK 的 sendCustomMessage(deliverAs: 'nextTurn')，把消息挂到下一次 prompt
 * 的上下文里，不打断当前流、不创建独立 user turn。
 *
 * @returns true=成功注入；false=会话不存在或注入失败
 */
export const injectNotebookSystemMessage = async (
  sessionId: string,
  message: string,
): Promise<boolean> => {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return false
  try {
    // nextTurn：挂在下一次用户消息前作上下文，不触发独立 turn
    await runtime.session.sendCustomMessage(
      {
        customType: 'environment_notice',
        content: message,
        display: false,
        details: { source: 'worker_restart' },
      },
      { deliverAs: 'nextTurn' },
    )
    return true
  } catch {
    // sendCustomMessage 失败时退化为 steer：当前 turn 结束后注入（不阻塞）
    try {
      await runtime.session.steer(message)
      return true
    } catch {
      return false
    }
  }
}

/**
 * 接收前端上报的审计日志条目（关键事件 / session 结束时全量）。
 * 存内存 buffer（session 维度），供事后排查。session 不存在时仍记录（便于排查已关闭 session 的尾包）。
 */
export const appendNotebookAuditEntries = (
  sessionId: string,
  entries: AuditEntry[],
): void => {
  if (entries.length === 0) return
  const existing = auditBuffers.get(sessionId) ?? []
  existing.push(...entries)
  // 服务端再裁一次（前端已限 500，这里防止异常上报撑爆内存）
  if (existing.length > 1000) {
    existing.splice(0, existing.length - 1000)
  }
  auditBuffers.set(sessionId, existing)
}

/** 读取某 session 的审计日志（调试 / 排查用）。 */
export const getNotebookAuditEntries = (sessionId: string): AuditEntry[] => {
  return auditBuffers.get(sessionId) ?? []
}

/** session 关闭时清理审计 buffer（由 closeNotebookAgentSession 调用）。 */
const clearNotebookAuditEntries = (sessionId: string): void => {
  auditBuffers.delete(sessionId)
}
