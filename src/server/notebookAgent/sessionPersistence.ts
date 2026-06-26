import type { SessionEntry, SessionInfo, SessionManager } from '@earendil-works/pi-coding-agent'
import { SessionManager as PiSessionManager } from '@earendil-works/pi-coding-agent'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ServerStorageUser } from '../storageService.js'
import type { ImportCsvMeta } from '../../notebook/shared/parentBridge.js'
import {
  buildDefaultNotebookTitle,
  type NotebookMessage,
  type NotebookSessionRecord,
  type NotebookSessionStatus,
  type NotebookToolCall,
  upsertNotebookSession,
  getNotebookSession,
  listNotebookSessionsByUser,
} from './sessionStore.js'
import {
  createNotebookSessionObjectStorage,
  isNotebookSessionS3Enabled,
} from './sessionStorage.js'

const NOTEBOOK_SESSION_META_TYPE = 'notebook-session-meta'
const NOTEBOOK_SESSION_KIND = 'notebook-agent-session'
const NOTEBOOK_SESSION_DIR = process.env.NOTEBOOK_SESSION_DIR?.trim()
  || join(process.cwd(), '.workflow-storage', 'notebook-agent-sessions')
const S3_KEY_PREFIX = 'notebook-agent/sessions/'

export interface NotebookPersistedMeta {
  kind: typeof NOTEBOOK_SESSION_KIND
  sessionId: string
  userId?: string
  origin: string
  title?: string
  status: NotebookSessionStatus
  dataReady: boolean
  bootstrapPromptedAt?: number
  archivedAt?: number
  initialDataMeta?: ImportCsvMeta
  createdAt?: number
  updatedAt?: number
  sessionFile?: string
  /** 会话历史概要（用于列表展示，rehydrate 时只读这部分即可，无需解析全量 history） */
  messageCount?: number
  lastUserMessagePreview?: string
}

type NotebookSessionSummary = {
  sessionId: string
  userId?: string
  title: string
  initialDataMeta?: ImportCsvMeta
  status: NotebookSessionStatus
  archivedAt?: number
  createdAt: number
  updatedAt: number
  messageCount: number
  lastUserMessagePreview?: string
  /** 已落盘的 session 文件路径，按需重建全量 record 时复用 */
  sessionFile?: string
}

// 只缓存会话概要（列表/owner 校验够用）；全量 messages/toolCalls 不常驻，
// 需要时由 loadNotebookSessionRecord 按需从磁盘重建。
const persistedSummaries = new Map<string, NotebookSessionSummary>()
let rehydrated = false
let s3Storage:
  | ReturnType<typeof createNotebookSessionObjectStorage>
  | null = null
let s3StorageChecked = false

export const resolveNotebookSessionDir = (): string => NOTEBOOK_SESSION_DIR

export const ensureNotebookSessionDir = (): string => {
  const dir = resolveNotebookSessionDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

const getS3Storage = () => {
  if (!s3StorageChecked) {
    s3StorageChecked = true
    if (isNotebookSessionS3Enabled()) {
      s3Storage = createNotebookSessionObjectStorage()
    }
  }
  return s3Storage
}

const isNotebookSessionMeta = (value: unknown): value is NotebookPersistedMeta => {
  if (!value || typeof value !== 'object') return false
  const meta = value as Partial<NotebookPersistedMeta>
  return meta.kind === NOTEBOOK_SESSION_KIND
    && typeof meta.sessionId === 'string'
    && typeof meta.origin === 'string'
    && typeof meta.status === 'string'
    && typeof meta.dataReady === 'boolean'
}

const normalizeStatus = (value: unknown): NotebookSessionStatus => {
  switch (value) {
    case 'idle':
    case 'running':
    case 'completed':
    case 'failed':
    case 'interrupted':
      return value
    default:
      return 'idle'
  }
}

const resolveSessionName = (
  sessionManager: Pick<SessionManager, 'getSessionName'>,
  meta: NotebookPersistedMeta,
  fallbackTimestamp: number,
) => sessionManager.getSessionName?.()
  || meta.title
  || buildDefaultNotebookTitle(fallbackTimestamp)

const extractNotebookMeta = (entries: SessionEntry[]): NotebookPersistedMeta | null => {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (!entry || entry.type !== 'custom' || entry.customType !== NOTEBOOK_SESSION_META_TYPE) continue
    if (isNotebookSessionMeta(entry.data)) {
      return entry.data
    }
  }
  return null
}

