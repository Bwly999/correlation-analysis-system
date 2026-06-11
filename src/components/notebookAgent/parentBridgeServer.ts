/**
 * 主站 ↔ iframe 的 postMessage RPC 客户端（主站侧）。
 *
 * 与 src/notebook/runtime/parentBridgeClient.ts 配对：iframe 内是 client，主站这边是 server。
 *
 * 设计原则：
 *   - 来源校验：event.source !== iframe.contentWindow → 忽略
 *   - schema 校验：用 isIframeBridgeRequest / isParentBridgeResponse
 *   - 通过 requestId 配对响应
 *   - ArrayBuffer 用 transferable
 */

import {
  isIframeBridgeRequest,
  isParentBridgeResponse,
  type ParentBridgeRequest,
  type IframeBridgeRequest,
  type ParentBridgeResponse,
} from '../../notebook/shared/parentBridge'

export interface ParentBridgeServerOptions {
  iframe: HTMLIFrameElement
  /** iframe 同源时填具体 origin；'*' 仅在测试阶段使用 */
  targetOrigin: string
  /**
   * 注入消息源订阅器。生产环境传 (l) => { window.addEventListener('message', l); ... }
   * 测试环境传一个收集 listener 的桩。
   */
  addMessageListener: (l: (e: MessageEvent) => void) => () => void
  /** iframe 推送来的事件回调（已校验 schema） */
  onEvent?: (evt: IframeBridgeRequest) => void
}

export interface ParentBridgeServer {
  /** 发请求 + 等响应。timeoutMs 默认 30s */
  request: <T = unknown>(
    req: ParentBridgeRequest,
    options?: { transfer?: Transferable[]; timeoutMs?: number },
  ) => Promise<T>
  dispose: () => void
}

const isIframeSource = (e: MessageEvent, iframe: HTMLIFrameElement): boolean => {
  return e.source === iframe.contentWindow
}

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

export const createParentBridgeServer = (
  options: ParentBridgeServerOptions,
): ParentBridgeServer => {
  const { iframe, targetOrigin, addMessageListener, onEvent } = options
  const pending = new Map<string, PendingRequest>()

  const onMessage = (e: MessageEvent) => {
    if (!isIframeSource(e, iframe)) return
    const data = e.data
    if (isParentBridgeResponse(data)) {
      const resp = data as ParentBridgeResponse
      const p = pending.get(resp.requestId)
      if (!p) return
      pending.delete(resp.requestId)
      if (p.timer) clearTimeout(p.timer)
      if (resp.ok) {
        p.resolve(resp.data)
      } else {
        const err = new Error(resp.error?.message ?? '未知错误')
        ;(err as Error & { code?: string }).code = resp.error?.code
        p.reject(err)
      }
      return
    }
    if (isIframeBridgeRequest(data)) {
      onEvent?.(data as IframeBridgeRequest)
    }
  }

  const off = addMessageListener(onMessage)

  return {
    request: (req, opts) => {
      return new Promise((resolve, reject) => {
        const timeoutMs = opts?.timeoutMs ?? 30_000
        const timer =
          timeoutMs > 0
            ? setTimeout(() => {
                pending.delete(req.requestId)
                reject(new Error(`请求超时（${req.kind}）`))
              }, timeoutMs)
            : null
        pending.set(req.requestId, {
          resolve: resolve as (v: unknown) => void,
          reject,
          timer,
        })
        if (!iframe.contentWindow) {
          pending.delete(req.requestId)
          if (timer) clearTimeout(timer)
          reject(new Error('iframe.contentWindow 不可用'))
          return
        }
        iframe.contentWindow.postMessage(req, targetOrigin, opts?.transfer)
      })
    },
    dispose: () => {
      off()
      pending.forEach((p) => {
        if (p.timer) clearTimeout(p.timer)
        p.reject(new Error('parentBridgeServer 已销毁'))
      })
      pending.clear()
    },
  }
}
