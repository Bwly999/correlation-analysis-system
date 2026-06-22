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
  messages?: NotebookMessage[]
  toolCalls?: NotebookToolCall[]
  bootstrapPromptedAt?: number
  archivedAt?: number
  initialDataMeta?: ImportCsvMeta
  createdAt?: number
  updatedAt?: number
  sessionFile?: string
}

type NotebookSessionSummary = {
  sessionId: string
  title: string
  initialDataMeta?: ImportCsvMeta
  status: NotebookSessionStatus
  archivedAt?: number
  createdAt: number
  updatedAt: number
  messageCount: number
  lastUserMessagePreview?: string
}

const persistedSessions = new Map<string, NotebookSessionRecord>()
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

const extractHistory = (entries: SessionEntry[]): {
  messages: NotebookMessage[]
  toolCalls: NotebookToolCall[]
} => {
  const messages: NotebookMessage[] = []
  const toolCalls: NotebookToolCall[] = []
  let currentAssistantId = ''
  let currentAssistantText = ''

  for (const entry of entries) {
    if (entry.type === 'message') {
      const message = entry.message as {
        role?: string
        content?: string | Array<{ type?: string; text?: string }>
        timestamp?: number
      }
      if (message.role === 'user') {
        const content = typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content
              .filter((part) => part?.type === 'text')
              .map((part) => part?.text ?? '')
              .join('')
            : ''
        messages.push({
          id: entry.id,
          role: 'user',
          content,
          rawContent: content,
          status: 'completed',
          createdAt: typeof message.timestamp === 'number'
            ? message.timestamp
            : new Date(entry.timestamp).getTime(),
        })
        continue
      }
      if (message.role === 'assistant') {
        currentAssistantId = entry.id
        currentAssistantText = typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content
              .filter((part) => part?.type === 'text')
              .map((part) => part?.text ?? '')
              .join('')
            : ''
        messages.push({
          id: currentAssistantId,
          role: 'assistant',
          content: currentAssistantText,
          rawContent: currentAssistantText,
          status: 'completed',
          createdAt: typeof message.timestamp === 'number'
            ? message.timestamp
            : new Date(entry.timestamp).getTime(),
        })
        continue
      }
    }
    if (entry.type !== 'custom_message') continue
    if (entry.customType === 'tool_call' && entry.details && typeof entry.details === 'object') {
      const details = entry.details as Record<string, unknown>
      toolCalls.push({
        id: typeof details.toolCallId === 'string' ? details.toolCallId : entry.id,
        toolName: typeof details.toolName === 'string' ? details.toolName : 'unknown',
        args: details.args,
        status: 'running',
        startedAt: new Date(entry.timestamp).getTime(),
      })
      continue
    }
    if (entry.customType === 'tool_result' && entry.details && typeof entry.details === 'object') {
      const details = entry.details as Record<string, unknown>
      const toolCallId = typeof details.toolCallId === 'string' ? details.toolCallId : ''
      const toolCall = toolCalls.find((item) => item.id === toolCallId)
      if (!toolCall) continue
      toolCall.status = details.isError ? 'failed' : 'success'
      toolCall.isError = Boolean(details.isError)
      toolCall.finishedAt = new Date(entry.timestamp).getTime()
      toolCall.result = typeof details.result === 'string'
        ? details.result
        : typeof entry.content === 'string'
          ? entry.content
          : JSON.stringify(details.result ?? details, null, 2)
      continue
    }
    if (entry.customType === 'assistant_message' && currentAssistantId) {
      const message = messages.find((item) => item.id === currentAssistantId && item.role === 'assistant')
      if (!message) continue
      const content = typeof entry.content === 'string'
        ? entry.content
        : Array.isArray(entry.content)
          ? entry.content
            .filter((part) => part?.type === 'text')
            .map((part) => part?.text ?? '')
            .join('')
          : currentAssistantText
      message.content = content
      message.rawContent = content
    }
  }

  return { messages, toolCalls }
}

