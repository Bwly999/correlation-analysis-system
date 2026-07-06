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
  uploadWorkspaceSnapshot,
  downloadWorkspaceSnapshot,
  checkWorkspaceSnapshot,
  type NotebookAgentEvent,
} from './notebookAgentClient'
import { exportWorkspaceZip, unzipWorkspace } from './workspaceExporter'
import { SINGLE_WRITE_LIMIT_BYTES } from '../shared/opfsAccess'
import { AuditLog, computeCodeHash } from './auditLogger'
import {
  applyNotebookEvent,
  createNotebookRuntimeState,
  hydrateFromHistory,
  type NotebookRuntimeState,
} from './notebookEventMapper'
import type { LoadingStage, UserAttachment } from '../types/messageStream'

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
  sendUserMessage: (text: string, attachments?: UserAttachment[]) => Promise<void>
  /**
   * 把用户选择/拖拽/粘贴的文件写入 workspace 的 inputs/ 目录（OPFS + Pyodide MEMFS），
   * 返回每个文件的附件元数据（含 workspace 内相对路径），供输入框展示 chip +
   * 发送时注入消息文本提示 Agent 用 fs_read 读取。文件名冲突直接覆盖（与 upstream.csv 一致）。
   */
  importAttachments: (files: File[]) => Promise<UserAttachment[]>
  answerAskUser: (payload: {
    askId: string
    optionIds: string[]
    text?: string
  }) => Promise<void>
  /** 用户主动取消某个 ask_user：等价于终止整轮 Agent（用户想自己输入） */
  cancelAskUser: (askId: string) => Promise<void>
  /** 统一终止当前轮 Agent（推理中走后端 abort；等 ask_user 时复用 cancelAskUser） */
  abort: () => Promise<void>
  /** 手动触发上下文压缩（后端调 SDK session.compact；事件流自动回推 compaction_start/end） */
  compact: () => Promise<void>
  restart: () => Promise<void>
  stop: () => boolean
  exportWorkspaceFiles: (paths?: string[]) => Promise<string[]>
  /** 关闭笔记本前会推一次 workspace 快照，故可能返回 Promise */
  requestParentClose: () => void | Promise<void>
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

