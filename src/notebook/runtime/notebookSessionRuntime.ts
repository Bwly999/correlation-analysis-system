import { reactive, shallowRef, watch, type ShallowRef } from 'vue'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'
import {
  ensureWorkspaceTree,
  listDirectoryEntries,
  readBytes,
  writeFile,
} from '../shared/opfsAccess'
import { createParentBridgeClient } from './parentBridgeClient'
import { WorkerHost } from './workerHost'
import { createToolDispatcher } from './toolDispatcher'
import { createNotebookTodoStore } from './notebookTodoStore'
import { createAskUserQueue } from './askUserQueue'
import {
  notifyNotebookEnvironmentChanged,
  reportNotebookAuditEntries,
  resolveNotebookAgentToolResult,
  sendNotebookAgentMessage,
  streamNotebookAgentEvents,
  abortNotebookAgentSession,
  compactNotebookAgentSession,
  fetchNotebookSessionHistory,
  renameNotebookSession,
  type NotebookAgentEvent,
} from './notebookAgentClient'
import { AuditLog, computeCodeHash } from './auditLogger'
import {
  applyNotebookEvent,
  createNotebookRuntimeState,
  hydrateFromHistory,
  type NotebookRuntimeState,
} from './notebookEventMapper'
import type { LoadingStage } from '../types/messageStream'

export interface NotebookSessionRuntime {
  state: NotebookRuntimeState
  /**
   * 当前 session 的 OPFS 根（shallowRef）：switchSession 切换后自动更新，
   * App.vue / 文件树等订阅方响应式跟随。模板内自动解包为 OpfsDirectoryHandle。
   */
  opfsRoot: ShallowRef<OpfsDirectoryHandle>
  workerHost: WorkerHost
  connect: () => Promise<void>
  /**
   * 切换到新的 session（开新分析时复用同一个 iframe/runtime，不重建 Pyodide）。
   * 流程：断开旧 SSE → 重置 Python 状态（清 globals）→ 切 OPFS 目录 → 重置 VM →
   *       回放新 session 历史（若有）→ 重连 SSE。
   * 失败降级：Python 重置异常时 hardKill + 重新 init（慢一次但保证正确）。
   */
  switchSession: (newSessionId: string) => Promise<void>
  renameSession: (title: string) => Promise<void>
  /**
   * 按 id 重命名任意会话（不必是当前激活会话）。用于侧栏 hover 改名入口。
   * 改的是当前激活会话时，同步更新 state.session.title。
   */
  renameConversationById: (sessionId: string, title: string) => Promise<void>
  sendUserMessage: (text: string) => Promise<void>
  answerAskUser: (payload: { askId: string; optionId: string; text?: string }) => Promise<void>
  /** 用户主动取消某个 ask_user：等价于终止整轮 Agent（用户想自己输入） */
  cancelAskUser: (askId: string) => Promise<void>
  /** 统一终止当前轮 Agent（推理中走后端 abort；等 ask_user 时复用 cancelAskUser） */
  abort: () => Promise<void>
  /** 手动触发上下文压缩（后端调 SDK session.compact；事件流自动回推 compaction_start/end） */
  compact: () => Promise<void>
  restart: () => Promise<void>
  stop: () => boolean
  exportWorkspaceFiles: (paths?: string[]) => Promise<string[]>
  requestParentClose: () => void
  dispose: () => void
}

// base 子路径部署（如 /workflow/）下，pyodide 运行时随站点走 base 前缀；
// 默认 base='/' 时等价于 '/pyodide/v0.27/'。版本锁定 v0.27 不变（安全模型 §10.1）。
const DEFAULT_PYODIDE_INDEX_URL = `${import.meta.env.BASE_URL}pyodide/v0.27/`
const FILE_TREE_POLL_MS = 2_000
const WORKER_SYNC_DIRS = ['inputs', 'scripts'] as const

/**
 * Worker bootStage（pyodideBoot.ts / worker 内发出）→ UI LoadingStage 映射。
 * Worker 端阶段：'starting' | 'loading_runtime' | 'loading_packages' | 'locking' | 'ready' | ''
 * UI 阶段（types/messageStream.ts）：load_runtime | load_packages | mount_fs | lock_sandbox
 */
