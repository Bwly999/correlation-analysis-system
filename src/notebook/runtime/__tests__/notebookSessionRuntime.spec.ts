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
  workerHostStateHolder,
} = vi.hoisted(() => ({
  workerHostInitMock: vi.fn(),
  workerHostSnapshotFsMock: vi.fn(),
  workerHostWriteFsMock: vi.fn(),
  workerHostExecMock: vi.fn(),
  workerHostHardKillMock: vi.fn(),
  createParentBridgeClientMock: vi.fn(),
  streamNotebookAgentEventsMock: vi.fn(),
  fetchNotebookSessionHistoryMock: vi.fn(),
  // vi.hoisted 内不能引用 reactive（提升阶段 vue import 尚未初始化），
  // 故先用裸容器占位；vi.mock 工厂内 importActual('vue') 后填入真正的 reactive 对象。
  workerHostStateHolder: {} as { value: Record<string, unknown> },
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

vi.mock('../workerHost', async () => {
  const { reactive } = await vi.importActual<typeof import('vue')>('vue')
  // 用 reactive 让 watch(() => workerHost.state.memoryMb) 生效，贴近真实 WorkerHost。
  // status: 'ready' 用于 A1/B 回归测试驱动 resetPythonState 降级分支。
  workerHostStateHolder.value = reactive({
    bootStage: '',
    bootStageDetail: '',
    status: 'ready',
    memoryMb: 0,
  })
  return {
    WorkerHost: class {
      state = workerHostStateHolder.value
      init = workerHostInitMock.mockResolvedValue(undefined)
      snapshotFs = workerHostSnapshotFsMock.mockResolvedValue([])
      writeFs = workerHostWriteFsMock.mockResolvedValue(undefined)
      exec = workerHostExecMock.mockResolvedValue({ ok: true })
      hardKill = workerHostHardKillMock
      interrupt = vi.fn()
      isBusy = vi.fn(() => false)
      onAutoRestarted = null
    },
  }
})

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
    // 每个 case 起点重置 workerHost state（含 memoryMb）
    workerHostStateHolder.value.memoryMb = 0
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

  it('Bug A1 回归：resetPythonState 的 exec 超时/失败时降级 hardKill + init', async () => {
    // 复现：用户退出后 worker 已 ready，点空白笔记本走 switchSession，
    // resetPythonState 的 exec 触发 22.5s 硬超时（C 扩展里软中断失效），
    // 返回 { ok:false, errorType:'timeout' }。修复前这里不 throw，
    // switchSession 继续在已被 terminate / 正在 autoRestart 的 worker 上操作 → 卡 mount_fs。
    workerHostExecMock.mockResolvedValue({ ok: false, errorType: 'timeout' })
    workerHostHardKillMock.mockImplementation(function (this: unknown) {
      // hardKill 后 worker 进入重建，status 先变 booting
      return undefined
    })

    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()
    // connect 后重新覆盖（connect 不调 exec，这里确保 switchSession 时仍是 false）
    workerHostExecMock.mockResolvedValue({ ok: false, errorType: 'timeout' })
    workerHostInitMock.mockClear()

    await runtime.switchSession('sess-2')

    // 关键断言：exec 失败必须触发降级（hardKill + 重新 init）
    expect(workerHostHardKillMock).toHaveBeenCalled()
    expect(workerHostInitMock).toHaveBeenCalledWith('/pyodide/v0.27/')
    // 最终 phase 应推进到 ready，而不是永久卡在 mount_fs
    expect(runtime.state.session.phase.kind).toBe('ready')
  })

  it('Bug B 回归：并发 switchSession 串行化，不会交叉抢占', async () => {
    // 复现：第一个 switchSession 还在跑（resetPythonState 慢），第二个 switchSession 进来。
    // 修复前两者并发抢 workerHost / state，导致"取消后再点继续上次分析也进不去"。
    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    // 第一个 switchSession 挂起（exec 不 resolve，模拟 resetPythonState 慢）
    let resolveFirst: (v: { ok: boolean }) => void = () => undefined
    workerHostExecMock.mockReturnValue(
      new Promise((r) => {
        resolveFirst = r
      }),
    )

    const first = runtime.switchSession('sess-blank')
    const second = runtime.switchSession('sess-resume')
    // 让微任务跑起来，first 进入 await，second 进入串行队列
    await Promise.resolve()
    await Promise.resolve()

    // 放行第一个的 exec → 第一个完成 → 第二个才开始
    resolveFirst({ ok: true })
    await first

    // 第二个此刻应仍在等待第一个完成（串行），未到 ready
    // 第二个的 resetPythonState 也用同一个 mock，再次挂起
    let resolveSecond: (v: { ok: boolean }) => void = () => undefined
    workerHostExecMock.mockReturnValue(
      new Promise((r) => {
        resolveSecond = r
      }),
    )
    await Promise.resolve()
    await Promise.resolve()

    // 第二个完成后 phase 才 ready，且 sessionId 是后到的 sess-resume
    resolveSecond({ ok: true })
    await second
    expect(runtime.state.session.sessionId).toBe('sess-resume')
    expect(runtime.state.session.phase.kind).toBe('ready')

    runtime.dispose()
  })

  describe('状态条 agentSeconds 计时', () => {
    it('isRunning=true 期间 agentSeconds 每秒累加', async () => {
      vi.useFakeTimers()
      try {
        const runtime = await createNotebookSessionRuntime('sess-1')
        await runtime.connect()

        expect(runtime.state.session.runtime.agentSeconds).toBe(0)
        // 模拟 Agent 进入 running（真实链路由 session.status 事件驱动）
        runtime.state.session.runtime.isRunning = true

        await vi.advanceTimersByTimeAsync(3000)
        expect(runtime.state.session.runtime.agentSeconds).toBeGreaterThanOrEqual(3)

        runtime.dispose()
      } finally {
        vi.useRealTimers()
      }
    })

    it('isRunning=false 时停止累加', async () => {
      vi.useFakeTimers()
      try {
        const runtime = await createNotebookSessionRuntime('sess-1')
        await runtime.connect()

        runtime.state.session.runtime.isRunning = true
        await vi.advanceTimersByTimeAsync(2000)
        const beforeStop = runtime.state.session.runtime.agentSeconds
        expect(beforeStop).toBeGreaterThanOrEqual(2)

        runtime.state.session.runtime.isRunning = false
        await vi.advanceTimersByTimeAsync(5000)
        // 停止后不再累加
        expect(runtime.state.session.runtime.agentSeconds).toBe(beforeStop)

        runtime.dispose()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('状态条 memoryMb 同步', () => {
    it('workerHost.state.memoryMb 变化时同步到 session.runtime.memoryMb', async () => {
      const runtime = await createNotebookSessionRuntime('sess-1')
      await runtime.connect()

      expect(runtime.state.session.runtime.memoryMb).toBe(0)
      workerHostStateHolder.value.memoryMb = 123.4
      await new Promise((r) => setTimeout(r, 0)) // flush reactivity
      expect(runtime.state.session.runtime.memoryMb).toBeCloseTo(123.4, 1)

      runtime.dispose()
    })
  })
})
