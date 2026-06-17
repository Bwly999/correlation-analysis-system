/**
 * useNotebookSession：NotebookFrame.vue 的核心逻辑 composable。
 *
 * 流程：
 *   1) iframeRef 挂载后创建 ParentBridgeServer
 *   2) 监听 iframe 事件
 *      - iframe.ready → 标记 iframe 在线
 *      - 任一时刻一旦 bridge 已创建且 iframe 已 ready → 发 parent.handshake → 发 parent.import_csv
 *      - iframe.session_state → 同步 state
 *      - iframe.workspace_changed → 透传给上层
 *      - iframe.request_unload_confirm → 透传给上层
 *   3) 暴露 requestClose / dispose
 *
 * 单测覆盖：src/components/notebookAgent/__tests__/useNotebookSession.spec.ts
 */

import { ref, watch, type Ref } from 'vue'
import {
  createParentBridgeServer,
  type ParentBridgeServer,
  type ParentBridgeServerOptions,
} from './parentBridgeServer'
import type { CsvImport } from './dataSourceCsv'
import { httpClient } from '@/services/httpClient'
import type {
  IframeBridgeRequest,
  IframeSessionState,
  CloseReason,
  ParentBridgeRequest,
} from '../../notebook/shared/parentBridge'

export interface UseNotebookSessionOptions {
  iframeRef: Ref<HTMLIFrameElement | null>
  sessionId: string
  origin: string
  /** null = 空白笔记本（不导入数据直接进入），此时跳过 parent.import_csv */
  initialData: CsvImport | null
  /** 工厂注入；测试时传 mock。生产环境用 createParentBridgeServer */
  createBridge?: (opts: ParentBridgeServerOptions) => ParentBridgeServer
  onWorkspaceChanged?: (paths: string[]) => void
  onUnloadConfirm?: (hasUnsavedExec: boolean) => void
  /** 注入消息源订阅器；默认走 window.addEventListener */
  addMessageListener?: (l: (e: MessageEvent) => void) => () => void
  notifySessionReady?: (sessionId: string) => Promise<void>
}

export interface UseNotebookSession {
  state: Ref<IframeSessionState>
  requestClose: (reason: CloseReason) => Promise<void>
  dispose: () => void
}

const defaultListener = (l: (e: MessageEvent) => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('message', l)
  return () => window.removeEventListener('message', l)
}

const genId = (() => {
  let n = 0
  return () => `req-${Date.now()}-${++n}`
})()

const cloneTransferBuffer = (buffer: ArrayBuffer): ArrayBuffer => {
  const cloned = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(cloned).set(new Uint8Array(buffer))
  return cloned
}

const defaultNotifySessionReady = async (sessionId: string): Promise<void> => {
  const response = await httpClient.post(`/notebook-agent/sessions/${sessionId}/ready`)
  if (response.status >= 400) {
    throw new Error(`通知 Notebook 会话就绪失败：${response.status}`)
  }
}

export const useNotebookSession = (
  options: UseNotebookSessionOptions,
): UseNotebookSession => {
  const {
    iframeRef,
    sessionId,
    origin,
    initialData,
    createBridge = createParentBridgeServer,
    onWorkspaceChanged,
    onUnloadConfirm,
    addMessageListener = defaultListener,
    notifySessionReady = defaultNotifySessionReady,
  } = options

  const state = ref<IframeSessionState>('loading_pyodide')
  let bridge: ParentBridgeServer | null = null
  let imported = false
  let iframeReady = false
  let importInFlight: Promise<void> | null = null
  let pendingCloseRequest = false

  const handleEvent = (evt: IframeBridgeRequest) => {
    switch (evt.kind) {
      case 'iframe.ready':
        iframeReady = true
        void onIframeReady()
        break
      case 'iframe.session_state':
        state.value = evt.state
        break
      case 'iframe.workspace_changed':
        onWorkspaceChanged?.(evt.paths)
        break
      case 'iframe.request_unload_confirm':
        if (pendingCloseRequest) {
          pendingCloseRequest = false
          break
        }
        onUnloadConfirm?.(evt.hasUnsavedExec)
        break
    }
  }

  const onIframeReady = async () => {
    if (!bridge || imported || !iframeReady) return
    if (importInFlight) {
      await importInFlight
      return
    }

    importInFlight = (async () => {
      try {
        // handshake：通知 iframe 我们这边已经就绪
        const handshakeReq: ParentBridgeRequest = {
          kind: 'parent.handshake',
          requestId: genId(),
          sessionId,
          origin,
        }
        await bridge.request(handshakeReq)

        // 灌入 CSV（空白笔记本 initialData 为 null，跳过导入）
        if (initialData) {
          const buffer = cloneTransferBuffer(initialData.buffer)
          const importReq: ParentBridgeRequest = {
            kind: 'parent.import_csv',
            requestId: genId(),
            filename: 'upstream.csv',
            buffer,
            meta: initialData.meta,
          }
          await bridge.request(importReq, { transfer: [buffer] })
        }
        await notifySessionReady(sessionId)
        imported = true
      } catch (err) {
        // 失败时把状态置 failed，让上层 UI 提示
        state.value = 'failed'
        // eslint-disable-next-line no-console
        console.error('[useNotebookSession] handshake/import 失败：', err)
      } finally {
        importInFlight = null
      }
    })()

    await importInFlight
  }

  const ensureBridge = (iframe: HTMLIFrameElement) => {
    if (bridge) return
    bridge = createBridge({
      iframe,
      targetOrigin: origin || '*',
      addMessageListener,
      onEvent: handleEvent,
    })
    void onIframeReady()
  }

  watch(
    iframeRef,
    (frame) => {
      if (frame) ensureBridge(frame)
    },
    { immediate: true },
  )

  const requestClose = async (reason: CloseReason) => {
    if (!bridge) return
    pendingCloseRequest = true
    try {
      await bridge.request({
        kind: 'parent.close_request',
        requestId: genId(),
        reason,
      })
    } finally {
      pendingCloseRequest = false
    }
  }

  const dispose = () => {
    bridge?.dispose()
    bridge = null
  }

  return { state, requestClose, dispose }
}