const BOOT_STAGE_TO_UI: Record<string, { stage: LoadingStage; percent: number }> = {
  starting: { stage: 'load_runtime', percent: 12 },
  importing_pyodide: { stage: 'load_runtime', percent: 18 },
  loading_runtime: { stage: 'load_runtime', percent: 35 },
  loading_packages: { stage: 'load_packages', percent: 60 },
  locking: { stage: 'lock_sandbox', percent: 88 },
  ready: { stage: 'lock_sandbox', percent: 95 },
}

const formatTimestamp = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const createSessionTitle = (_sessionId: string, ts: number = Date.now()) =>
  `数据分析_${formatTimestamp(ts)}`

const isAbortLikeError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  return error instanceof Error && error.name === 'AbortError'
}

const toTransferableArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

export const createNotebookOpfsRoot = async (
  sessionId: string,
): Promise<OpfsDirectoryHandle> => {
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>
  }

  if (typeof storage?.getDirectory !== 'function') {
    throw new Error('当前浏览器不支持 OPFS')
  }

  const notebookRoot = await storage.getDirectory()
  const sessionRoot = await notebookRoot.getDirectoryHandle(`notebook-${sessionId}`, {
    create: true,
  })
  const opfsSessionRoot = sessionRoot as unknown as OpfsDirectoryHandle
  await ensureWorkspaceTree(opfsSessionRoot)
  return opfsSessionRoot
}

