// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEntry } from '@earendil-works/pi-coding-agent'

const {
  sessionManagerListMock,
  sessionManagerOpenMock,
  existsSyncMock,
  syncSessionFilesFromS3Mock,
} = vi.hoisted(() => ({
  sessionManagerListMock: vi.fn(),
  sessionManagerOpenMock: vi.fn(),
  existsSyncMock: vi.fn(),
  syncSessionFilesFromS3Mock: vi.fn(),
}))

vi.mock('@earendil-works/pi-coding-agent', async () => {
  const actual = await vi.importActual<typeof import('@earendil-works/pi-coding-agent')>(
    '@earendil-works/pi-coding-agent',
  )
  return {
    ...actual,
    SessionManager: {
      ...actual.SessionManager,
      list: sessionManagerListMock,
      open: sessionManagerOpenMock,
    },
  }
})

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: existsSyncMock,
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

describe('notebook sessionPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetNotebookSessionsForTest()
    resetNotebookSessionPersistenceForTest()
    syncSessionFilesFromS3Mock.mockResolvedValue(undefined)
    // 默认认为 session 文件存在；按需重建路径需要文件可访问。
    existsSyncMock.mockReturnValue(true)
  })

  it('rehydrate 后按用户列出 notebook 会话并保留标题/归档态', async () => {
    sessionManagerListMock.mockResolvedValueOnce([
      {
        path: '/tmp/sess-1.jsonl',
        id: 'sdk-1',
        cwd: process.cwd(),
        created: new Date('2026-06-22T10:00:00.000Z'),
        modified: new Date('2026-06-22T11:00:00.000Z'),
        messageCount: 3,
        firstMessage: '先看销量',
        allMessagesText: '先看销量 请分析',
      },
    ])
    sessionManagerOpenMock.mockReturnValueOnce(
      buildManager({
        sessionFile: '/tmp/sess-1.jsonl',
        sessionName: '销量分析',
        entries: [
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
              status: 'completed',
              dataReady: true,
              archivedAt: 1719054000000,
              initialDataMeta: {
                sourceKind: 'canvas-node',
                sourceLabel: '清洗-Q2',
                rowCount: 100,
                columnCount: 4,
              },
            },
          },
        ],
      }),
    )

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
    sessionManagerListMock.mockResolvedValueOnce([
      {
        path: '/tmp/sess-legacy.jsonl',
        id: 'sdk-legacy',
        cwd: process.cwd(),
        created: new Date('2026-06-22T10:00:00.000Z'),
        modified: new Date('2026-06-22T10:30:00.000Z'),
        messageCount: 1,
        firstMessage: '旧会话',
        allMessagesText: '旧会话',
      },
    ])
    sessionManagerOpenMock.mockReturnValueOnce(
      buildManager({
        sessionFile: '/tmp/sess-legacy.jsonl',
        sessionName: '旧分析',
        entries: [
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
        ],
      }),
    )

    await ensureNotebookSessionsRehydrated({ id: 'default-user', name: '默认用户' })

    const list = listPersistedNotebookSessionsByUser('default-user')
    expect(list).toHaveLength(1)
    expect(list[0]?.sessionId).toBe('legacy-session-1')
  })

  it('loadNotebookSessionRecord 会把持久层会话注入内存镜像', async () => {
    sessionManagerListMock.mockResolvedValueOnce([
      {
        path: '/tmp/sess-2.jsonl',
        id: 'sdk-2',
        cwd: process.cwd(),
        created: new Date('2026-06-22T10:00:00.000Z'),
        modified: new Date('2026-06-22T10:45:00.000Z'),
        messageCount: 2,
        firstMessage: '继续分析',
        allMessagesText: '继续分析',
      },
    ])
    const manager = buildManager({
      sessionFile: '/tmp/sess-2.jsonl',
      sessionName: '继续分析',
      entries: [
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
      ],
    })
    // rehydrate（读 summary）与 load（按需重建全量）都会 open 同一文件
    sessionManagerOpenMock.mockReturnValue(manager)

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
    sessionManagerListMock.mockResolvedValueOnce([
      {
        path: '/tmp/sess-native.jsonl',
        id: 'sdk-native',
        cwd: process.cwd(),
        created: new Date('2026-06-22T10:00:00.000Z'),
        modified: new Date('2026-06-22T10:30:00.000Z'),
        messageCount: 3,
        firstMessage: '读一下数据',
        allMessagesText: '读一下数据',
      },
    ])
    // rehydrate（只读 summary）与 load（按需重建全量 history）都会 open 同一文件
    sessionManagerOpenMock.mockReturnValue(
      buildManager({
        sessionFile: '/tmp/sess-native.jsonl',
        sessionName: '原生回放',
        entries: [
          {
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
          },
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
        ],
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
    sessionManagerListMock.mockResolvedValueOnce([
      {
        path: '/tmp/sess-lazy.jsonl',
        id: 'sdk-lazy',
        cwd: process.cwd(),
        created: new Date('2026-06-22T10:00:00.000Z'),
        modified: new Date('2026-06-22T10:30:00.000Z'),
        messageCount: 1,
        firstMessage: '懒加载',
        allMessagesText: '懒加载',
      },
    ])
    const getEntries = vi.fn(() => [
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
    ])
    sessionManagerOpenMock.mockReturnValue({
      getSessionFile: () => '/tmp/sess-lazy.jsonl',
      getSessionName: () => '懒加载',
      getEntries,
    })

    await ensureNotebookSessionsRehydrated()
    // rehydrate 后：会话不在活跃内存镜像（全量 history 未加载）
    expect(getNotebookSession('lazy-session-1')).toBeUndefined()
    // 列表概要可读（messageCount 来自 meta，非解析 history）
    const list = listPersistedNotebookSessionsByUser('u-1')
    expect(list[0]?.messageCount).toBe(5)

    // load 时才按需 open + 解析全量 history（第二次 open 调用）
    const beforeOpenCalls = sessionManagerOpenMock.mock.calls.length
    const record = await loadNotebookSessionRecord('lazy-session-1')
    expect(sessionManagerOpenMock.mock.calls.length).toBeGreaterThan(beforeOpenCalls)
    expect(record?.sessionId).toBe('lazy-session-1')
    // load 后进入活跃内存镜像
    expect(getNotebookSession('lazy-session-1')).toBeDefined()
  })

  it('旧 JSONL 的 meta 缺 messageCount 时列表概要兜底为 0', async () => {
    sessionManagerListMock.mockResolvedValueOnce([
      {
        path: '/tmp/sess-old.jsonl',
        id: 'sdk-old',
        cwd: process.cwd(),
        created: new Date('2026-06-22T10:00:00.000Z'),
        modified: new Date('2026-06-22T10:30:00.000Z'),
        messageCount: 1,
        firstMessage: '旧文件',
        allMessagesText: '旧文件',
      },
    ])
    sessionManagerOpenMock.mockReturnValue(
      buildManager({
        sessionFile: '/tmp/sess-old.jsonl',
        sessionName: '旧文件',
        entries: [
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
        ],
      }),
    )

    await ensureNotebookSessionsRehydrated()
    const list = listPersistedNotebookSessionsByUser('u-1')
    expect(list).toHaveLength(1)
    expect(list[0]?.messageCount).toBe(0)
    expect(list[0]?.lastUserMessagePreview).toBeUndefined()
  })
})
