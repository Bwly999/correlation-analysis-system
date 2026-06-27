import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listDirectoryEntries } from '../../shared/opfsAccess'

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
  requestMock,
  requestStreamMock,
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
  requestMock: vi.fn(),
  requestStreamMock: vi.fn(),
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

// notebookAgentClient 的 workspace 快照 helper（checkWorkspaceSnapshot /
// downloadWorkspaceSnapshot）走真实实现，内部依赖 httpClient.request。
// mock 掉 httpClient，让用例可控制 HEAD/GET 的返回（含永不 resolve 的 pending 场景）。
vi.mock('@/services/httpClient', () => ({
  httpClient: {
    request: requestMock,
  },
  requestStream: requestStreamMock,
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
  // 部分用例用 vi.useFakeTimers() 包住 connect/switchSession，若某个用例在
  // finally 之前抛错或被断言中断，fake timer 会泄漏到后续用例（表现为下一个
  // 依赖真实/伪造定时器的用例永久 pending）。这里兜底确保每个用例结束后都
  // 回到真实定时器，避免测试间相互污染。
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // 每个 case 起点重置 workerHost state（含 memoryMb / status）
    workerHostStateHolder.value.status = 'ready'
    workerHostStateHolder.value.bootStage = ''
    workerHostStateHolder.value.bootStageDetail = ''
    workerHostStateHolder.value.memoryMb = 0
    // workspace 快照探测默认返回 404（无快照）——用例需要 pending/200 时自行 mockImplementationOnce
    requestMock.mockResolvedValue({ status: 404, data: { message: 'not found' } })
    requestStreamMock.mockReset()
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

  it('Bug mount_fs 回归：writeFs 抛错时单文件被跳过，switchSession 仍能推进到 ready', async () => {
    // 复现：退出后再次「开新分析」走 switchSession，workerHost.writeFs 抛错（worker 卡死 / 未就绪）。
    // 修复前：错误冒泡到 sessionOpChain，phase 永远停在 mount_fs 60%，UI 卡死在 Loading。
    // 修复后（Fix A 超时 + Fix C 单文件跳过）：syncOpfsFilesToWorker 内 try/catch 吞掉单文件错误，
    //   流程继续推进到 ready —— 用户不再卡在 mount_fs。
    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    // 让 syncOpfsFilesToWorker 至少有一个文件可走 writeFs。
    // 用 mockResolvedValue（持久）：restoreWorkspaceIfEmpty 会先探测 inputs/scripts 目录，
    // 探测到非空即提前 return；随后 syncOpfsFilesToWorker 再读一次拿到同一文件调 writeFs。
    vi.mocked(listDirectoryEntries).mockResolvedValue([
      { name: 'upstream.csv', kind: 'file', size: 10, modifiedAt: 1 },
    ])
    workerHostWriteFsMock.mockRejectedValueOnce(new Error('Worker 未就绪'))

    await runtime.switchSession('sess-2')

    // 关键：不再卡在 loading/mount_fs，而是正常 ready
    expect(runtime.state.session.phase.kind).toBe('ready')
    expect(runtime.state.session.sessionId).toBe('sess-2')
    // writeFs 确实被调用过（错误被 Fix C 吞掉而非阻断）
    expect(workerHostWriteFsMock).toHaveBeenCalled()
    runtime.dispose()
  })

  it('Bug mount_fs 回归：连续两次 switchSession，第一次失败不拖死第二次', async () => {
    // 复现：sessionOpChain 旧实现里第一次 run() 抛错会 () => run() 重试或挂起，
    // 导致后续 switchSession 也进不去。修复后 run() 永不 reject（内部 try/catch），
    // 链不被拖死，第二次 switchSession 正常推进到 ready。
    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    // 第一次：writeFs 抛错 → 单文件跳过 → 仍 ready
    vi.mocked(listDirectoryEntries).mockResolvedValueOnce([
      { name: 'a.csv', kind: 'file', size: 1, modifiedAt: 1 },
    ])
    workerHostWriteFsMock.mockRejectedValueOnce(new Error('Worker 未就绪'))
    await runtime.switchSession('sess-fail')
    expect(runtime.state.session.phase.kind).toBe('ready')

    // 第二次：正常 → 应能推进到 ready，sessionId 更新，不被前一次拖死
    workerHostWriteFsMock.mockResolvedValue(undefined)
    await runtime.switchSession('sess-ok')
    expect(runtime.state.session.phase.kind).toBe('ready')
    expect(runtime.state.session.sessionId).toBe('sess-ok')
    runtime.dispose()
  })

  it('connect 中 workerHost.init 失败时 phase 置为 failed 而非永久 loading', async () => {
    workerHostInitMock.mockRejectedValueOnce(new Error('Pyodide 初始化超时（120s）'))

    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    expect(runtime.state.session.phase.kind).toBe('failed')
    const phase = runtime.state.session.phase as {
      kind: 'failed'
      failure: { reason: string; detail: string }
    }
    expect(phase.failure.reason).toContain('连接')
    expect(phase.failure.detail).toContain('初始化超时')
    runtime.dispose()
  })

  it('resetPythonState 降级重建后 worker 一直不 ready 时 phase 置 failed', async () => {
    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    // 模拟 resetPythonState 的 exec 失败 → hardKill + init 降级路径
    workerHostExecMock.mockResolvedValue({ ok: false, errorType: 'timeout' })
    // 让 workerHost 状态停留在 booting（模拟 init 后 worker 不回 init_done）
    workerHostStateHolder.value.status = 'booting'

    vi.useFakeTimers()
    const switchPromise = runtime.switchSession('sess-2')

    // 推进超过 120s 超时阈值
    await vi.advanceTimersByTimeAsync(130_000)
    await switchPromise

    expect(runtime.state.session.phase.kind).toBe('failed')
    const phase = runtime.state.session.phase as {
      kind: 'failed'
      failure: { reason: string }
    }
    expect(phase.failure.reason).toContain('切换工作区失败')

    vi.useRealTimers()
    runtime.dispose()
  })

  // workspace 快照恢复是 best-effort：HEAD/GET 超时（5s 硬超时在 notebookAgentClient
  // 层单测覆盖）或失败时，restoreWorkspaceIfEmpty 必须直接降级跳过，绝不阻塞
  // connect/switchSession 进入 ready。这里验证 runtime 层降级契约：
  // 让 requestMock 模拟快照请求失败（404 / 返回非法数据），断言 connect/switchSession 仍达 ready。
  it('workspace snapshot HEAD 失败时，connect 仍会降级到 ready', async () => {
    // 默认 beforeEach 已让 requestMock 返回 404（无快照），connect 内 restoreWorkspaceIfEmpty
    // 命中 checkWorkspaceSnapshot=false 直接跳过。这里验证整条 connect 不被快照探测阻塞。
    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    expect(runtime.state.session.phase.kind).toBe('ready')
    runtime.dispose()
  })

  it('workspace snapshot GET 返回空时，switchSession 仍会跳过恢复并进入 ready', async () => {
    const runtime = await createNotebookSessionRuntime('sess-1')
    await runtime.connect()

    // OPFS 空 + HEAD 命中(200) + GET 返回空 buffer → unzip 得不到文件 → 跳过恢复
    const opfsEmptyTwice = [[], []]
    vi.mocked(listDirectoryEntries).mockImplementation(async () =>
      opfsEmptyTwice.shift() ?? []
    )
    requestMock
      .mockResolvedValueOnce({ status: 200, data: null })
      .mockResolvedValueOnce({ status: 200, data: new ArrayBuffer(0) })

    await runtime.switchSession('sess-2')

    expect(runtime.state.session.phase.kind).toBe('ready')
    expect(runtime.state.session.sessionId).toBe('sess-2')
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
