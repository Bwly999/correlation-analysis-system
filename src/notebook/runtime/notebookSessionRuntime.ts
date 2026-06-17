import { reactive } from 'vue'
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
  type NotebookAgentEvent,
} from './notebookAgentClient'
import { AuditLog, computeCodeHash } from './auditLogger'
import {
  applyNotebookEvent,
  createNotebookRuntimeState,
  type NotebookRuntimeState,
} from './notebookEventMapper'

export interface NotebookSessionRuntime {
  state: NotebookRuntimeState
  opfsRoot: OpfsDirectoryHandle
  workerHost: WorkerHost
  connect: () => Promise<void>
  sendUserMessage: (text: string) => Promise<void>
  answerAskUser: (payload: { askId: string; optionId: string; text?: string }) => Promise<void>
  /** 用户主动取消某个 ask_user（修 AskUserCard 取消按钮无反应的 bug） */
  cancelAskUser: (askId: string) => Promise<void>
  /** 终止当前轮 Agent（推理中调后端 abort；ask_user 等待中等同于 cancelAskUser） */
  abort: () => Promise<void>
  restart: () => Promise<void>
  stop: () => boolean
  exportWorkspaceFiles: (paths?: string[]) => Promise<string[]>
  requestParentClose: () => void
  dispose: () => void
}

const DEFAULT_PYODIDE_INDEX_URL = '/pyodide/v0.27/'
const FILE_TREE_POLL_MS = 2_000
const WORKER_SYNC_DIRS = ['inputs', 'scripts'] as const