/** 复制一份独立的 ArrayBuffer（OPFS / Worker 双写各自需要独立副本，transfer 不会污染另一份） */
const cloneArrayBuffer = (buf: ArrayBuffer): ArrayBuffer => {
  const out = new ArrayBuffer(buf.byteLength)
  new Uint8Array(out).set(new Uint8Array(buf))
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

    // 启动期批量同步：单个文件失败（读 OPFS 出错 / writeFs 超时或 worker 暂未就绪）
    // 不应让整个 mount_fs 卡死或失败 —— 记录后跳过，保证流程能推进到 ready。
    // Agent 侧的单文件 fs_write/fs_edit 走 syncSinglePathToWorker，那里保持严格语义。
    for (const path of targetPaths) {
      try {
        const bytes = await readBytes(opfsRootRef.value, path)
        await workerHost.writeFs(
          path,
          toTransferableArrayBuffer(bytes),
        )
      } catch (err) {
        console.warn(`[notebook] 同步工作区文件失败，已跳过：${path}`, err)
      }
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

  // ── workspace 文件快照：浏览器优先 + 服务端降级兜底 ──────────────
  //
  // pushWorkspaceSnapshot：把当前 OPFS workspace 全量打成 zip 推到服务端。
  //   触发点：exec 轮落盘后 / 关闭笔记本前（见 handleToolExecute / requestParentClose）。
  //   失败静默（与 S3 同步语义一致），绝不阻塞 Agent 推理。
  //
  // restoreWorkspaceIfEmpty：恢复时探测 OPFS 是否完全为空，
  //   空则从服务端拉快照写回 OPFS；非空零开销跳过。
  //   在 connect / switchSession 的 syncOpfsFilesToWorker 之前调用。
  const pushWorkspaceSnapshot = async (): Promise<void> => {
    try {
      const result = await exportWorkspaceZip(opfsRootRef.value, currentSessionId)
      if (result.bytes.byteLength > SINGLE_WRITE_LIMIT_BYTES) {
        console.warn(
          `[notebook] workspace 快照 ${result.bytes.byteLength} 字节超过 ${SINGLE_WRITE_LIMIT_BYTES} 上限，已跳过上传`,
        )
        return
      }
      await uploadWorkspaceSnapshot(currentSessionId, result.bytes)
    } catch {
      // 静默：快照同步是 best-effort，失败不阻塞
    }
  }

  const restoreWorkspaceIfEmpty = async (): Promise<void> => {
    try {
      // 探测 OPFS 是否完全为空：检查 inputs/scripts（用户/Agent 主动管理的目录）
      const allPaths = await Promise.all(
        WORKER_SYNC_DIRS.map((dir) => collectOpfsPaths(dir)),
      )
      const inputsAndScripts = allPaths.flat()
      // inputs/scripts 是用户/Agent 主动管理的；artifacts/reports 是产物。
      // 只要 inputs/scripts 有文件就视为 OPFS 完好，不触发恢复（避免冗余 IO）。
      if (inputsAndScripts.length > 0) return

      // 服务端快照恢复是 best-effort：HEAD/GET 内部自带 5s 硬超时，
      // 任一请求卡住/失败都直接降级跳过，绝不阻塞 connect/switchSession 进入 ready。
      const exists = await checkWorkspaceSnapshot(currentSessionId)
      if (!exists) return
      const zipBytes = await downloadWorkspaceSnapshot(currentSessionId)
      if (!zipBytes) return

      const files = await unzipWorkspace(zipBytes)
      for (const file of files) {
        try {
          await writeFile(opfsRootRef.value, file.path, file.bytes)
        } catch {
          // 单文件写失败不阻断整体恢复（与 syncOpfsFilesToWorker 容错策略一致）
        }
      }
    } catch {
      // 静默：恢复失败不阻塞，用户仍可继续（OPFS 空 + 无快照 = 真的新会话）
    }
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
          // exec 落盘后做一次 workspace 快照 checkpoint（OPFS 已同步完毕）。
          // 失败静默，不阻塞下一轮 Agent 动作。
          return pushWorkspaceSnapshot()
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
      if (s === 'ready') return
      if (s === 'dead') throw new Error('Worker 已死亡，无法等待就绪')
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`等待 Worker 就绪超时（${timeoutMs / 1000}s）`)
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
    console.log('[DEBUG] resetPythonState: 入口, status=', workerHost.state.status, 'busy=', workerHost.isBusy())
    if (workerHost.isBusy()) {
      console.log('[DEBUG] resetPythonState: Worker 正忙，发送中断')
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
    console.log('[DEBUG] resetPythonState: 准备 exec, codeLength=', resetCode.length)
    const result = await workerHost.exec(resetCode, 15_000)
    console.log('[DEBUG] resetPythonState: exec 返回, ok=', result.ok, 'errorType=', result.errorType, 'errorMessage=', result.errorMessage)
    if (!result.ok) {
      // 降级：重置失败则重建 Worker（慢一次但保证状态干净）
      // 注意：exec timeout 时 workerHost 内部已 terminate + fire-and-forget autoRestart，
      //       这里 hardKill 兜住 race，再 await init 等真正 ready。
      console.log('[DEBUG] resetPythonState: exec 失败，执行 hardKill + init')
      workerHost.hardKill()
      console.log('[DEBUG] resetPythonState: hardKill 完成, status=', workerHost.state.status)
      await workerHost.init(DEFAULT_PYODIDE_INDEX_URL)
      console.log('[DEBUG] resetPythonState: init 完成, status=', workerHost.state.status)
    }
    console.log('[DEBUG] resetPythonState: 完成')
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
      console.log('[DEBUG] switchSession.run: 开始, newSessionId=', newSessionId)
      connectAbort?.abort()
      connectAbort = null

      // 1. 断开旧 session 的实时绑定（SSE / bridge / poll），保留 Worker
      teardownSessionBindings()
      console.log('[DEBUG] switchSession.run: teardown 完成, workerStatus=', workerHost.state.status)

      state.session.phase = {
        kind: 'loading',
        progress: { stage: 'mount_fs', percent: 60, detail: '正在重置 Python 环境' },
      }

      try {
        // 2. 重置 Python 状态（复用 Worker；失败时内部 hardKill + await init 降级重建）
        console.log('[DEBUG] switchSession.run: 调用 resetPythonState')
        await resetPythonState()
        console.log('[DEBUG] switchSession.run: resetPythonState 完成, workerStatus=', workerHost.state.status)

        // resetPythonState 降级重建后，把 phase 拉回 load_runtime 起点，
        // 让 bootProgressStop 能正确反映 bootPyodide 的真实进度（而非一直停在 mount_fs 60%）。
        console.log('[DEBUG] switchSession.run: 检查 booting, status=', workerHost.state.status)
        if (workerHost.state.status === 'booting') {
          state.session.phase = {
            kind: 'loading',
            progress: { stage: 'load_runtime', percent: 12, detail: '正在重建 Python 运行时' },
          }
          await waitForWorkerReady()
          console.log('[DEBUG] switchSession.run: waitForWorkerReady 完成')
        }

        // 3. 切 OPFS 目录 + 重建 toolDispatcher（其闭包捕获 opfsRoot 快照）
        console.log('[DEBUG] switchSession.run: 开始 createNotebookOpfsRoot')
        opfsRootRef.value = await createNotebookOpfsRoot(newSessionId)
        console.log('[DEBUG] switchSession.run: createNotebookOpfsRoot 完成')
        rebuildToolDispatcher()
        console.log('[DEBUG] switchSession.run: rebuildToolDispatcher 完成')

        // 4. 把新 session 的 inputs/scripts 灌入 Worker MEMFS（单文件失败不致命，见 syncOpfsFilesToWorker）
        //    灌入前先恢复探测：OPFS 为空（换设备/清缓存）则从服务端拉快照写回。
        console.log('[DEBUG] switchSession.run: restoreWorkspaceIfEmpty + syncOpfsFilesToWorker')
        await restoreWorkspaceIfEmpty()
        await syncOpfsFilesToWorker()
        console.log('[DEBUG] switchSession.run: syncOpfsFilesToWorker 完成')

        // 5. 重置 VM 状态为新 session
        console.log('[DEBUG] switchSession.run: 重置 VM 状态')
        currentSessionId = newSessionId
        const freshState = createNotebookRuntimeState(newSessionId)
        freshState.session.title = createSessionTitle(newSessionId)
        // 关键修复：不能替换 state.session 对象本身 —— App.vue 的 session ref
        // 持有 state.session 的旧引用，替换会导致 UI 永远读旧对象的 phase（一直 loading）。
        // 改用 Object.assign 原地修改属性，保持引用不变。
        Object.assign(state.session, freshState.session)
        state.conversations = freshState.conversations
        state.activeConversationId = freshState.activeConversationId
        state.session.runtime.recentlyRestarted = true
        state.session.phase = { kind: 'ready' }
        console.log('[DEBUG] switchSession.run: phase 置为 ready')

        // 6. 建立新 session 的实时绑定 + 回放历史
        console.log('[DEBUG] switchSession.run: 开始 setupSessionStream')
        await setupSessionStream(newSessionId, { withHistory: true })
        console.log('[DEBUG] switchSession.run: setupSessionStream 完成')
      } catch (err) {
        // 错误边界：任何步骤失败（worker 卡死 / writeFs 超时 / OPFS 错 / SSE 建立失败）
        // 都必须把 phase 置为 failed，绝不能永久停在 mount_fs 让用户卡死在 Loading。
        // 清理可能半建好的实时绑定，避免残留 SSE / bridge 干扰下一次重试。
        console.error('[DEBUG] switchSession.run: catch 捕获错误', err)
        teardownSessionBindings()
        state.session.phase = {
          kind: 'failed',
          failure: {
            reason: '切换工作区失败',
            detail: err instanceof Error ? err.message : String(err),
          },
        }
        auditLog.push({
          ts: new Date().toISOString(),
          kind: 'tool_error',
          tool: 'switch_session',
          code: 'switch_session_failed',
        })
      }
    }
    // 链式串行：下一次 switchSession 会 await 这次的 run() 完成。
    // run() 内部已 try/catch 并置 failed，永不 reject，故链不会被挂起；
    // 第二参数兜底历史链上的 reject（不会再发生），同样走 run 重新尝试。
    sessionOpChain = sessionOpChain.then(run, run)
    await sessionOpChain
  }

  const connect = async () => {
    // connect 专属 abort：switchSession / dispose 抢占时调 connectAbort.abort()，
    // 让后台 ghost connect 在每个 await 点退出，不再写 phase / 不再抢 setupSessionStream。
    connectAbort?.abort()
    connectAbort = new AbortController()
    const signal = connectAbort.signal

    try {
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
      // 恢复探测：OPFS 为空（刷新页面后浏览器清了缓存 / 换设备）则从服务端拉快照写回，
      // 再走 OPFS → Worker MEMFS 灌入。OPFS 完好时零开销。
      await restoreWorkspaceIfEmpty()
      await syncOpfsFilesToWorker()
      if (signal.aborted) return
      state.session.phase = { kind: 'ready' }

      // 建立实时绑定（parentBridge + SSE）+ 回放历史（首启通常无历史，resume 场景有）
      await setupSessionStream(currentSessionId, { withHistory: true })
    } catch (err) {
      teardownSessionBindings()
      state.session.phase = {
        kind: 'failed',
        failure: {
          reason: '连接 Notebook Agent 失败',
          detail: err instanceof Error ? err.message : String(err),
        },
      }
    }
  }

  const sendUserMessageAndTrack = async (
    text: string,
    attachments?: UserAttachment[],
  ) => {
    const trimmed = text.trim()
    const validAttachments = attachments?.filter((a) => a && a.path) ?? []
    // 文本或附件至少有一个才能发送
    if (!trimmed && validAttachments.length === 0) return

    // 附件非空时把路径提示注入 content —— 后端消息接口仍是纯文本，
    // Agent 读到这段提示会主动 fs_read 对应文件分析。后端零改动。
    const content = validAttachments.length > 0
      ? [
          trimmed,
          '',
          '[已上传文件]',
          ...validAttachments.map((a) => `- ${a.path}`),
        ].filter(Boolean).join('\n')
      : trimmed

    state.session.messages.push({
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      at: Date.now(),
      attachments: validAttachments.length > 0 ? validAttachments : undefined,
    })
    state.session.agent = 'running'
    state.session.runtime.isRunning = true
    const messageId = `msg-${Date.now()}`
    await sendNotebookAgentMessage(currentSessionId, {
      id: messageId,
      content,
    })
  }

  /**
   * 把用户上传的文件写入 workspace inputs/ 目录（OPFS + Pyodide MEMFS 双写）。
   *
   * 与 parentBridgeClient 的 import_csv 走同一写入路径：OPFS 一份、Worker MEMFS 一份，
   * 两份各持独立 ArrayBuffer（writeFs 会 transfer 给 worker，主线程副本必须独立）。
   * 文件树由 useWorkspaceTree 2s 轮询 OPFS 自动刷新，无需手动通知。
   */
  const importAttachments = async (files: File[]): Promise<UserAttachment[]> => {
    const results: UserAttachment[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const targetPath = `inputs/${file.name}`
      // OPFS 写入用一份独立副本（writeFile 内部 toUint8 不消费 ArrayBuffer）
      const opfsCopy = cloneArrayBuffer(buffer)
      await writeFile(opfsRootRef.value, targetPath, opfsCopy)
      // Worker MEMFS 写入用另一份：workerHost.writeFs 会 transfer 走 buffer
      const workerCopy = cloneArrayBuffer(buffer)
      await workerHost.writeFs(targetPath, workerCopy)
      results.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        path: targetPath,
        size: file.size,
        mimeType: file.type || undefined,
      })
    }
    return results
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

  const answerAskUser = async (payload: {
    askId: string
    optionIds: string[]
    text?: string
  }) => {
    const askItem = askUserQueue.list().find((item) => item.toolCallId === payload.askId)
    const trimmedText = payload.text?.trim()
    // 把每个选中的 optionId 映射回 label（id 由 mapper 生成：`${toolCallId}-option-${n}`）
    const optionAnswers = payload.optionIds
      .filter((id) => id !== '__free_text__')
      .map((id) => {
        const matched = askItem?.options?.find((_option, index) => (
          `${payload.askId}-option-${index + 1}` === id
        ))
        return {
          label: matched?.label ?? id,
          isCustom: false,
        }
      })
    // 自由文本：作为最后一个答案项（isCustom=true）
    const customAnswer = trimmedText
      ? [{ label: trimmedText, isCustom: true }]
      : []
    askUserQueue.resolve(payload.askId, {
      answers: [...optionAnswers, ...customAnswer],
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
    try {
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
      state.session.phase = { kind: 'ready' }

      // 重启后实时绑定可能已被前一次 failed 的 teardown 清掉（switchSession catch 调过
      // teardownSessionBindings）。这里幂等重建当前 session 的 SSE / bridge，
      // 保证 retry 后 Agent 事件能正常回流，而不是静默卡住。
      if (!bridgeDispose) {
        await setupSessionStream(currentSessionId, { withHistory: true })
      }
    } catch (err) {
      teardownSessionBindings()
      state.session.phase = {
        kind: 'failed',
        failure: {
          reason: '重启 Python 运行时失败',
          detail: err instanceof Error ? err.message : String(err),
        },
      }
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
    importAttachments,
    answerAskUser,
    cancelAskUser,
    abort,
    compact,
    restart,
    stop,
    exportWorkspaceFiles,
    // 关闭笔记本前推一次 workspace 快照 checkpoint（确保用户离开时产物已落服务端）。
    // 失败静默；推完（或失败）再走原 close 流程，不阻塞。
    requestParentClose: async () => {
      await pushWorkspaceSnapshot().catch(() => undefined)
      requestParentClose()
    },
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
