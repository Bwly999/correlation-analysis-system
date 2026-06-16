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
  resolveNotebookAgentToolResult,
  sendNotebookAgentMessage,
  streamNotebookAgentEvents,
  type NotebookAgentEvent,
} from './notebookAgentClient'
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

  const handleToolExecute = async (event: NotebookAgentEvent) => {
    if (
      event.type !== 'tool.execute'
      || typeof event.toolCallId !== 'string'
      || typeof event.toolName !== 'string'
    ) {
      return
    }

    const result = await toolDispatcher.dispatch(
      event.toolName,
      event.params,
      event.toolCallId,
    )

    if (event.toolName === 'python_exec_inline' || event.toolName === 'python_exec_file') {
      // exec 落盘的 artifacts/reports/scripts 同步到 OPFS，
      // 并通知主站刷新文件树（B6：savefig 闭环）
      void syncWorkerFilesToOpfs(['artifacts', 'reports', 'scripts'])
        .then((writtenPaths) => {
          if (writtenPaths.length > 0) {
            bridgeNotifyWorkspaceChanged(writtenPaths)
          }
        })
        .catch(() => undefined)
    }

    if (event.toolName === 'fs_write' || event.toolName === 'fs_edit') {
      const path =
        event.params && typeof event.params === 'object' && 'path' in event.params
          ? String((event.params as Record<string, unknown>).path ?? '')
          : ''
      if (path) {
        await syncSinglePathToWorker(path)
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
    restart,
    stop,
    exportWorkspaceFiles,
    requestParentClose: () => requestParentClose(),
    dispose: () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      eventAbortController?.abort()
      bridgeDispose?.()
      askUserQueue.cancelAll('会话已关闭')
      workerHost.hardKill()
    },
  }
}
