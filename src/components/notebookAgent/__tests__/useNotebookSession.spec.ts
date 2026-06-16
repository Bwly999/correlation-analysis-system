/**
 * useNotebookSession 单测。
 *
 * 该 composable 串起 NotebookFrame 的核心流程：
 *   1) iframe 挂载后 listener 装好
 *   2) iframe.ready → 自动 handshake → 灌 import_csv
 *   3) 接受外部触发的 close → 发 close_request → 等用户决定
 *   4) 暴露 sessionState
 *
 * 关键：composable 接收一个 createBridge 工厂，便于注入 mock。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useNotebookSession } from '../useNotebookSession'
import type {
  ParentBridgeServer,
  ParentBridgeServerOptions,
} from '../parentBridgeServer'
import type {
  IframeBridgeRequest,
  ParentBridgeRequest,
} from '../../../notebook/shared/parentBridge'

interface FakeBridge extends ParentBridgeServer {
  emitEvent: (evt: IframeBridgeRequest) => void
  posted: ParentBridgeRequest[]
  resolveNextRequest: (data?: unknown) => void
  rejectNextRequest: (err: Error) => void
}

const buildFakeBridge = (): {
  bridge: FakeBridge
  factory: (opts: ParentBridgeServerOptions) => FakeBridge
} => {
  const bridge = {
    posted: [] as ParentBridgeRequest[],
    request: vi.fn(),
    dispose: vi.fn(),
    emitEvent: () => undefined,
    resolveNextRequest: () => undefined,
    rejectNextRequest: () => undefined,
  } as unknown as FakeBridge

  let pendingResolve: ((v: unknown) => void) | null = null
  let pendingReject: ((e: Error) => void) | null = null

  bridge.request = vi.fn(async (req: ParentBridgeRequest) => {
    bridge.posted.push(req)
    return new Promise((resolve, reject) => {
      pendingResolve = resolve as (v: unknown) => void
      pendingReject = reject
    })
  }) as unknown as ParentBridgeServer['request']

  bridge.resolveNextRequest = (data) => {
    pendingResolve?.(data)
    pendingResolve = null
    pendingReject = null
  }
  bridge.rejectNextRequest = (err) => {
    pendingReject?.(err)
    pendingResolve = null
    pendingReject = null
  }

  return {
    bridge,
    factory: (opts) => {
      bridge.emitEvent = (evt) => opts.onEvent?.(evt)
      return bridge
    },
  }
}

describe('useNotebookSession', () => {
  let iframeRef: ReturnType<typeof ref<HTMLIFrameElement | null>>
  let fake: ReturnType<typeof buildFakeBridge>

  beforeEach(() => {
    iframeRef = ref<HTMLIFrameElement | null>(null) as unknown as ReturnType<
      typeof ref<HTMLIFrameElement | null>
    >
    fake = buildFakeBridge()
  })

  const mountIframe = () => {
    iframeRef.value = {
      contentWindow: { postMessage: vi.fn() },
    } as unknown as HTMLIFrameElement
  }

  const useSession = (init?: Partial<Parameters<typeof useNotebookSession>[0]>) => {
    return useNotebookSession({
      iframeRef: iframeRef as Parameters<typeof useNotebookSession>[0]['iframeRef'],
      sessionId: 'sess-1',
      origin: 'http://localhost:5173',
      initialData: {
        buffer: new TextEncoder().encode('a,b\n1,2').buffer as ArrayBuffer,
        meta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'cleanup',
          rowCount: 1,
          columnCount: 2,
        },
      },
      createBridge: fake.factory as unknown as (
        opts: ParentBridgeServerOptions,
      ) => ParentBridgeServer,
      notifySessionReady: vi.fn().mockResolvedValue(undefined),
      ...init,
    })
  }

  it('iframe 未挂载时 sessionState=loading_pyodide 且不创建 bridge', async () => {
    const session = useSession()
    expect(session.state.value).toBe('loading_pyodide')
    expect(fake.bridge.request).not.toHaveBeenCalled()
  })

  it('仅挂载 iframe 但未收到 iframe.ready 时，不会提前 handshake', async () => {
    useSession()
    mountIframe()
    await nextTick()
    expect(fake.bridge.request).not.toHaveBeenCalled()
  })

  it('iframe 挂载后创建 bridge；收到 iframe.ready 后发 handshake → import_csv', async () => {
    const notifySessionReady = vi.fn().mockResolvedValue(undefined)
    const session = useSession({ notifySessionReady })
    mountIframe()
    await nextTick()

    // 模拟 iframe.ready 事件
    fake.bridge.emitEvent({ kind: 'iframe.ready', sessionId: 'sess-1' })
    await nextTick()

    // 第一笔请求是 handshake
    expect(fake.bridge.posted[0]?.kind).toBe('parent.handshake')

    // resolve handshake
    fake.bridge.resolveNextRequest({ sessionId: 'sess-1' })
    await Promise.resolve()
    await Promise.resolve()

    // 第二笔请求是 import_csv
    expect(fake.bridge.posted[1]?.kind).toBe('parent.import_csv')
    fake.bridge.resolveNextRequest({ path: 'inputs/upstream.csv', bytes: 8 })
    await Promise.resolve()
    await nextTick()
    void notifySessionReady
    void session // 触发 watcher 的话用得到
  })

  it('import_csv 成功后才通知 session ready', async () => {
    const notifySessionReady = vi.fn().mockResolvedValue(undefined)
    useSession({ notifySessionReady })
    mountIframe()
    await nextTick()

    fake.bridge.emitEvent({ kind: 'iframe.ready', sessionId: 'sess-1' })
    await nextTick()
    expect(notifySessionReady).not.toHaveBeenCalled()

    fake.bridge.resolveNextRequest({ sessionId: 'sess-1' })
    await Promise.resolve()
    await Promise.resolve()
    expect(notifySessionReady).not.toHaveBeenCalled()

    fake.bridge.resolveNextRequest({ path: 'inputs/upstream.csv', bytes: 8 })
    await Promise.resolve()
    await Promise.resolve()

    await vi.waitFor(() => {
      expect(notifySessionReady).toHaveBeenCalledWith('sess-1')
    })
  })

  it('import_csv 失败时不会通知 session ready，且状态转为 failed', async () => {
    const notifySessionReady = vi.fn().mockResolvedValue(undefined)
    const session = useSession({ notifySessionReady })
    mountIframe()
    await nextTick()

    fake.bridge.emitEvent({ kind: 'iframe.ready', sessionId: 'sess-1' })
    await nextTick()

    fake.bridge.resolveNextRequest({ sessionId: 'sess-1' })
    await Promise.resolve()
    await Promise.resolve()

    fake.bridge.rejectNextRequest(new Error('导入失败'))
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(notifySessionReady).not.toHaveBeenCalled()
    expect(session.state.value).toBe('failed')
  })

  it('重复收到 iframe.ready 时，不会重复发起 import_csv', async () => {
    useSession()
    mountIframe()
    await nextTick()

    fake.bridge.emitEvent({ kind: 'iframe.ready', sessionId: 'sess-1' })
    await nextTick()
    fake.bridge.resolveNextRequest({ sessionId: 'sess-1' })
    await Promise.resolve()

    fake.bridge.emitEvent({ kind: 'iframe.ready', sessionId: 'sess-1' })
    await nextTick()

    const importCalls = fake.bridge.posted.filter((req) => req.kind === 'parent.import_csv')
    expect(importCalls).toHaveLength(1)
  })

  it('iframe.session_state=ready → state 同步更新', async () => {
    const session = useSession()
    mountIframe()
    await nextTick()
    fake.bridge.emitEvent({ kind: 'iframe.session_state', state: 'ready' })
    await nextTick()
    expect(session.state.value).toBe('ready')
  })

  it('requestClose() 发 close_request', async () => {
    const session = useSession()
    mountIframe()
    await nextTick()
    void session.requestClose('user_clicked_close')
    await nextTick()
    const closeReq = fake.bridge.posted.find((r) => r.kind === 'parent.close_request')
    expect(closeReq).toBeDefined()
  })

  it('dispose 时释放 bridge', async () => {
    const session = useSession()
    mountIframe()
    await nextTick()
    session.dispose()
    expect(fake.bridge.dispose).toHaveBeenCalled()
  })
})