type SessionMessage = {
  role?: string
  content?: string | Array<Record<string, unknown>>
  timestamp?: number
  toolCallId?: string
  toolName?: string
  isError?: boolean
  details?: unknown
}

// SDK 原生 message entry 的 content 块里，文本内容统一为 {type:'text', text}。
const extractTextBlocks = (content: SessionMessage['content']): string =>
  Array.isArray(content)
    ? content
      .filter((part) => part?.type === 'text')
      .map((part) => part?.text ?? '')
      .join('')
    : typeof content === 'string'
      ? content
      : ''

const resolveCreatedAt = (message: SessionMessage, fallbackTimestamp: string): number =>
  typeof message.timestamp === 'number'
    ? message.timestamp
    : new Date(fallbackTimestamp).getTime()

// 从 SDK 原生 entry 重建 notebook 视图下的 messages + toolCalls。
//
// 关键：工具结果在 SDK 里以 message(role:'toolResult') 落盘（非 custom_message），
// 工具调用本身则内嵌在 assistant message 的 content 里的 {type:'toolCall'} 块。
// 二者靠 toolCallId 关联。这里严格按该结构解析。
const extractHistory = (entries: SessionEntry[]): {
  messages: NotebookMessage[]
  toolCalls: NotebookToolCall[]
} => {
  const messages: NotebookMessage[] = []
  const toolCalls: NotebookToolCall[] = []

  for (const entry of entries) {
    if (entry.type !== 'message') continue
    const message = entry.message as SessionMessage

    if (message.role === 'user') {
      const content = extractTextBlocks(message.content)
      messages.push({
        id: entry.id,
        role: 'user',
        content,
        rawContent: content,
        status: 'completed',
        createdAt: resolveCreatedAt(message, entry.timestamp),
      })
      continue
    }

    if (message.role === 'assistant') {
      const content = extractTextBlocks(message.content)
      messages.push({
        id: entry.id,
        role: 'assistant',
        content,
        rawContent: content,
        status: 'completed',
        createdAt: resolveCreatedAt(message, entry.timestamp),
      })
      // assistant content 内嵌的 toolCall 块（id/name/arguments）建立 toolCall 记录，
      // 等待后续 toolResult message 填充结果。
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block?.type !== 'toolCall') continue
          toolCalls.push({
            id: typeof block.id === 'string' ? block.id : entry.id,
            toolName: typeof block.name === 'string' ? block.name : 'unknown',
            args: block.arguments,
            status: 'running',
            startedAt: resolveCreatedAt(message, entry.timestamp),
          })
        }
      }
      continue
    }

    if (message.role === 'toolResult') {
      const toolCallId = typeof message.toolCallId === 'string' ? message.toolCallId : ''
      const toolCall = toolCalls.find((item) => item.id === toolCallId)
      if (!toolCall) continue
      toolCall.status = message.isError ? 'failed' : 'success'
      toolCall.isError = Boolean(message.isError)
      toolCall.finishedAt = resolveCreatedAt(message, entry.timestamp)
      toolCall.result = extractTextBlocks(message.content)
      continue
    }
  }

  return { messages, toolCalls }
}

const summarizeRecord = (record: NotebookSessionRecord): NotebookSessionSummary => {
  const lastUserMsg = [...record.messages].reverse().find((item) => item.role === 'user')
  return {
    sessionId: record.sessionId,
    userId: record.userId,
    title: record.title,
    initialDataMeta: record.initialDataMeta,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
    lastUserMessagePreview: lastUserMsg?.content.slice(0, 60),
    sessionFile: record.sessionFile,
  }
}

/**
 * 从磁盘重建会话全量 record（按需调用：仅「打开单个会话」时触发）。
 *
 * 这是全量 messages/toolCalls 唯一进入内存的路径。重建结果交给活跃 sessions
 * Map 管理，会话归档即丢弃，下次打开再重建（用完即弃，无 LRU）。
 */
