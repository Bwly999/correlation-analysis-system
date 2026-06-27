// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEntry } from '@earendil-works/pi-coding-agent'

const {
  readdirSyncMock,
  readFileSyncMock,
  existsSyncMock,
  statSyncMock,
  syncSessionFilesFromS3Mock,
  sessionManagerOpenMock,
} = vi.hoisted(() => ({
  readdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
  syncSessionFilesFromS3Mock: vi.fn(),
  sessionManagerOpenMock: vi.fn(),
}))

// rehydrate 不再走 SessionManager.list/open + getEntries 全量解析，
// 改为 readdirSync + readFileSync 尾读 meta；list 不再需要 mock。
// open 仍由 loadNotebookSessionRecord 按需调用，保留 mock。
vi.mock('@earendil-works/pi-coding-agent', async () => {
  const actual = await vi.importActual<typeof import('@earendil-works/pi-coding-agent')>(
    '@earendil-works/pi-coding-agent',
  )
  return {
    ...actual,
    SessionManager: {
      ...actual.SessionManager,
      open: sessionManagerOpenMock,
    },
  }
})

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: existsSyncMock,
    readdirSync: readdirSyncMock,
    readFileSync: readFileSyncMock,
    statSync: statSyncMock,
  }
})

vi.mock('../gateway.js', () => ({
  syncNotebookSessionFilesFromS3: syncSessionFilesFromS3Mock,
}))

import {
  ensureNotebookSessionsRehydrated,
  listPersistedNotebookSessionsByUser,
  loadNotebookSessionRecord,
  persistNotebookSessionMeta,
  resetNotebookSessionPersistenceForTest,
} from '../sessionPersistence.js'
import { __resetNotebookSessionsForTest, getNotebookSession } from '../sessionStore.js'

const buildManager = (options: {
  sessionFile: string
  sessionName?: string
  entries?: SessionEntry[]
}) => ({
  getSessionFile: () => options.sessionFile,
  getSessionName: () => options.sessionName,
  getEntries: () => options.entries ?? [],
})

// 把 entries 序列化成 jsonl 文本（rehydrate 走 readFileSync 尾读 meta 用）
const stringifyEntries = (entries: SessionEntry[]): string =>
  entries.map((entry) => JSON.stringify(entry)).join('\n')

const CREATED = Date.parse('2026-06-22T10:00:00.000Z')
const MODIFIED = Date.parse('2026-06-22T11:00:00.000Z')

// 配置一个 session 文件供 rehydrate 尾读：readdir 返回文件名，readFileSync 返回 jsonl。
const mockSessionFile = (fileName: string, entries: SessionEntry[]) => {
  readdirSyncMock.mockReturnValueOnce([fileName])
  readFileSyncMock.mockImplementationOnce((p: unknown) =>
    String(p).endsWith(fileName) ? stringifyEntries(entries) : undefined,
  )
}

