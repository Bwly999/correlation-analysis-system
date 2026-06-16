/**
 * parentBridgeServer 单测。
 *
 * 用 FakeIframe 驱动主站 ↔ iframe 的 postMessage 协议：
 *   - request → 收到合法 response → resolve 数据
 *   - request → 收到 ok=false response → reject 带 code
 *   - request → 超时 → reject
 *   - 来源不匹配（event.source !== iframe.contentWindow）→ 忽略
 *   - 收到 iframe 事件（iframe.ready / workspace_changed）→ 触发 onEvent
 *   - 透传 transferable
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isReactive, reactive } from 'vue'
import { createParentBridgeServer } from '../parentBridgeServer'
import type {
  ParentBridgeRequest,
  ParentBridgeResponse,
  IframeBridgeRequest,
} from '../../../notebook/shared/parentBridge'

interface FakeContentWindow {
  postMessage: ReturnType<typeof vi.fn>
}

interface FakeIframe {
  contentWindow: FakeContentWindow
}

describe('parentBridgeServer', () => {
  let iframe: FakeIframe
  let listeners: Array<(e: MessageEvent) => void>
  let server: ReturnType<typeof createParentBridgeServer>
  let onEvent: ReturnType<typeof vi.fn<(evt: import('../../../notebook/shared/parentBridge').IframeBridgeRequest) => void>>

  beforeEach(() => {
    iframe = { contentWindow: { postMessage: vi.fn() } }
    listeners = []
    onEvent = vi.fn()
  })

  const build = () => {
    server = createParentBridgeServer({
      iframe: iframe as unknown as HTMLIFrameElement,
      targetOrigin: '*',
      addMessageListener: (l) => {
        listeners.push(l)
        return () => {
          listeners = listeners.filter((x) => x !== l)
        }
      },
      onEvent,
    })
    return server
  }

  /** 让 iframe "回送" 一条消息 */
  const replyFromIframe = (
    msg: ParentBridgeResponse | IframeBridgeRequest,
    fromContentWindow: FakeContentWindow = iframe.contentWindow,
  ) => {
    const evt = { data: msg, source: fromContentWindow } as unknown as MessageEvent
    listeners.forEach((l) => l(evt))
  }

  describe('request / response', () => {
    it('收到 ok=true response → resolve data', async () => {
      build()
      const req: ParentBridgeRequest = {
        kind: 'parent.handshake',
        requestId: 'r-1',
        sessionId: 's-1',
        origin: 'http://localhost',
      }
      const promise = server.request(req)
      // 等 listener 注册到位
      await Promise.resolve()
      replyFromIframe({
        kind: 'response',
        requestId: 'r-1',
        ok: true,
        data: { sessionId: 's-1' },
      })
      await expect(promise).resolves.toEqual({ sessionId: 's-1' })
    })

    it('收到 ok=false response → reject 带 code', async () => {
      build()
      const promise = server.request({
        kind: 'parent.import_csv',
        requestId: 'r-2',
        filename: 'x.csv',
        buffer: new ArrayBuffer(8),
        meta: { sourceKind: 'canvas-node', sourceLabel: '', rowCount: 0, columnCount: 0 },
      })
      await Promise.resolve()
      replyFromIframe({
        kind: 'response',
        requestId: 'r-2',
        ok: false,
        error: { code: 'quota_exceeded', message: '配额超限' },
      })
      await expect(promise).rejects.toMatchObject({
        message: '配额超限',
        code: 'quota_exceeded',
      })
    })

    it('超时 → reject', async () => {
      vi.useFakeTimers()
      build()
      const promise = server.request(
        {
          kind: 'parent.handshake',
          requestId: 'r-3',
          sessionId: 's',
          origin: 'http://localhost',
        },
        { timeoutMs: 100 },
      )
      vi.advanceTimersByTime(150)
      await expect(promise).rejects.toThrow(/超时/)
      vi.useRealTimers()
    })

    it('contentWindow 不可用 → reject', async () => {
      iframe.contentWindow = null as unknown as FakeContentWindow
      build()
      await expect(
        server.request({
          kind: 'parent.handshake',
          requestId: 'r-4',
          sessionId: 's',
          origin: 'http://localhost',
        }),
      ).rejects.toThrow(/contentWindow/)
    })

    it('postMessage 调用 + transferable 透传', async () => {
      build()
      const buf = new ArrayBuffer(8)
      void server.request(
        {
          kind: 'parent.import_csv',
          requestId: 'r-5',
          filename: 'x.csv',
          buffer: buf,
          meta: {
            sourceKind: 'canvas-node',
            sourceLabel: '',
            rowCount: 0,
            columnCount: 0,
          },
        },
        { transfer: [buf] },
      )
      await Promise.resolve()
      expect(iframe.contentWindow.postMessage).toHaveBeenCalledTimes(1)
      const [msg, origin, transfer] = iframe.contentWindow.postMessage.mock.calls[0]!
      expect((msg as ParentBridgeRequest).kind).toBe('parent.import_csv')
      expect(origin).toBe('*')
      expect(transfer).toEqual([buf])
    })

    it('parent.import_csv 会把 meta 归一化为可结构化克隆的普通对象', async () => {
      build()
      const promise = server.request(
        {
          kind: 'parent.import_csv',
          requestId: 'r-5b',
          filename: 'x.csv',
          buffer: new ArrayBuffer(8),
          meta: reactive({
            sourceKind: 'canvas-node',
            sourceLabel: '字段筛选',
            rowCount: 5,
            columnCount: 4,
          }),
        },
        { timeoutMs: 0 },
      )
      await Promise.resolve()

      const [msg] = iframe.contentWindow.postMessage.mock.calls[0]!
      expect((msg as ParentBridgeRequest).kind).toBe('parent.import_csv')
      expect(isReactive((msg as Extract<ParentBridgeRequest, { kind: 'parent.import_csv' }>).meta)).toBe(false)
      expect(() => structuredClone(msg)).not.toThrow()

      server.dispose()
      await expect(promise).rejects.toThrow(/销毁/)
    })

    it('postMessage 同步抛错 → 直接 reject', async () => {
      iframe.contentWindow.postMessage.mockImplementation(() => {
        throw new Error('clone failed')
      })
      build()
      await expect(
        server.request({
          kind: 'parent.handshake',
          requestId: 'r-5c',
          sessionId: 's-1',
          origin: 'http://localhost',
        }),
      ).rejects.toThrow(/clone failed/)
    })
  })

  describe('来源校验', () => {
    it('event.source !== iframe.contentWindow → 忽略', async () => {
      build()
      const promise = server.request({
        kind: 'parent.handshake',
        requestId: 'r-6',
        sessionId: 's',
        origin: 'http://localhost',
      })
      const otherSource = { postMessage: vi.fn() }
      // 别的来源的合法响应也不算
      replyFromIframe(
        { kind: 'response', requestId: 'r-6', ok: true, data: { evil: true } },
        otherSource,
      )
      // 加超时让 promise 解出来
      const fast = await Promise.race([
        promise.then(() => 'resolved'),
        new Promise((r) => setTimeout(() => r('timeout'), 50)),
      ])
      expect(fast).toBe('timeout')
    })
  })

  describe('iframe 事件', () => {
    it('iframe.ready → 触发 onEvent', () => {
      build()
      replyFromIframe({ kind: 'iframe.ready', sessionId: 's-1' })
      expect(onEvent).toHaveBeenCalledWith({ kind: 'iframe.ready', sessionId: 's-1' })
    })

    it('iframe.workspace_changed → 触发 onEvent', () => {
      build()
      replyFromIframe({
        kind: 'iframe.workspace_changed',
        paths: ['inputs/upstream.csv'],
      })
      expect(onEvent).toHaveBeenCalledWith({
        kind: 'iframe.workspace_changed',
        paths: ['inputs/upstream.csv'],
      })
    })

    it('非协议消息 → 忽略，不抛错', () => {
      build()
      replyFromIframe({ kind: 'random' } as unknown as IframeBridgeRequest)
      expect(onEvent).not.toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('销毁后 pending 全 reject', async () => {
      build()
      const promise = server.request({
        kind: 'parent.handshake',
        requestId: 'r-9',
        sessionId: 's',
        origin: 'http://localhost',
      })
      server.dispose()
      await expect(promise).rejects.toThrow(/销毁/)
    })

    it('销毁后 listener 解除', () => {
      build()
      expect(listeners.length).toBe(1)
      server.dispose()
      expect(listeners.length).toBe(0)
    })
  })
})