const buildRecordFromSession = (
  sessionManager: Pick<SessionManager, 'getEntries' | 'getSessionName' | 'getSessionFile'>,
  fallbackUser?: ServerStorageUser,
): NotebookSessionRecord | null => {
  const entries = sessionManager.getEntries()
  const meta = extractNotebookMeta(entries)
  if (!meta) return null

  const userId = meta.userId ?? fallbackUser?.id
  if (!userId) return null

  const { messages, toolCalls } = extractHistory(entries)
  const createdAt = meta.createdAt ?? Date.now()
  const updatedAt = meta.updatedAt ?? createdAt
  return {
    sessionId: meta.sessionId,
    userId,
    origin: meta.origin,
    title: resolveSessionName(sessionManager, meta, createdAt),
    sessionFile: meta.sessionFile ?? sessionManager.getSessionFile?.(),
    bootstrapPromptedAt: meta.bootstrapPromptedAt,
    initialDataMeta: meta.initialDataMeta,
    status: normalizeStatus(meta.status),
    dataReady: Boolean(meta.dataReady),
    messages,
    toolCalls,
    createdAt,
    updatedAt,
    archivedAt: meta.archivedAt,
  }
}

const cacheRecord = (record: NotebookSessionRecord) => {
  persistedSummaries.set(record.sessionId, summarizeRecord(record))
  upsertNotebookSession(record)
}

const cacheSummary = (summary: NotebookSessionSummary) => {
  persistedSummaries.set(summary.sessionId, summary)
}

/**
 * 从 session 文件构造概要（rehydrate 用）。
 *
 * 只读最后一条 notebook-session-meta（含业务元数据 + messageCount/preview），
 * 不解析全量 message/toolCall history —— 这是 rehydrate 内存优化的关键：
 * 历史内容只在「打开单个会话」时由 loadNotebookSessionRecord 按需重建。
 */
const buildSummaryFromSession = (
  sessionInfo: SessionInfo,
  sessionManager: Pick<SessionManager, 'getEntries' | 'getSessionName' | 'getSessionFile'>,
  fallbackUser?: ServerStorageUser,
): NotebookSessionSummary | null => {
  const meta = extractNotebookMeta(sessionManager.getEntries())
  if (!meta) return null

  const userId = meta.userId ?? fallbackUser?.id
  if (!userId) return null

  const createdAt = meta.createdAt ?? sessionInfo.created.getTime()
  const updatedAt = meta.updatedAt ?? sessionInfo.modified.getTime()
  return {
    sessionId: meta.sessionId,
    userId,
    title: resolveSessionName(sessionManager, meta, createdAt),
    initialDataMeta: meta.initialDataMeta,
    status: normalizeStatus(meta.status),
    archivedAt: meta.archivedAt,
    createdAt,
    updatedAt,
    // 旧文件 meta 无此字段时兜底为 0/undefined，列表显示「0 条」，点进去仍能正常回放
    messageCount: typeof meta.messageCount === 'number' ? meta.messageCount : 0,
    lastUserMessagePreview: meta.lastUserMessagePreview,
    sessionFile: meta.sessionFile ?? sessionManager.getSessionFile?.(),
  }
}

export const persistNotebookSessionMeta = (
  sessionManager: Pick<SessionManager, 'appendCustomEntry' | 'getSessionFile'>,
  record: NotebookSessionRecord,
): void => {
  const summary = summarizeRecord(record)
  const payload: NotebookPersistedMeta = {
    kind: NOTEBOOK_SESSION_KIND,
    sessionId: record.sessionId,
    userId: record.userId,
    origin: record.origin,
    title: record.title,
    status: record.status,
    dataReady: record.dataReady,
    bootstrapPromptedAt: record.bootstrapPromptedAt,
    archivedAt: record.archivedAt,
    initialDataMeta: record.initialDataMeta,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sessionFile: record.sessionFile ?? sessionManager.getSessionFile?.(),
    messageCount: summary.messageCount,
    lastUserMessagePreview: summary.lastUserMessagePreview,
  }
  sessionManager.appendCustomEntry(NOTEBOOK_SESSION_META_TYPE, payload)
  cacheRecord({
    ...record,
    sessionFile: payload.sessionFile,
  })
}

export const persistNotebookSessionTitle = (
  sessionManager: Pick<SessionManager, 'appendSessionInfo' | 'getSessionFile'>,
  title: string,
): void => {
  sessionManager.appendSessionInfo(title)
}

export const persistNotebookSessionMessage = (
  _sessionManager: Pick<SessionManager, 'appendCustomMessageEntry'>,
  _message: NotebookMessage,
): void => {
  // 用户/助手消息本身已由 Pi SDK session 原生 message entries 持久化。
}