describe('notebook sessionPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetNotebookSessionsForTest()
    resetNotebookSessionPersistenceForTest()
    syncSessionFilesFromS3Mock.mockResolvedValue(undefined)
    // 默认认为 session 文件存在；按需重建路径需要文件可访问。
    existsSyncMock.mockReturnValue(true)
    readdirSyncMock.mockReturnValue([])
    statSyncMock.mockReturnValue({ birthtimeMs: CREATED, mtimeMs: MODIFIED })
    readFileSyncMock.mockImplementation(() => {
      throw new Error('readFileSync not configured for this test')
    })
  })

  it('rehydrate 后按用户列出 notebook 会话并保留标题/归档态', async () => {
    mockSessionFile('sess-1.jsonl', [
      {
        type: 'custom',
        id: 'entry-1',
        parentId: null,
        timestamp: '2026-06-22T10:00:00.000Z',
        customType: 'notebook-session-meta',
        data: {
          kind: 'notebook-agent-session',
          sessionId: 'notebook-session-1',
          userId: 'u-1',
          origin: 'http://localhost:5173',
          title: '销量分析',
          status: 'completed',
          dataReady: true,
          createdAt: CREATED,
          updatedAt: MODIFIED,
          archivedAt: 1719054000000,
          initialDataMeta: {
            sourceKind: 'canvas-node',
            sourceLabel: '清洗-Q2',
            rowCount: 100,
            columnCount: 4,
          },
        },
      },
    ])

    await ensureNotebookSessionsRehydrated()

    const list = listPersistedNotebookSessionsByUser('u-1')
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(
      expect.objectContaining({
        sessionId: 'notebook-session-1',
        title: '销量分析',
        archivedAt: 1719054000000,
        status: 'completed',
      }),
    )
  })

  it('旧 JSONL 缺失 owner 时按默认用户接管', async () => {
    mockSessionFile('sess-legacy.jsonl', [
      {
        type: 'custom',
        id: 'entry-legacy',
        parentId: null,
        timestamp: '2026-06-22T10:00:00.000Z',
        customType: 'notebook-session-meta',
        data: {
          kind: 'notebook-agent-session',
          sessionId: 'legacy-session-1',
          origin: 'http://localhost:5173',
          status: 'idle',
          dataReady: false,
        },
      },
    ])

    await ensureNotebookSessionsRehydrated({ id: 'default-user', name: '默认用户' })

    const list = listPersistedNotebookSessionsByUser('default-user')
    expect(list).toHaveLength(1)
    expect(list[0]?.sessionId).toBe('legacy-session-1')
  })

  it('loadNotebookSessionRecord 会把持久层会话注入内存镜像', async () => {
    const entries: SessionEntry[] = [
      {
        type: 'custom',
        id: 'entry-2',
        parentId: null,
        timestamp: '2026-06-22T10:00:00.000Z',
        customType: 'notebook-session-meta',
        data: {
          kind: 'notebook-agent-session',
          sessionId: 'notebook-session-2',
          userId: 'u-2',
          origin: 'http://localhost:5173',
          status: 'idle',
          dataReady: false,
        },
      },
    ]
    // rehydrate 走 readFileSync 尾读 meta；load 走 open + getEntries 重建全量
    mockSessionFile('sess-2.jsonl', entries)
    sessionManagerOpenMock.mockReturnValue(
      buildManager({
        sessionFile: '/tmp/sess-2.jsonl',
        sessionName: '继续分析',
        entries,
      }),
    )

    await ensureNotebookSessionsRehydrated()
    const record = await loadNotebookSessionRecord('notebook-session-2')
    expect(record).toEqual(
      expect.objectContaining({
        sessionId: 'notebook-session-2',
        userId: 'u-2',
        title: '继续分析',
      }),
    )
  })

  it('persistNotebookSessionMeta 会将最新业务元数据追加到 SessionManager', async () => {
    const appendCustomEntry = vi.fn()
    const manager = {
      appendCustomEntry,
      getSessionFile: () => '/tmp/sess-meta.jsonl',
    }

    persistNotebookSessionMeta(manager as never, {
      sessionId: 'notebook-session-meta',
      userId: 'u-1',
      origin: 'http://localhost:5173',
      title: '数据分析',
      status: 'idle',
      dataReady: false,
      createdAt: 1,
      updatedAt: 2,
      messages: [],
      toolCalls: [],
    })

    expect(appendCustomEntry).toHaveBeenCalledWith(
      'notebook-session-meta',
      expect.objectContaining({
        kind: 'notebook-agent-session',
        sessionId: 'notebook-session-meta',
        userId: 'u-1',
      }),
    )
    // meta payload 只存轻量业务元数据：不得再内嵌全量 messages / toolCalls
    // （它们已由 SDK 原生 entry 增量持久化，内嵌会导致每行重复序列化 → 文件 O(N²) 膨胀）。
    const payload = appendCustomEntry.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('messages')
    expect(payload).not.toHaveProperty('toolCalls')
  })

  it('load 时按需从 SDK 原生 message entry 重建 messages 与 toolCalls（含工具结果）', async () => {
    const metaEntry: SessionEntry = {
      type: 'custom',
      id: 'entry-meta',
      parentId: null,
      timestamp: '2026-06-22T10:00:00.000Z',
      customType: 'notebook-session-meta',
      data: {
        kind: 'notebook-agent-session',
        sessionId: 'native-session-1',
        userId: 'u-1',
        origin: 'http://localhost:5173',
        status: 'completed',
        dataReady: true,
      },
    }
    const entries: SessionEntry[] = [
      metaEntry,
      {
        type: 'message',
        id: 'msg-user',
        parentId: 'entry-meta',
        timestamp: '2026-06-22T10:00:05.000Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '读一下数据' }],
        } as never,
      },
      {
        type: 'message',
        id: 'msg-assistant',
        parentId: 'msg-user',
        timestamp: '2026-06-22T10:00:10.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '我来读取文件。' },
            {
              type: 'toolCall',
              id: 'call_00_abc',
              name: 'fs_read',
              arguments: { path: 'inputs/upstream.csv' },
            },
          ],
        } as never,
      },
      {
        type: 'message',
        id: 'msg-toolresult',
        parentId: 'msg-assistant',
        timestamp: '2026-06-22T10:00:11.000Z',
        message: {
          role: 'toolResult',
          toolCallId: 'call_00_abc',
          toolName: 'fs_read',
          content: [{ type: 'text', text: 'col1,col2\n1,2' }],
          isError: false,
        } as never,
      },
    ]
    // rehydrate 只尾读 meta；load 走 open + getEntries 重建全量 history
    mockSessionFile('sess-native.jsonl', entries)
    sessionManagerOpenMock.mockReturnValue(
      buildManager({
        sessionFile: '/tmp/sess-native.jsonl',
        sessionName: '原生回放',
        entries,
      }),
    )

    await ensureNotebookSessionsRehydrated()
    const record = await loadNotebookSessionRecord('native-session-1')

    expect(record).not.toBeNull()
    expect(record!.messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: '读一下数据' },
      { role: 'assistant', content: '我来读取文件。' },
    ])
    expect(record!.toolCalls).toHaveLength(1)
    const toolCall = record!.toolCalls[0]!
    expect(toolCall).toEqual(
      expect.objectContaining({
        id: 'call_00_abc',
        toolName: 'fs_read',
        args: { path: 'inputs/upstream.csv' },
        status: 'success',
        isError: false,
        result: 'col1,col2\n1,2',
      }),
    )
  })

  it('rehydrate 只读概要：会话不进入活跃内存镜像，load 时才按需重建', async () => {
    const lazyEntries: SessionEntry[] = [
      {
        type: 'custom',
        id: 'entry-lazy',
        parentId: null,
        timestamp: '2026-06-22T10:00:00.000Z',
        customType: 'notebook-session-meta',
        data: {
          kind: 'notebook-agent-session',
          sessionId: 'lazy-session-1',
          userId: 'u-1',
          origin: 'http://localhost:5173',
          status: 'completed',
          dataReady: true,
          messageCount: 5,
        },
      },
    ]
    const getEntries = vi.fn(() => lazyEntries)
    mockSessionFile('sess-lazy.jsonl', lazyEntries)
    sessionManagerOpenMock.mockReturnValue({
      getSessionFile: () => '/tmp/sess-lazy.jsonl',
      getSessionName: () => '懒加载',
      getEntries,
    })

    await ensureNotebookSessionsRehydrated()
    // rehydrate 后：会话不在活跃内存镜像（全量 history 未加载，getEntries 未被调用）
    expect(getNotebookSession('lazy-session-1')).toBeUndefined()
    expect(getEntries).not.toHaveBeenCalled()
    // 列表概要可读（messageCount 来自 meta，非解析 history）
    const list = listPersistedNotebookSessionsByUser('u-1')
    expect(list[0]?.messageCount).toBe(5)

    // load 时才按需 open + 解析全量 history（首次 open 调用）
    const beforeOpenCalls = sessionManagerOpenMock.mock.calls.length
    const record = await loadNotebookSessionRecord('lazy-session-1')
    expect(sessionManagerOpenMock.mock.calls.length).toBeGreaterThan(beforeOpenCalls)
    expect(getEntries).toHaveBeenCalled()
    expect(record?.sessionId).toBe('lazy-session-1')
    // load 后进入活跃内存镜像
    expect(getNotebookSession('lazy-session-1')).toBeDefined()
  })

  it('旧 JSONL 的 meta 缺 messageCount 时列表概要兜底为 0', async () => {
    mockSessionFile('sess-old.jsonl', [
      {
        // 旧 meta：无 messageCount / lastUserMessagePreview 字段
        type: 'custom',
        id: 'entry-old',
        parentId: null,
        timestamp: '2026-06-22T10:00:00.000Z',
        customType: 'notebook-session-meta',
        data: {
          kind: 'notebook-agent-session',
          sessionId: 'old-session-1',
          userId: 'u-1',
          origin: 'http://localhost:5173',
          status: 'idle',
          dataReady: false,
        },
      },
    ])

    await ensureNotebookSessionsRehydrated()
    const list = listPersistedNotebookSessionsByUser('u-1')
    expect(list).toHaveLength(1)
    expect(list[0]?.messageCount).toBe(0)
    expect(list[0]?.lastUserMessagePreview).toBeUndefined()
  })

  it('并发 rehydrate 共用 in-flight Promise，不会因提前置位读到空 Map', async () => {
    // 复现 404 竞态：旧实现 rehydrated 在 await 前就置 true，并发调用会立刻返回
    // 并读到尚未回填的空 summaries。修复后并发调用应共用同一 in-flight Promise。
    let resolveSync!: () => void
    syncSessionFilesFromS3Mock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSync = resolve
      }),
    )
    mockSessionFile('sess-concurrent.jsonl', [
      {
        type: 'custom',
        id: 'entry-concurrent',
        parentId: null,
        timestamp: '2026-06-22T10:00:00.000Z',
        customType: 'notebook-session-meta',
        data: {
          kind: 'notebook-agent-session',
          sessionId: 'concurrent-session-1',
          userId: 'u-1',
          origin: 'http://localhost:5173',
          status: 'idle',
          dataReady: false,
        },
      },
    ])

    // 第一个触发 rehydrate，卡在 S3 sync；第二个并发进入
    const first = ensureNotebookSessionsRehydrated()
    const second = ensureNotebookSessionsRehydrated()
    // 共用同一 in-flight Promise（而非各自返回），避免并发读到空 summaries
    expect(second).toBe(first)
    // rehydrate 尚未完成，summaries 仍空
    expect(listPersistedNotebookSessionsByUser('u-1')).toHaveLength(0)

    resolveSync()
    await Promise.all([first, second])

    // 两个并发调用都等同一份 rehydrate 完成，summary 已回填
    expect(listPersistedNotebookSessionsByUser('u-1')).toHaveLength(1)
    expect(listPersistedNotebookSessionsByUser('u-1')[0]?.sessionId).toBe('concurrent-session-1')
  })
})