export const createNotebookSessionRuntime = async (
  sessionId: string,
): Promise<NotebookSessionRuntime> => {
  // opfsRoot 用 shallowRef 暴露给外部（App.vue / 文件树）响应式跟随 switchSession 切换；
  // 内部读取统一走 opfsRootRef.value，避免 return 快照导致切换后读写错配（bug3）。
  const opfsRootRef = shallowRef(await createNotebookOpfsRoot(sessionId))
  // currentSessionId 可变：switchSession 切换会话时更新（闭包内引用此变量读取最新值）
  let currentSessionId = sessionId
  const state = reactive(createNotebookRuntimeState(sessionId))
  state.session.title = createSessionTitle(sessionId)
  state.conversations[0]!.title = state.session.title

  const workerHost = new WorkerHost()
  const todoStore = createNotebookTodoStore()
  const askUserQueue = createAskUserQueue()
  // 审计日志（L6）：ring buffer 500 条；关键事件上报后端
  const auditLog = new AuditLog({
    onReportable: (entries) => {
      void reportNotebookAuditEntries(currentSessionId, entries)
    },
  })
  let toolDispatcher = createToolDispatcher({
    opfsRoot: opfsRootRef.value,
    workerHost,
    todoStore,
    askUserQueue,
  })
  // switchSession 切 OPFS 目录后重建 dispatcher（其内部闭包捕获了 opfsRoot 快照）
  const rebuildToolDispatcher = () => {
    toolDispatcher = createToolDispatcher({
      opfsRoot: opfsRootRef.value,
      workerHost,
      todoStore,
      askUserQueue,
    })
  }

  // ── 启动进度桥接 ──────────────────────────────────────────────
  // Worker 在 bootPyodide 期间通过 init_progress 推送 bootStage/bootStageDetail，
  // 这里 watch workerHost.state，把进度实时映射到 state.session.phase.progress，
  // 仅在 phase.kind === 'loading' 时生效，避免覆盖 ready/failed。
  // 不这样做的话，UI 会一直卡在 10% 的 load_runtime，直到 workerHost.init 解析。
  const bootProgressStop = watch(
    () => ({
      stage: workerHost.state.bootStage,
      detail: workerHost.state.bootStageDetail,
      wPercent: workerHost.state.bootStagePercent,
    }),
    ({ stage, detail, wPercent }) => {
      if (state.session.phase.kind !== 'loading') return
      if (!stage) return
      const mapped = BOOT_STAGE_TO_UI[stage]
      if (!mapped) return
      // percent 单调递增：避免后发的小阶段值把进度条往回拉
      const prev = state.session.phase.progress.percent
      // Worker 直报百分比起伏度更高（如逐包加载）；有值时用它代替映射值
      const percent = wPercent > 0 ? Math.max(prev, wPercent) : Math.max(prev, mapped.percent)
      state.session.phase.progress = {
        stage: mapped.stage,
        percent,
        detail: detail || state.session.phase.progress.detail || '',
      }
    },
  )

  let eventAbortController: AbortController | null = null
  let bridgeDispose: (() => void) | null = null
  let bridgeNotifyWorkspaceChanged: (paths: string[]) => void = () => undefined
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let requestParentClose: () => void = () => undefined
  // beforeunload：worker 忙时提示用户确认离开（UX §9.4）
  let beforeunloadHandler: ((event: BeforeUnloadEvent) => void) | null = null

  // connect / switchSession 的并发保护与取消。
  // - connectAbort：connect 进行中若被 switchSession / dispose 抢占，abort 它，
  //   避免后台 ghost connect 继续写 phase / 抢 setupSessionStream（bug B 根因）。
  // - sessionOpChain：switchSession 串行化的 promise 链。后到的 switchSession 必须等
  //   前一个完成再执行，否则两个 switchSession 并发抢 workerHost / opfsRootRef / state，
  //   状态彻底错乱（"取消后再点继续上次分析也进不去"的直接成因）。
  let connectAbort: AbortController | null = null
  let sessionOpChain: Promise<void> = Promise.resolve()

  // ── 状态条可观测性 ──────────────────────────────────────────────
  // agentSeconds：累计 Agent 处于 running 的工作秒数（不计用户阅读时间，UX §3.4）。
  //   watch isRunning：true → 起 1s interval 累加；false → 停。dispose 时一并清。
  let agentSecondsTimer: ReturnType<typeof setInterval> | null = null
  const stopAgentSecondsTimer = () => {
    if (agentSecondsTimer) {
      clearInterval(agentSecondsTimer)
      agentSecondsTimer = null
    }
  }
  const agentSecondsStop = watch(
    () => state.session.runtime.isRunning,
    (running) => {
      if (running) {
        if (!agentSecondsTimer) {
          agentSecondsTimer = setInterval(() => {
            state.session.runtime.agentSeconds += 1
          }, 1000)
        }
      } else {
        stopAgentSecondsTimer()
      }
    },
  )

  // memoryMb：由 Worker 内 performance.memory.usedJSHeapSize 上报（workerHost.state.memoryMb），
  //   同步到 session.runtime.memoryMb 供状态条展示。
  const memSyncStop = watch(
    () => workerHost.state.memoryMb,
    (mb) => {
      state.session.runtime.memoryMb = mb
    },
  )

  const collectOpfsPaths = async (basePath: string): Promise<string[]> => {
    const entries = await listDirectoryEntries(opfsRootRef.value, basePath)
    const files: string[] = []
    for (const entry of entries) {
      const childPath = basePath ? `${basePath}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        files.push(...(await collectOpfsPaths(childPath)))
      } else {
        files.push(childPath)
      }
    }
    return files
  }

  const syncWorkerFilesToOpfs = async (paths?: string[]) => {
    const snapshot = await workerHost.snapshotFs(paths)
    const writtenPaths: string[] = []
    for (const file of snapshot) {
      await writeFile(opfsRootRef.value, file.path, file.bytes)
      writtenPaths.push(file.path)
    }
    return writtenPaths
  }

  const syncOpfsFilesToWorker = async (paths?: string[]) => {
    const targetPaths =
      paths && paths.length > 0
        ? paths
        : (
            await Promise.all(
              WORKER_SYNC_DIRS.map((dir) => collectOpfsPaths(dir)),
            )
          ).flat()

    for (const path of targetPaths) {
      const bytes = await readBytes(opfsRootRef.value, path)
      await workerHost.writeFs(
        path,
        toTransferableArrayBuffer(bytes),
      )
    }

    return targetPaths
  }

  const syncSinglePathToWorker = async (path: string) => {
    const bytes = await readBytes(opfsRootRef.value, path)
    await workerHost.writeFs(
      path,
      toTransferableArrayBuffer(bytes),
    )
  }

  // Worker 自动重启（硬超时 / 崩溃自愈）后的闭环：重灌 OPFS → MEMFS + 通知 Agent + 审计
  workerHost.onAutoRestarted = (info) => {
    state.session.runtime.recentlyRestarted = true
    // restartCount 累加：UI watch 此字段变化触发"环境已重启"吐司（UX §8.1）
    state.session.runtime.restartCount = (state.session.runtime.restartCount ?? 0) + 1
    auditLog.pushAndReport({
      ts: new Date().toISOString(),
      kind: 'worker_restart',
      reason: `auto_restart #${info.autoRestartCount}`,
    })
    void (async () => {
      // 新 Worker 的 MEMFS 是空的，把 OPFS 里的 inputs/scripts 灌回去
      await syncOpfsFilesToWorker().catch(() => undefined)
      // 告知 Agent 环境已重启，下一轮动作需重新 import / 重新加载数据
      await notifyNotebookEnvironmentChanged(
        currentSessionId,
        '⚠️ Python 运行时已自动重启（执行超时或崩溃自愈）。Workspace 文件已保留，但内存中的变量、已 import 的模块、已加载的 DataFrame 均已失效。下一次操作前请重新加载数据。',
      )
    })()
  }

  const handleToolExecute = async (event: NotebookAgentEvent) => {
    if (
      event.type !== 'tool.execute'
      || typeof event.toolCallId !== 'string'
      || typeof event.toolName !== 'string'
    ) {
      return
    }

    const isExec = event.toolName === 'python_exec_inline' || event.toolName === 'python_exec_file'
    const execStartedAt = isExec ? Date.now() : 0
    if (isExec) {
      const code =
        event.params && typeof event.params === 'object' && 'code' in event.params
          ? String((event.params as Record<string, unknown>).code ?? '')
          : ''
      void computeCodeHash(code).then((codeHash) => {
        auditLog.push({
          ts: new Date().toISOString(),
          kind: 'exec_start',
          execId: event.toolCallId,
          codeHash,
          codeLen: code.length,
        })
      })
    }

    const result = await toolDispatcher.dispatch(
      event.toolName,
      event.params,
      event.toolCallId,
    )

    if (isExec) {
      auditLog.push({
        ts: new Date().toISOString(),
        kind: 'exec_done',
        execId: event.toolCallId,
        status: result.isError ? 'error' : 'ok',
        elapsedMs: Date.now() - execStartedAt,
      })
      // exec 落盘的 artifacts/reports/scripts 同步到 OPFS，
      // 并通知主站刷新文件树（B6：savefig 闭环）
      void syncWorkerFilesToOpfs(['artifacts', 'reports', 'scripts'])
        .then((writtenPaths) => {
          if (writtenPaths.length > 0) {
            bridgeNotifyWorkspaceChanged(writtenPaths)
            for (const p of writtenPaths) {
              auditLog.push({
                ts: new Date().toISOString(),
                kind: 'fs_write',
                path: p,
                bytes: 0,
              })
            }
          }
        })
        .catch(() => undefined)
    }

    if (result.isError) {
      auditLog.push({
        ts: new Date().toISOString(),
        kind: 'tool_error',
        tool: event.toolName,
        code: 'exec_error',
      })
    }

    if (event.toolName === 'fs_write' || event.toolName === 'fs_edit') {
      const path =
        event.params && typeof event.params === 'object' && 'path' in event.params
          ? String((event.params as Record<string, unknown>).path ?? '')
          : ''
      if (path) {
        await syncSinglePathToWorker(path)
        auditLog.push({
          ts: new Date().toISOString(),
          kind: event.toolName === 'fs_write' ? 'fs_write' : 'fs_edit',
          path,
          replacements: event.toolName === 'fs_edit' ? 1 : 0,
        } as never)
      }
    }

    await resolveNotebookAgentToolResult(currentSessionId, event.toolCallId, result)
  }

  const handleEvent = (event: NotebookAgentEvent) => {
    applyNotebookEvent(state, event)
    if (event.type === 'tool.execute') {
      void handleToolExecute(event)
    }
  }

  // 断开当前 session 的所有实时绑定（SSE 流 / parentBridge / pollTimer / beforeunload），
  // 但保留 workerHost（Pyodide 实例）。switchSession 和 dispose 前调用。
  const teardownSessionBindings = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (beforeunloadHandler) {
      window.removeEventListener('beforeunload', beforeunloadHandler)
      beforeunloadHandler = null
    }
    eventAbortController?.abort()
    eventAbortController = null
    bridgeDispose?.()
    bridgeDispose = null
    bridgeNotifyWorkspaceChanged = () => undefined
    requestParentClose = () => undefined
    askUserQueue.cancelAll('会话已切换')
  }

  /**
   * 为指定 session 建立实时绑定：parentBridge + SSE 事件流 + pollTimer。
   * withHistory=true 时先拉取后端历史并回放（resume / 刷新页面后继续场景）。
   * 由 connect（首启）和 switchSession（切会话）复用。
   */
  const setupSessionStream = async (targetSessionId: string, opts: { withHistory: boolean }) => {
    const parentBridge = createParentBridgeClient({
      sessionId: targetSessionId,
      parentWindow: window.parent,
      opfsRoot: opfsRootRef.value,
      workerHost,
      addMessageListener: (listener) => {
        window.addEventListener('message', listener)
        return () => window.removeEventListener('message', listener)
      },
      parentTargetOrigin: '*',
      onWorkspaceChanged: async () => {
        void syncWorkerFilesToOpfs(['inputs']).catch(() => undefined)
      },
      onSwitchSession: async (newSessionId) => {
        await switchSession(newSessionId)
      },
    })
    bridgeDispose = parentBridge.dispose
    bridgeNotifyWorkspaceChanged = parentBridge.notifyWorkspaceChanged
    requestParentClose = parentBridge.requestParentClose
    parentBridge.sendSessionState('ready', 'Notebook 环境就绪')

    beforeunloadHandler = (event: BeforeUnloadEvent) => {
      if (workerHost.isBusy()) {
        event.preventDefault()
        event.returnValue = 'Agent 正在工作，确认离开？'
      }
    }
    window.addEventListener('beforeunload', beforeunloadHandler)

    eventAbortController = new AbortController()
    await new Promise<void>((resolve, reject) => {
      let opened = false
      void streamNotebookAgentEvents(targetSessionId, {
        signal: eventAbortController?.signal,
        onOpen: () => {
          opened = true
          state.session.connection = 'online'
          if (!pollTimer) {
            pollTimer = setInterval(() => {
              void syncWorkerFilesToOpfs(['artifacts', 'reports']).catch(() => undefined)
            }, FILE_TREE_POLL_MS)
          }
          resolve()
        },
        onEvent: (event) => {
          handleEvent(event)
          const isRunning = state.session.runtime.isRunning
          parentBridge.sendSessionState(isRunning ? 'agent_running' : 'agent_idle')
        },
      }).catch((error) => {
        if (eventAbortController?.signal.aborted || isAbortLikeError(error)) {
          return
        }
        state.session.connection = 'offline'
        if (!opened) {
          reject(error)
          return
        }
        state.session.phase = {
          kind: 'failed',
          failure: {
            reason: 'Notebook Agent 事件流断开',
            detail: error instanceof Error ? error.message : String(error),
          },
        }
      })
    })

    // 历史回放：resume / 刷新页面后继续，把后端已存的对话灌入 VM
    if (opts.withHistory) {
      try {
        const history = await fetchNotebookSessionHistory(targetSessionId)
        if (history) {
          hydrateFromHistory(state, history)
        }
      } catch {
        // 历史拉取失败不阻塞：用户看到空对话仍可继续
      }
    }
  }

  /**
   * 轮询等待 Worker 从 booting 进入 ready（或 dead）。
   * 用于 resetPythonState 降级 / autoRestart 后的同步等待——workerHost.init 已 await，
   * 但 hardKill 触发的 autoRestart 是 fire-and-forget，调用方需要显式等待稳定态。
   * 超时兜底（默认 120s）避免永久挂起。
   */
  const waitForWorkerReady = async (timeoutMs = 120_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const s = workerHost.state.status
      if (s === 'ready' || s === 'dead') return
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  /**
   * 重置 Pyodide 的 Python 运行时状态（清用户 globals / 关闭 matplotlib 图），
   * 复用同一个 Worker 进程。失败时 hardKill + 重新 init 降级。
   *
   * 关键修复：exec 任何失败形态（kernel_dead / timeout / 其它）都必须降级重建。
   *   - timeout：resetCode 卡在 C 扩展（numpy 析构 / matplotlib / gc）时，22.5s 硬超时
   *     会 terminate Worker 并 fire-and-forget 触发 autoRestart。若这里不识别 timeout，
   *     switchSession 会继续在「booting」态 Worker 上执行 writeFs → 全部静默失败 → 卡 mount_fs。
   *   - kernel_dead：上一会话残留 exec 让 Worker 不可用。
   * 统一兜底：result.ok === false 即 throw → 走 catch 显式 hardKill + 同步 await init，
   *          保证返回时 Worker 真正 ready，phase 由调用方配合 bootProgressStop 反映。
   */
  const resetPythonState = async () => {
    // 若 Worker 正忙（如上一会话 bootstrap 触发的 python_exec 还在跑），
    // 先软中断让占用中的 exec 尽快结束，否则下面的 reset exec 会排在消息队列后面
    // 被无限阻塞 → switchSession 永久卡在 loading（bug1 死锁根因）。
    if (workerHost.isBusy()) {
      workerHost.interrupt()
    }
    // 关闭 matplotlib 图窗 + 清理用户 globals（保留 builtins / __main__ 框架）
    const resetCode = [
      'import sys',
      "try:",
      "    import matplotlib.pyplot as _plt",
      "    _plt.close('all')",
      "except Exception:",
      "    pass",
      "_keep = {'__name__', '__doc__', '__package__', '__loader__', '__spec__', '__builtins__', '__file__', '__cached__'}",
      "for _k in list(globals().keys()):",
      "    if _k not in _keep and not _k.startswith('__'):",
      "        try: del globals()[_k]",
      "        except Exception: pass",
      'import gc; gc.collect()',
    ].join('\n')
    const result = await workerHost.exec(resetCode, 15_000)
    if (!result.ok) {
      // 降级：重置失败则重建 Worker（慢一次但保证状态干净）
      // 注意：exec timeout 时 workerHost 内部已 terminate + fire-and-forget autoRestart，
      //       这里 hardKill 兜住 race，再 await init 等真正 ready。
      workerHost.hardKill()
      await workerHost.init(DEFAULT_PYODIDE_INDEX_URL)
    }
  }

  /**
   * 切换到新 session：复用 Pyodide Worker，重置 Python 状态 + 换 OPFS + 回放历史。
   * 由 parentBridge.parent.switch_session 触发（主站「开新分析」时调用）。
   */
  const switchSession = async (newSessionId: string) => {
    // 串行化：后到的 switchSession 必须等前一个完成。
    // 否则两个 switchSession 并发抢 workerHost / opfsRootRef / state.session，
    // 状态彻底错乱（"取消后再点继续上次分析也进不去"的直接成因）。
    // 同时抢占正在进行的 connect：abort 它，避免 ghost connect 继续写 phase / 抢 SSE。
    const run = async () => {
      connectAbort?.abort()
      connectAbort = null

      // 1. 断开旧 session 的实时绑定（SSE / bridge / poll），保留 Worker
      teardownSessionBindings()

      state.session.phase = {
        kind: 'loading',
        progress: { stage: 'mount_fs', percent: 60, detail: '正在切换工作区' },
      }

      // 2. 重置 Python 状态（复用 Worker；失败时内部 hardKill + await init 降级重建）
      await resetPythonState()

      // resetPythonState 降级重建后，把 phase 拉回 load_runtime 起点，
      // 让 bootProgressStop 能正确反映 bootPyodide 的真实进度（而非一直停在 mount_fs 60%）。
      if (workerHost.state.status === 'booting') {
        state.session.phase = {
          kind: 'loading',
          progress: { stage: 'load_runtime', percent: 12, detail: '正在重建 Python 运行时' },
        }
        await waitForWorkerReady()
      }

      // 3. 切 OPFS 目录 + 重建 toolDispatcher（其闭包捕获 opfsRoot 快照）
      opfsRootRef.value = await createNotebookOpfsRoot(newSessionId)
      rebuildToolDispatcher()

      // 4. 把新 session 的 inputs/scripts 灌入 Worker MEMFS
      await syncOpfsFilesToWorker()

      // 5. 重置 VM 状态为新 session
      currentSessionId = newSessionId
      const freshState = createNotebookRuntimeState(newSessionId)
      freshState.session.title = createSessionTitle(newSessionId)
      state.session = freshState.session
      state.conversations = freshState.conversations
      state.activeConversationId = freshState.activeConversationId
      state.session.runtime.recentlyRestarted = true
      state.session.phase = { kind: 'ready' }

      // 6. 建立新 session 的实时绑定 + 回放历史
      await setupSessionStream(newSessionId, { withHistory: true })
    }
    // 链式串行：下一次 switchSession 会 await 这次的 run() 完成。
    // 错误不阻断链（catch 后继续），保证后续 switchSession 不会被永久挂起。
    sessionOpChain = sessionOpChain.then(run, () => run())
    await sessionOpChain
  }

  const connect = async () => {
    // connect 专属 abort：switchSession / dispose 抢占时调 connectAbort.abort()，
    // 让后台 ghost connect 在每个 await 点退出，不再写 phase / 不再抢 setupSessionStream。
    connectAbort?.abort()
    connectAbort = new AbortController()
    const signal = connectAbort.signal

    state.session.phase = {
      kind: 'loading',
      progress: {
        stage: 'load_runtime',
        percent: 10,
        detail: '正在加载 Python 运行时',
      },
    }
    state.session.connection = 'reconnecting'

    await workerHost.init(DEFAULT_PYODIDE_INDEX_URL)
    if (signal.aborted) return
    state.session.phase = {
      kind: 'loading',
      progress: {
        stage: 'mount_fs',
        percent: 70,
        detail: '正在同步工作区文件',
      },
    }
    await syncOpfsFilesToWorker()
    if (signal.aborted) return
    state.session.phase = { kind: 'ready' }

    // 建立实时绑定（parentBridge + SSE）+ 回放历史（首启通常无历史，resume 场景有）
    await setupSessionStream(currentSessionId, { withHistory: true })
  }

  const sendUserMessageAndTrack = async (text: string) => {
    const content = text.trim()
    if (!content) return

    state.session.messages.push({
      id: `user-${Date.now()}`,
      role: 'user',
      text: content,
      at: Date.now(),
    })
    state.session.agent = 'running'
    state.session.runtime.isRunning = true
    const messageId = `msg-${Date.now()}`
    await sendNotebookAgentMessage(currentSessionId, {
      id: messageId,
      content,
    })
  }

  const renameSession = async (title: string) => {
    const nextTitle = title.trim()
    if (!nextTitle) return
    await renameNotebookSession(currentSessionId, nextTitle)
    state.session.title = nextTitle
    const activeId = state.activeConversationId ?? currentSessionId
    const conversation = state.conversations.find((item) => item.id === activeId)
    if (conversation) {
      conversation.title = nextTitle
      conversation.updatedAt = Date.now()
    }
  }

  const renameConversationById = async (sessionId: string, title: string) => {
    const nextTitle = title.trim()
    if (!nextTitle) return
    await renameNotebookSession(sessionId, nextTitle)
    const conversation = state.conversations.find((item) => item.id === sessionId)
    if (conversation) {
      conversation.title = nextTitle
      conversation.updatedAt = Date.now()
    }
    // 改的是当前激活会话时同步顶部 session 标题
    const activeId = state.activeConversationId ?? currentSessionId
    if (activeId === sessionId) {
      state.session.title = nextTitle
    }
  }

  const answerAskUser = async (payload: { askId: string; optionId: string; text?: string }) => {
    const askItem = askUserQueue.list().find((item) => item.toolCallId === payload.askId)
    const optionMatch = askItem?.options?.find((_option, index) => (
      `${payload.askId}-option-${index + 1}` === payload.optionId
    ))
    askUserQueue.resolve(payload.askId, {
      answers: [
        {
          label: payload.text?.trim() || optionMatch?.label || payload.optionId,
          isCustom: Boolean(payload.text?.trim()),
        },
      ],
    })
  }

  /**
   * 把指定 ask_user 卡片的状态置为 cancelled。
   *
   * 走 abortNotebookAgentSession 后后端只推 session.status:'cancelled'，
   * 不再推 tool.end isError（原 cancelAskUser 靠它驱动卡片状态），
   * 故这里主动改 block.data.status，保持 UI 渲染一致。
   */
  const markAskUserBlockCancelled = (askId: string) => {
    for (const message of state.session.messages) {
      if (message.role !== 'assistant') continue
      for (const block of message.blocks) {
        if (block.kind === 'ask_user' && block.data.id === askId) {
          block.data.status = 'cancelled'
        }
      }
    }
  }

  const cancelAskUser = async (askId: string) => {
    // 取消 Ask = 取消整轮 Agent（用户想自己输入，Agent 不能自行续跑）。
    // 1. 立即 reject 本地挂起的 ask_user promise，让 toolDispatcher 尽快结束
    askUserQueue.cancel(askId, '用户取消')
    // 2. 立即把 AskUserCard 置 cancelled（后端走 abort 后不再推 tool.end isError）
    markAskUserBlockCancelled(askId)
    // 3. 终止整轮 Agent：clearQueue + cancelPendingRequests + session.abort + 广播 cancelled
    await abortNotebookAgentSession(currentSessionId).catch(() => undefined)
  }

  const stopStreamingAssistant = () => {
    state.session.runtime.isRunning = false
    for (const message of state.session.messages) {
      if (message.role === 'assistant' && message.streaming) {
        message.streaming = false
      }
    }
  }

  const abort = async () => {
    // 统一终止入口：等 ask_user 中 / 推理中都走同一条后端 abort 链路。
    // 1. 若正在等待 ask_user：复用 cancelAskUser（内含队列取消 + 卡片置 cancelled + abort 后端）
    if (askUserQueue.peek()) {
      const pendingAsk = askUserQueue.peek()!
      await cancelAskUser(pendingAsk.toolCallId)
      return
    }
    // 2. 推理中：先乐观更新 UI，避免等 RTT 期间还显示"正在落笔"
    stopStreamingAssistant()
    // 同时中断 Python worker：abort 只停 LLM 推理，Python exec 可能仍在跑，
    // 不打断会导致 workerHost.isBusy() 仍为 true，用户终止后离开页面还会弹 beforeunload 确认框
    workerHost.interrupt()
    await abortNotebookAgentSession(currentSessionId).catch(() => undefined)
  }

  /**
   * 手动触发上下文压缩。
   *
   * 调后端 POST /compact → SDK session.compact()。
   * 压缩过程的 compaction_start / compaction_end 事件会经 SSE 流自动推回，
   * 由 notebookEventMapper 更新 session.runtime.compactionInProgress / compactionHistory。
   * 故这里不主动改 VM 状态（与 abort 的"乐观更新"不同）——等事件回流即可。
   */
  const compact = async () => {
    await compactNotebookAgentSession(currentSessionId).catch(() => undefined)
  }

  const restart = async () => {
    state.session.phase = {
      kind: 'loading',
      progress: {
        stage: 'load_runtime',
        percent: 15,
        detail: '正在重启 Python 运行时',
      },
    }
    workerHost.hardKill()
    await workerHost.init(DEFAULT_PYODIDE_INDEX_URL)
    state.session.phase = {
      kind: 'loading',
      progress: {
        stage: 'mount_fs',
        percent: 75,
        detail: '正在恢复工作区文件',
      },
    }
    await syncOpfsFilesToWorker()
    state.session.runtime.recentlyRestarted = true
    state.session.runtime.memoryMb = 0
    state.session.phase = {
      kind: 'ready',
    }
  }

  const stop = () => workerHost.interrupt()

  const exportWorkspaceFiles = async (paths?: string[]) => {
    return syncWorkerFilesToOpfs(paths)
  }

  return {
    state,
    opfsRoot: opfsRootRef,
    workerHost,
    connect,
    switchSession,
    renameSession,
    renameConversationById,
    sendUserMessage: sendUserMessageAndTrack,
    answerAskUser,
    cancelAskUser,
    abort,
    compact,
    restart,
    stop,
    exportWorkspaceFiles,
    requestParentClose: () => requestParentClose(),
    dispose: () => {
      // 中断任何仍在进行的 connect，避免卸载后 ghost connect 继续写 phase / 抢 SSE
      connectAbort?.abort()
      connectAbort = null
      bootProgressStop()
      agentSecondsStop()
      stopAgentSecondsTimer()
      memSyncStop()
      teardownSessionBindings()
      askUserQueue.cancelAll('会话已关闭')
      // session 结束上报全部审计 buffer（§8.2）
      const snapshot = auditLog.snapshot()
      if (snapshot.length > 0) {
        void reportNotebookAuditEntries(currentSessionId, snapshot)
      }
      auditLog.clear()
      workerHost.hardKill()
    },
  }
}
