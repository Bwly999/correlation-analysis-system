import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  workerHostInitMock,
  workerHostSnapshotFsMock,
  workerHostWriteFsMock,
  workerHostExecMock,
  workerHostHardKillMock,
  createParentBridgeClientMock,
  streamNotebookAgentEventsMock,
  fetchNotebookSessionHistoryMock,
} = vi.hoisted(() => ({
  workerHostInitMock: vi.fn(),
  workerHostSnapshotFsMock: vi.fn(),
  workerHostWriteFsMock: vi.fn(),
  workerHostExecMock: vi.fn(),
  workerHostHardKillMock: vi.fn(),
  createParentBridgeClientMock: vi.fn(),
  streamNotebookAgentEventsMock: vi.fn(),
  fetchNotebookSessionHistoryMock: vi.fn(),
}))

vi.mock('../../shared/opfsAccess', async () => {
  const actual = await vi.importActual<typeof import('../../shared/opfsAccess')>('../../shared/opfsAccess')
  return {
    ...actual,
    ensureWorkspaceTree: vi.fn().mockResolvedValue(undefined),
    listDirectoryEntries: vi.fn().mockResolvedValue([]),
    readBytes: vi.fn().mockResolvedValue(new Uint8Array()),
    writeFile: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../workerHost', () => ({
  WorkerHost: class {
    state = { bootStage: '', bootStageDetail: '' }
    init = workerHostInitMock.mockResolvedValue(undefined)
    snapshotFs = workerHostSnapshotFsMock.mockResolvedValue([])
    writeFs = workerHostWriteFsMock.mockResolvedValue(undefined)
    exec = workerHostExecMock.mockResolvedValue({ ok: true })
    hardKill = workerHostHardKillMock
    interrupt = vi.fn()
    isBusy = vi.fn(() => false)
    onAutoRestarted = null
  },
}))

vi.mock('../parentBridgeClient', () => ({
  createParentBridgeClient: createParentBridgeClientMock,
}))

vi.mock('../notebookAgentClient', async () => {
  const actual = await vi.importActual<typeof import('../notebookAgentClient')>('../notebookAgentClient')
  return {
    ...actual,
    streamNotebookAgentEvents: streamNotebookAgentEventsMock,
    fetchNotebookSessionHistory: fetchNotebookSessionHistoryMock,
    reportNotebookAuditEntries: vi.fn().mockResolvedValue(undefined),
    notifyNotebookEnvironmentChanged: vi.fn().mockResolvedValue(undefined),
    resolveNotebookAgentToolResult: vi.fn().mockResolvedValue({ ok: true }),
    sendNotebookAgentMessage: vi.fn().mockResolvedValue({ ok: true }),
    abortNotebookAgentSession: vi.fn().mockResolvedValue({ ok: true }),
    compactNotebookAgentSession: vi.fn().mockResolvedValue({ ok: true }),
    renameNotebookSession: vi.fn().mockResolvedValue({ ok: true }),
  }
})

import { createNotebookSessionRuntime } from '../notebookSessionRuntime'

describe('notebookSessionRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({
          getDirectoryHandle: vi.fn().mockResolvedValue({}),
        }),
      },
    })

    fetchNotebookSessionHistoryMock.mockImplementation(async (sessionId: string) => ({
      sessionId,
      title: sessionId === 'sess-2' ? '新分析' : '当前分析',
      status: 'idle',
      messages: [],
      toolCalls: [],
      createdAt: 1,
      updatedAt: 1,
    }))

    createParentBridgeClientMock.mockReturnValue({
      dispose: vi.fn(),
      notifyWorkspaceChanged: vi.fn(),
      requestParentClose: vi.fn(),
      sendSessionState: vi.fn(),
    })

    streamNotebookAgentEventsMock.mockImplementation(
      async (_sessionId: string, options: { onOpen?: () => void; signal?: AbortSignal }) => {
        options.onOpen?.()
        await new Promise<void>((resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      },
    )
  })

  it('切换 session 时，主动中断旧事件流不会把 phase 置为 failed', async () => {
    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    const switching = runtime.switchSession('sess-2')
    await Promise.resolve()
    await Promise.resolve()

    expect(runtime.state.session.phase.kind).not.toBe('failed')

    await switching
    expect(runtime.state.session.phase.kind).toBe('ready')
    expect(runtime.state.session.sessionId).toBe('sess-2')
  })
})