const createSessionTitle = (sessionId: string) => `分析笔记本 ${sessionId.slice(0, 8)}`

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
  const opfsRoot = await createNotebookOpfsRoot(sessionId)
  const state = reactive(createNotebookRuntimeState(sessionId))
  state.session.title = createSessionTitle(sessionId)
  state.conversations[0]!.title = state.session.title

  const workerHost = new WorkerHost()
  const todoStore = createNotebookTodoStore()
  const askUserQueue = createAskUserQueue()
  // 审计日志（L6）：ring buffer 500 条；关键事件上报后端
  const auditLog = new AuditLog({
    onReportable: (entries) => {
      void reportNotebookAuditEntries(sessionId, entries)
    },
  })
  const toolDispatcher = createToolDispatcher({
    opfsRoot,
    workerHost,
    todoStore,
    askUserQueue,
  })

  let eventAbortController: AbortController | null = null
  let bridgeDispose: (() => void) | null = null
  let bridgeNotifyWorkspaceChanged: (paths: string[]) => void = () => undefined
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let requestParentClose = () => undefined
  // beforeunload：worker 忙时提示用户确认离开（UX §9.4）
  let beforeunloadHandler: ((event: BeforeUnloadEvent) => void) | null = null

  const collectOpfsPaths = async (basePath: string): Promise<string[]> => {
    const entries = await listDirectoryEntries(opfsRoot, basePath)
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
      await writeFile(opfsRoot, file.path, file.bytes)
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
      const bytes = await readBytes(opfsRoot, path)
      await workerHost.writeFs(
        path,
        toTransferableArrayBuffer(bytes),
      )
    }

    return targetPaths
  }

  const syncSinglePathToWorker = async (path: string) => {
    const bytes = await readBytes(opfsRoot, path)
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
        sessionId,
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

    await resolveNotebookAgentToolResult(sessionId, event.toolCallId, result)
  }

  const handleEvent = (event: NotebookAgentEvent) => {
    applyNotebookEvent(state, event)
    if (event.type === 'tool.execute') {
      void handleToolExecute(event)
    }
  }

  const connect = async () => {
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
    state.session.phase = {
      kind: 'loading',
      progress: {
        stage: 'mount_fs',
        percent: 70,
        detail: '正在同步工作区文件',
      },
    }
    await syncOpfsFilesToWorker()
    state.session.phase = {
      kind: 'ready',
    }

    const parentBridge = createParentBridgeClient({
      sessionId,
      parentWindow: window.parent,
      opfsRoot,
      workerHost,
      addMessageListener: (listener) => {
        window.addEventListener('message', listener)
        return () => window.removeEventListener('message', listener)
      },
      parentTargetOrigin: '*',
      onWorkspaceChanged: async () => {
        void syncWorkerFilesToOpfs(['inputs']).catch(() => undefined)
      },
    })
    bridgeDispose = parentBridge.dispose
    bridgeNotifyWorkspaceChanged = parentBridge.notifyWorkspaceChanged
    requestParentClose = parentBridge.requestParentClose
    parentBridge.sendSessionState('loading_pyodide', '正在连接 Notebook Agent')

    // beforeunload：Worker 忙时提示用户确认离开（UX §9.4）
    // 仅在 worker 正在跑 exec 时拦截，避免无谓打扰
    beforeunloadHandler = (event: BeforeUnloadEvent) => {
      if (workerHost.isBusy()) {
        event.preventDefault()
        // 部分浏览器需要 returnValue 非空才弹原生确认框
        event.returnValue = 'Agent 正在工作，确认离开？'
      }
    }
    window.addEventListener('beforeunload', beforeunloadHandler)

    eventAbortController = new AbortController()
    await new Promise<void>((resolve, reject) => {
      let opened = false
      void streamNotebookAgentEvents(sessionId, {
        signal: eventAbortController?.signal,
        onOpen: () => {
          opened = true
          state.session.connection = 'online'
          parentBridge.sendSessionState('ready', 'Notebook 环境就绪')
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
    await sendNotebookAgentMessage(sessionId, {
      id: messageId,
      content,
    })
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

  const cancelAskUser = async (askId: string) => {
    // 取消本地等待的 promise，避免 30s 超时；并把 isError 结果推给后端，
    // notebookEventMapper 在收到 tool.end isError 时会自动把 AskUserBlock.status 置为 'cancelled'
    askUserQueue.cancel(askId, '用户取消')
    await resolveNotebookAgentToolResult(sessionId, askId, {
      isError: true,
      content: [{ type: 'text', text: '用户已取消该问题' }],
      details: {},
    }).catch(() => undefined)
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
    // 1. 若正在等待 ask_user：等同于取消该 Ask 卡片，不调后端 abort（Agent 此刻阻塞在等回答）
    const pendingAsk = askUserQueue.peek()
    if (pendingAsk) {
      await cancelAskUser(pendingAsk.toolCallId)
      return
    }
    // 2. 否则（正在跑推理）：先乐观更新 UI，避免等 RTT 期间还显示"正在落笔"
    stopStreamingAssistant()
    // 同时中断 Python worker：abort 只停 LLM 推理，Python exec 可能仍在跑，
    // 不打断会导致 workerHost.isBusy() 仍为 true，用户终止后离开页面还会弹 beforeunload 确认框
    workerHost.interrupt()
    await abortNotebookAgentSession(sessionId).catch(() => undefined)
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
    opfsRoot,
    workerHost,
    connect,
    sendUserMessage: sendUserMessageAndTrack,
    answerAskUser,
    cancelAskUser,
    abort,
    restart,
    stop,
    exportWorkspaceFiles,
    requestParentClose: () => requestParentClose(),
    dispose: () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      if (beforeunloadHandler) {
        window.removeEventListener('beforeunload', beforeunloadHandler)
        beforeunloadHandler = null
      }
      eventAbortController?.abort()
      bridgeDispose?.()
      askUserQueue.cancelAll('会话已关闭')
      // session 结束上报全部审计 buffer（§8.2）
      const snapshot = auditLog.snapshot()
      if (snapshot.length > 0) {
        void reportNotebookAuditEntries(sessionId, snapshot)
      }
      auditLog.clear()
      workerHost.hardKill()
    },
  }
}