const summarizeRecord = (record: NotebookSessionRecord): NotebookSessionSummary => {
  const lastUserMsg = [...record.messages].reverse().find((item) => item.role === 'user')
  return {
    sessionId: record.sessionId,
    title: record.title,
    initialDataMeta: record.initialDataMeta,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
    lastUserMessagePreview: lastUserMsg?.content.slice(0, 60),
  }
}

const buildRecordFromSession = (
  sessionInfo: SessionInfo,
  sessionManager: Pick<SessionManager, 'getEntries' | 'getSessionName' | 'getSessionFile'>,
  fallbackUser?: ServerStorageUser,
): NotebookSessionRecord | null => {
  const entries = sessionManager.getEntries()
  const meta = extractNotebookMeta(entries)
  if (!meta) return null

  const userId = meta.userId ?? fallbackUser?.id
  if (!userId) return null

  const { messages, toolCalls } = extractHistory(entries)
  const restoredMessages = Array.isArray(meta.messages) ? meta.messages : messages
  const restoredToolCalls = Array.isArray(meta.toolCalls) ? meta.toolCalls : toolCalls
  const createdAt = meta.createdAt ?? sessionInfo.created.getTime()
  const updatedAt = meta.updatedAt ?? sessionInfo.modified.getTime()
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
    messages: restoredMessages,
    toolCalls: restoredToolCalls,
    createdAt,
    updatedAt,
    archivedAt: meta.archivedAt,
  }
}

const cacheRecord = (record: NotebookSessionRecord) => {
  persistedSessions.set(record.sessionId, record)
  persistedSummaries.set(record.sessionId, summarizeRecord(record))
  upsertNotebookSession(record)
}

export const persistNotebookSessionMeta = (
  sessionManager: Pick<SessionManager, 'appendCustomEntry' | 'getSessionFile'>,
  record: NotebookSessionRecord,
): void => {
  const payload: NotebookPersistedMeta = {
    kind: NOTEBOOK_SESSION_KIND,
    sessionId: record.sessionId,
    userId: record.userId,
    origin: record.origin,
    title: record.title,
    status: record.status,
    dataReady: record.dataReady,
    messages: record.messages,
    toolCalls: record.toolCalls,
    bootstrapPromptedAt: record.bootstrapPromptedAt,
    archivedAt: record.archivedAt,
    initialDataMeta: record.initialDataMeta,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sessionFile: record.sessionFile ?? sessionManager.getSessionFile?.(),
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
  persistedSessions.clear()
  persistedSummaries.clear()

  await syncNotebookSessionFilesFromS3()
  const sessions = await PiSessionManager.list(process.cwd(), resolveNotebookSessionDir())
  for (const sessionInfo of sessions) {
    const manager = PiSessionManager.open(sessionInfo.path, resolveNotebookSessionDir(), process.cwd())
    const record = buildRecordFromSession(sessionInfo, manager, fallbackUser)
    if (!record) continue
    cacheRecord(record)
  }
}

export const listPersistedNotebookSessionsByUser = (
  userId: string,
): NotebookSessionSummary[] => {
  const live = listNotebookSessionsByUser(userId).map(summarizeRecord)
  const merged = new Map<string, NotebookSessionSummary>()
  for (const item of persistedSummaries.values()) {
    if (persistedSessions.get(item.sessionId)?.userId !== userId) continue
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
  const persisted = persistedSessions.get(sessionId)
  if (!persisted) return null
  return upsertNotebookSession({ ...persisted })
}

export const getPersistedNotebookSessionOwner = (sessionId: string): string | null =>
  persistedSessions.get(sessionId)?.userId ?? getNotebookSession(sessionId)?.userId ?? null

export const deletePersistedNotebookSession = (sessionId: string): boolean => {
  persistedSessions.delete(sessionId)
  persistedSummaries.delete(sessionId)
  return true
}

export const resetNotebookSessionPersistenceForTest = (): void => {
  persistedSessions.clear()
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
