/**
 * parentBridgeClient 单测。
 *
 * 验证 iframe 侧的协议处理：
 *   - parent.handshake → 回 ok=true，且自动发出 iframe.ready
 *   - parent.import_csv → 写 OPFS、写 MEMFS、回 ok + 主动发 iframe.workspace_changed
 *   - parent.close_request → 回 hasUnsavedExec
 *   - 来源校验：event.source !== window.parent → 忽略
 *   - 非协议消息（kind 未知 / schema 不合法）→ 忽略，不抛错
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMemOpfsRoot, type MemDirectoryHandle } from '../../shared/__tests__/memOpfs'
import { ensureWorkspaceTree, readFile } from '../../shared/opfsAccess'
import {
  createParentBridgeClient,
  type BridgeWorkerHost,
} from '../parentBridgeClient'
import type {
  ParentBridgeRequest,
  IframeBridgeRequest,
  ParentBridgeResponse,
} from '../../shared/parentBridge'

interface FakeWorkerHost {
  writeFs: ReturnType<typeof vi.fn> & BridgeWorkerHost['writeFs']
  isBusy: BridgeWorkerHost['isBusy']
}

const makeFakeWorkerHost = (overrides?: Partial<FakeWorkerHost>): FakeWorkerHost => ({
  writeFs: vi.fn(async (_path: string, _bytes: ArrayBuffer) => ({
    path: 'inputs/upstream.csv',
    bytes: 0,
  })) as unknown as FakeWorkerHost['writeFs'],
  isBusy: () => false,
  ...overrides,
})

describe('parentBridgeClient', () => {
  let opfsRoot: MemDirectoryHandle
  let postedToParent: Array<IframeBridgeRequest | ParentBridgeResponse>
  let parentWindow: Window
  let listeners: Array<(e: MessageEvent) => void>

  beforeEach(async () => {
    opfsRoot = createMemOpfsRoot()
    await ensureWorkspaceTree(opfsRoot)
    postedToParent = []
    listeners = []

    parentWindow = {
      postMessage: (msg: IframeBridgeRequest | ParentBridgeResponse) => {
        postedToParent.push(msg)
      },
    } as unknown as Window
    // 不污染全局 window：把 addEventListener 抽成 host 参数
  })

  /**
   * 派发一个来自 parent 的消息事件。
   * 不用 new MessageEvent —— jsdom 会结构化克隆 data，
   * ArrayBuffer 跨 realm 后 instanceof 失效。
   */
  const deliver = (msg: unknown, from: Window = parentWindow) => {
    const evt = { data: msg, source: from } as unknown as MessageEvent
    listeners.forEach((l) => l(evt))
  }

  const buildClient = (workerHost: FakeWorkerHost = makeFakeWorkerHost()) => {
    return createParentBridgeClient({
      sessionId: 'sess-1',
      parentWindow,
      opfsRoot,
      workerHost,
      addMessageListener: (l) => {
        listeners.push(l)
        return () => {
          listeners = listeners.filter((x) => x !== l)
        }
      },
    })
  }

  describe('parent.handshake', () => {
    it('回 ok=true 并主动发 iframe.ready', () => {
      buildClient()

      const req: ParentBridgeRequest = {
        kind: 'parent.handshake',
        requestId: 'r-1',
        sessionId: 'sess-1',
        origin: 'http://localhost:5173',
      }
      deliver(req)

      const response = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'response',
      ) as ParentBridgeResponse
      expect(response).toBeDefined()
      expect(response.requestId).toBe('r-1')
      expect(response.ok).toBe(true)

      const ready = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'iframe.ready',
      ) as Extract<IframeBridgeRequest, { kind: 'iframe.ready' }>
      expect(ready).toBeDefined()
      expect(ready.sessionId).toBe('sess-1')
    })
  })

  describe('parent.import_csv', () => {
    it('写 OPFS + writeFs MEMFS + 回 ok + 发 workspace_changed', async () => {
      const fakeHost = makeFakeWorkerHost()
      buildClient(fakeHost)

      const csv = 'a,b,c\n1,2,3\n'
      const buffer = new TextEncoder().encode(csv).buffer
      deliver({
        kind: 'parent.import_csv',
        requestId: 'r-2',
        filename: 'upstream.csv',
        buffer,
        meta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'cleanup',
          rowCount: 1,
          columnCount: 3,
        },
      } satisfies ParentBridgeRequest)

      // 等异步链路完成（OPFS 写 + workerHost.writeFs）
      await new Promise((r) => setTimeout(r, 30))

      // 先看响应是不是成功；不成功则把错误带出来便于调试
      const response = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'response',
      ) as ParentBridgeResponse
      expect(response, '应有 response').toBeDefined()
      expect(
        response.ok,
        `期望 ok=true 但失败：code=${response.error?.code} msg=${response.error?.message}`,
      ).toBe(true)
      expect(response.requestId).toBe('r-2')

      // OPFS 落盘
      const opfsContent = await readFile(opfsRoot, 'inputs/upstream.csv')
      expect(opfsContent).toBe(csv)

      // MEMFS 写入
      expect(fakeHost.writeFs).toHaveBeenCalledTimes(1)
      const [path, bufArg] = fakeHost.writeFs.mock.calls[0]!
      expect(path).toBe('inputs/upstream.csv')
      expect(bufArg).toBeInstanceOf(ArrayBuffer)
      expect(new Uint8Array(bufArg as ArrayBuffer).byteLength).toBe(buffer.byteLength)

      // workspace_changed
      const changed = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'iframe.workspace_changed',
      ) as Extract<IframeBridgeRequest, { kind: 'iframe.workspace_changed' }>
      expect(changed.paths).toContain('inputs/upstream.csv')
    })

    it('OPFS 写入失败时回 ok=false 且不调 workerHost', async () => {
      // 给 root 替换一个会抛错的 getDirectoryHandle（仍 satisfies OpfsDirectoryHandle）
      const brokenRoot: typeof opfsRoot = Object.assign(
        Object.create(Object.getPrototypeOf(opfsRoot)),
        opfsRoot,
        {
          getDirectoryHandle: () => Promise.reject(new Error('quota_exceeded')),
          getFileHandle: () => Promise.reject(new Error('not used')),
        },
      )
      const fakeHost = makeFakeWorkerHost()
      createParentBridgeClient({
        sessionId: 'sess-1',
        parentWindow,
        opfsRoot: brokenRoot,
        workerHost: fakeHost,
        addMessageListener: (l) => {
          listeners.push(l)
          return () => {}
        },
      })

      deliver({
        kind: 'parent.import_csv',
        requestId: 'r-3',
        filename: 'upstream.csv',
        buffer: new ArrayBuffer(8),
        meta: {
          sourceKind: 'canvas-node',
          sourceLabel: '',
          rowCount: 0,
          columnCount: 0,
        },
      } satisfies ParentBridgeRequest)
      await new Promise((r) => setTimeout(r, 0))

      const response = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'response',
      ) as ParentBridgeResponse
      expect(response.ok).toBe(false)
      expect(response.error?.code).toBeDefined()
      expect(fakeHost.writeFs).not.toHaveBeenCalled()
    })
  })

  describe('parent.close_request', () => {
    it('返回 hasUnsavedExec=false 当 worker 不忙', () => {
      const fakeHost = makeFakeWorkerHost({ isBusy: () => false })
      buildClient(fakeHost)

      deliver({
        kind: 'parent.close_request',
        requestId: 'r-4',
        reason: 'user_clicked_close',
      } satisfies ParentBridgeRequest)

      const confirm = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'iframe.request_unload_confirm',
      ) as Extract<IframeBridgeRequest, { kind: 'iframe.request_unload_confirm' }>
      expect(confirm.hasUnsavedExec).toBe(false)
    })

    it('返回 hasUnsavedExec=true 当 worker 在跑', () => {
      const fakeHost = makeFakeWorkerHost({ isBusy: () => true })
      buildClient(fakeHost)

      deliver({
        kind: 'parent.close_request',
        requestId: 'r-5',
        reason: 'user_clicked_close',
      } satisfies ParentBridgeRequest)

      const confirm = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'iframe.request_unload_confirm',
      ) as Extract<IframeBridgeRequest, { kind: 'iframe.request_unload_confirm' }>
      expect(confirm.hasUnsavedExec).toBe(true)
    })
  })

  describe('来源校验', () => {
    it('event.source !== parentWindow → 忽略', () => {
      buildClient()
      const otherWindow = { postMessage: vi.fn() } as unknown as Window
      deliver(
        {
          kind: 'parent.handshake',
          requestId: 'r-6',
          sessionId: 'sess-1',
          origin: 'http://attacker',
        } satisfies ParentBridgeRequest,
        otherWindow,
      )
      expect(postedToParent).toHaveLength(0)
    })

    it('非协议消息 → 忽略，不抛错', () => {
      buildClient()
      deliver({ kind: 'parent.unknown', foo: 'bar' })
      deliver(null)
      deliver(42)
      expect(postedToParent).toHaveLength(0)
    })
  })

  describe('iframe.session_state', () => {
    it('暴露 sendSessionState 给上层使用', () => {
      const client = buildClient()
      client.sendSessionState('ready', '环境就绪')

      const evt = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'iframe.session_state',
      ) as Extract<IframeBridgeRequest, { kind: 'iframe.session_state' }>
      expect(evt.state).toBe('ready')
      expect(evt.detail).toBe('环境就绪')
    })
  })

  describe('notifyWorkspaceChanged', () => {
    it('有变更路径时发 iframe.workspace_changed', () => {
      const client = buildClient()
      postedToParent.length = 0 // 清掉构造时的 iframe.ready
      client.notifyWorkspaceChanged(['artifacts/plot.png', 'reports/sum.md'])

      const evt = postedToParent.find(
        (m) => 'kind' in m && m.kind === 'iframe.workspace_changed',
      ) as Extract<IframeBridgeRequest, { kind: 'iframe.workspace_changed' }>
      expect(evt).toBeDefined()
      expect(evt.paths).toEqual(['artifacts/plot.png', 'reports/sum.md'])
    })

    it('空数组不发消息（避免无意义刷新）', () => {
      const client = buildClient()
      postedToParent.length = 0
      client.notifyWorkspaceChanged([])
      expect(
        postedToParent.some(
          (m) => 'kind' in m && m.kind === 'iframe.workspace_changed',
        ),
      ).toBe(false)
    })
  })
})
