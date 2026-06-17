/**
 * iframe 侧的 parentBridge 客户端。
 *
 * 监听 window.parent.postMessage 发来的消息，按 src/notebook/shared/parentBridge.ts
 * 定义的协议派发：
 *   - parent.handshake → 回 ok + 自动发 iframe.ready
 *   - parent.import_csv → 写 OPFS + 写 Worker MEMFS + 回 ok + 发 iframe.workspace_changed
 *   - parent.close_request → 回 iframe.request_unload_confirm
 *
 * 设计原则：
 *   - **来源校验**：event.source !== parentWindow 一律忽略
 *   - **schema 校验**：用 isParentBridgeRequest 守卫，未知 kind 忽略
 *   - **依赖注入**：opfsRoot / workerHost / addMessageListener 都从外部注入，
 *     纯函数化便于单测
 */

import { writeFile } from '../shared/opfsAccess'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'
import {
  isParentBridgeRequest,
  type ParentBridgeRequest,
  type IframeBridgeRequest,
  type ParentBridgeResponse,
  type IframeSessionState,
} from '../shared/parentBridge'

export interface BridgeWorkerHost {
  writeFs: (path: string, bytes: ArrayBuffer) => Promise<{ path: string; bytes: number }>
  /** Worker 当前是否在跑 exec（用于 close_request 询问） */
  isBusy: () => boolean
}

export interface ParentBridgeClientOptions {
  sessionId: string
  parentWindow: Window
  opfsRoot: OpfsDirectoryHandle
  workerHost: BridgeWorkerHost
  /**
   * 注入消息源订阅器。生产环境传 (l) => { window.addEventListener('message', l); ... }
   * 测试环境传一个收集 listener 的桩。
   */
  addMessageListener: (listener: (e: MessageEvent) => void) => () => void
  /** iframe 与主站约定的目标 origin，用于 postMessage 第二参数；测试时传 '*' 即可 */
  parentTargetOrigin?: string
  onWorkspaceChanged?: (paths: string[]) => void | Promise<void>
  /**
   * 主站请求切换到新 session（开新分析时复用同一个 iframe/runtime）。
   * runtime 注入：重置 Python 状态 → 切 OPFS 目录 → 重连 SSE → 回放历史。
   * 返回 Promise：resolve 后主站会接着发 parent.import_csv（若有新数据）。
   */
  onSwitchSession?: (newSessionId: string) => Promise<void> | void
}

export interface ParentBridgeClient {
  /** 主动向主站推送 session 状态变化 */
  sendSessionState: (state: IframeSessionState, detail?: string) => void
  /**
   * 主动通知主站工作区文件发生变化（如 python_exec 落盘的 artifacts/）。
   * 主站可据此刷新外部文件视图 / 提示"产物可回导画布"。
   */
  notifyWorkspaceChanged: (paths: string[]) => void
  /** iframe 内部主动请求关闭笔记本 */
  requestParentClose: () => void
  /** 卸载：解除消息监听 */
  dispose: () => void
}

const cloneArrayBuffer = (buf: ArrayBuffer): ArrayBuffer => {
  const out = new ArrayBuffer(buf.byteLength)
  new Uint8Array(out).set(new Uint8Array(buf))
  return out
}

export const createParentBridgeClient = (
  options: ParentBridgeClientOptions,
): ParentBridgeClient => {
  const {
    sessionId,
    parentWindow,
    opfsRoot,
    workerHost,
    addMessageListener,
    parentTargetOrigin = '*',
    onWorkspaceChanged,
    onSwitchSession,
  } = options

  const send = (msg: IframeBridgeRequest | ParentBridgeResponse) => {
    parentWindow.postMessage(msg, parentTargetOrigin)
  }

  const respond = (
    requestId: string,
    ok: boolean,
    data?: unknown,
    error?: { code: string; message: string },
  ) => {
    const resp: ParentBridgeResponse = { kind: 'response', requestId, ok }
    if (data !== undefined) resp.data = data
    if (error) resp.error = error
    send(resp)
  }

  const handleHandshake = (req: Extract<ParentBridgeRequest, { kind: 'parent.handshake' }>) => {
    respond(req.requestId, true, { sessionId })
    send({ kind: 'iframe.ready', sessionId })
  }

  const handleImportCsv = async (
    req: Extract<ParentBridgeRequest, { kind: 'parent.import_csv' }>,
  ) => {
    const targetPath = `inputs/${req.filename}`
    const metaPath = 'inputs/upstream.meta.json'
    try {
      // 给 worker / OPFS 各保留一份独立 ArrayBuffer：postMessage transferable
      // 会让 buffer 失效，主线程内的两次写入需要分别拥有自己的副本。
      const opfsCopy = cloneArrayBuffer(req.buffer)
      await writeFile(opfsRoot, targetPath, opfsCopy)
      await writeFile(opfsRoot, metaPath, JSON.stringify(req.meta, null, 2))
      // 给 worker 的 buffer 不再克隆 —— 由 workerHost.writeFs 内部 transfer 给 worker
      const workerCopy = cloneArrayBuffer(req.buffer)
      await workerHost.writeFs(targetPath, workerCopy)
      respond(req.requestId, true, { path: targetPath, bytes: req.buffer.byteLength })
      const changedPaths = [targetPath, metaPath]
      send({ kind: 'iframe.workspace_changed', paths: changedPaths })
      void onWorkspaceChanged?.(changedPaths)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      respond(req.requestId, false, undefined, {
        code: classifyImportError(message),
        message,
      })
    }
  }

  const handleCloseRequest = (
    req: Extract<ParentBridgeRequest, { kind: 'parent.close_request' }>,
  ) => {
    send({
      kind: 'iframe.request_unload_confirm',
      hasUnsavedExec: workerHost.isBusy(),
    })
    respond(req.requestId, true)
  }

  const handleSwitchSession = async (
    req: Extract<ParentBridgeRequest, { kind: 'parent.switch_session' }>,
  ) => {
    try {
      await onSwitchSession?.(req.sessionId)
      respond(req.requestId, true, { sessionId: req.sessionId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      respond(req.requestId, false, undefined, {
        code: 'switch_session_failed',
        message,
      })
    }
  }

  const onMessage = (e: MessageEvent) => {
    if (e.source !== parentWindow) return
    if (!isParentBridgeRequest(e.data)) return
    const req = e.data as ParentBridgeRequest
    switch (req.kind) {
      case 'parent.handshake':
        handleHandshake(req)
        break
      case 'parent.import_csv':
        void handleImportCsv(req)
        break
      case 'parent.switch_session':
        void handleSwitchSession(req)
        break
      case 'parent.close_request':
        handleCloseRequest(req)
        break
    }
  }

  const off = addMessageListener(onMessage)
  send({ kind: 'iframe.ready', sessionId })

  return {
    sendSessionState: (state, detail) => {
      send({ kind: 'iframe.session_state', state, detail })
    },
    notifyWorkspaceChanged: (paths) => {
      if (paths.length === 0) return
      send({ kind: 'iframe.workspace_changed', paths })
    },
    requestParentClose: () => {
      send({
        kind: 'iframe.request_unload_confirm',
        hasUnsavedExec: workerHost.isBusy(),
      })
    },
    dispose: () => off(),
  }
}

const classifyImportError = (message: string): string => {
  if (/quota/i.test(message)) return 'quota_exceeded'
  if (/越界|workspace|顶级|out_of_workspace/i.test(message)) return 'path_out_of_workspace'
  if (/buffer/i.test(message)) return 'invalid_buffer'
  return 'import_failed'
}