export const persistNotebookSessionToolCall = (
  _sessionManager: Pick<SessionManager, 'appendCustomEntry'>,
  _toolCall: NotebookToolCall,
): void => {
  // 工具结果是否可完整恢复取决于 SDK/扩展事件写入方式；当前先复用内存回放逻辑。
}

export const ensureNotebookSessionsRehydrated = async (
  fallbackUser?: ServerStorageUser,
): Promise<void> => {
  if (rehydrated) return
  rehydrated = true
  persistedSummaries.clear()

  await syncNotebookSessionFilesFromS3()
  const sessions = await PiSessionManager.list(process.cwd(), resolveNotebookSessionDir())
  for (const sessionInfo of sessions) {
    const manager = PiSessionManager.open(sessionInfo.path, resolveNotebookSessionDir(), process.cwd())
    // 只读概要：不跑 extractHistory，历史内容不进内存。
    const summary = buildSummaryFromSession(sessionInfo, manager, fallbackUser)
    if (summary) cacheSummary(summary)
  }
}

export const listPersistedNotebookSessionsByUser = (
  userId: string,
): NotebookSessionSummary[] => {
  const live = listNotebookSessionsByUser(userId).map(summarizeRecord)
  const merged = new Map<string, NotebookSessionSummary>()
  for (const item of persistedSummaries.values()) {
    if (item.userId !== userId) continue
    merged.set(item.sessionId, item)
  }
  for (const item of live) {
    merged.set(item.sessionId, item)
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

export const loadNotebookSessionRecord = async (
  sessionId: string,
): Promise<NotebookSessionRecord | null> => {
  const live = getNotebookSession(sessionId)
  if (live) return live
  // 已归档会话：按需从磁盘重建全量 record（跑 extractHistory），
  // 交给活跃 sessions Map 管理，归档时自然释放 —— 用完即弃。
  const summary = persistedSummaries.get(sessionId)
  if (!summary?.sessionFile || !existsSync(summary.sessionFile)) return null
  const manager = PiSessionManager.open(
    summary.sessionFile,
    resolveNotebookSessionDir(),
    process.cwd(),
  )
  const record = buildRecordFromSession(manager)
  if (!record) return null
  return upsertNotebookSession(record)
}

export const getPersistedNotebookSessionOwner = (sessionId: string): string | null =>
  persistedSummaries.get(sessionId)?.userId ?? getNotebookSession(sessionId)?.userId ?? null

export const deletePersistedNotebookSession = (sessionId: string): boolean => {
  persistedSummaries.delete(sessionId)
  return true
}

export const resetNotebookSessionPersistenceForTest = (): void => {
  persistedSummaries.clear()
  rehydrated = false
}

export const syncNotebookSessionFilesFromS3 = async (): Promise<void> => {
  const s3 = getS3Storage()
  if (!s3) return
  const dir = ensureNotebookSessionDir()
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
    // non-fatal
  }
}

export const syncNotebookSessionFileToS3 = async (sessionFile: string): Promise<void> => {
  const s3 = getS3Storage()
  if (!s3 || !sessionFile || !existsSync(sessionFile)) return
  try {
    const filename = sessionFile.split(/[\\/]/).pop()
    if (!filename) return
    const content = readFileSync(sessionFile, 'utf-8')
    await s3.putObject(`${S3_KEY_PREFIX}${filename}`, content)
  } catch {
    // non-fatal
  }
}

export const syncAllNotebookSessionFilesToS3 = async (): Promise<void> => {
  const s3 = getS3Storage()
  const dir = resolveNotebookSessionDir()
  if (!s3 || !existsSync(dir)) return
  try {
    const files = readdirSync(dir).filter((item) => item.endsWith('.jsonl'))
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8')
      await s3.putObject(`${S3_KEY_PREFIX}${file}`, content)
    }
  } catch {
    // non-fatal
  }
}

export const deleteNotebookSessionFileFromPersistence = async (
  sessionFile?: string,
): Promise<void> => {
  if (!sessionFile) return
  const s3 = getS3Storage()
  if (!s3) return
  try {
    const filename = sessionFile.split(/[\\/]/).pop()
    if (!filename) return
    await s3.deleteObject(`${S3_KEY_PREFIX}${filename}`)
  } catch {
    // non-fatal
  }
}
