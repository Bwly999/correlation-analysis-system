// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEntry } from '@earendil-works/pi-coding-agent'

const {
  sessionManagerListMock,
  sessionManagerOpenMock,
  syncSessionFilesFromS3Mock,
} = vi.hoisted(() => ({
  sessionManagerListMock: vi.fn(),
  sessionManagerOpenMock: vi.fn(),
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
import { __resetNotebookSessionsForTest } from '../sessionStore.js'

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
    sessionManagerOpenMock.mockReturnValueOnce(
      buildManager({
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
  })
})
