import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { FrontendBridge } from '../frontendBridge.js'
import type { ToolResult, SendToFrontendFn } from '../frontendBridge.js'
import type { PiAgentSafeToolResult } from '../../../ai/types.js'

const details = (summary = 'ok'): PiAgentSafeToolResult => ({
  ok: true,
  scope: 'global',
  executionId: null,
  status: 'success',
  summary,
  nodes: [],
  artifacts: [],
  warnings: [],
})

describe('FrontendBridge', () => {
  let bridge: FrontendBridge
  let sendToFrontend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendToFrontend = vi.fn()
    bridge = new FrontendBridge(sendToFrontend as unknown as SendToFrontendFn)
  })

  afterEach(() => {
    // 仅清理定时器，不调用 dispose（dispose 测试已单独覆盖）
    vi.useRealTimers()
  })

  describe('request', () => {
    it('调用 request 时应通过回调向发送工具执行事件到前端', () => {
      bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })

      expect(sendToFrontend).toHaveBeenCalledTimes(1)
      expect(sendToFrontend).toHaveBeenCalledWith({
        type: 'tool.execute',
        toolCallId: 'call_001',
        toolName: 'workflow_update_partial_workflow',
        params: { operations: [] },
      })
    })

    it('request 应返回一个 Promise', () => {
      const result = bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })

      expect(result).toBeInstanceOf(Promise)
    })

    it('调用 resolveResult 应 resolve 对应的 Promise 并返回正确结果', async () => {
      const expectedResult: ToolResult = {
        content: [{ type: 'text', text: '节点创建成功' }],
        details: details('节点创建成功'),
      }

      const promise = bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })
      const resolved = bridge.resolveResult('call_001', expectedResult)

      expect(resolved).toBe(true)
      await expect(promise).resolves.toEqual(expectedResult)
    })

    it('调用 resolveResult 对未知 toolCallId 应返回 false', () => {
      const result: ToolResult = {
        content: [{ type: 'text', text: 'ok' }],
        details: details(),
      }

      const resolved = bridge.resolveResult('unknown_call_id', result)
      expect(resolved).toBe(false)
    })

    it('对已知 toolCallId 调用 resolveResult 应返回 true', () => {
      bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })
      const result: ToolResult = {
        content: [{ type: 'text', text: 'ok' }],
        details: details(),
      }

      const resolved = bridge.resolveResult('call_001', result)
      expect(resolved).toBe(true)
    })

    it('调用 rejectResult 应 reject 对应的 Promise', async () => {
      const error = new Error('前端执行失败：节点类型不存在')

      const promise = bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })
      const rejected = bridge.rejectResult('call_001', error)

      expect(rejected).toBe(true)
      await expect(promise).rejects.toThrow('前端执行失败：节点类型不存在')
    })

    it('多个并发请求应独立解析，互不干扰', async () => {
      const result1: ToolResult = { content: [{ type: 'text', text: '结果1' }], details: details('结果1') }
      const result2: ToolResult = { content: [{ type: 'text', text: '结果2' }], details: details('结果2') }
      const result3: ToolResult = { content: [{ type: 'text', text: '结果3' }], details: details('结果3') }

      const p1 = bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })
      const p2 = bridge.request('call_002', 'workflow_update_partial_workflow', { operations: [] })
      const p3 = bridge.request('call_003', 'workflow_update_partial_workflow', { operations: [] })

      // 按不同顺序解析
      bridge.resolveResult('call_002', result2)
      bridge.resolveResult('call_003', result3)
      bridge.resolveResult('call_001', result1)

      await expect(p1).resolves.toEqual(result1)
      await expect(p2).resolves.toEqual(result2)
      await expect(p3).resolves.toEqual(result3)
    })

    it('pendingCount 应正确反映待处理请求数', () => {
      expect(bridge.pendingCount).toBe(0)

      bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })
      bridge.request('call_002', 'wf_executeWorkflow', { scope: 'workflow' })

      expect(bridge.pendingCount).toBe(2)

      bridge.resolveResult('call_001', { content: [{ type: 'text', text: 'ok' }], details: details() })
      expect(bridge.pendingCount).toBe(1)

      bridge.resolveResult('call_002', { content: [{ type: 'text', text: 'ok' }], details: details() })
      expect(bridge.pendingCount).toBe(0)
    })

    it('dispose 应 reject 所有待处理请求', async () => {
      const p1 = bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })
      const p2 = bridge.request('call_002', 'workflow_update_partial_workflow', { operations: [] })

      bridge.dispose()

      await expect(p1).rejects.toThrow('会话已关闭')
      await expect(p2).rejects.toThrow('会话已关闭')
      expect(bridge.pendingCount).toBe(0)
    })

    it('cancelPendingRequests 应 reject 所有待处理请求但保留 bridge 可继续使用', async () => {
      const p1 = bridge.request('call_001', 'workflow_update_partial_workflow', { operations: [] })
      const p2 = bridge.request('call_002', 'workflow_update_partial_workflow', { operations: [] })

      bridge.cancelPendingRequests('当前轮已取消')

      await expect(p1).rejects.toThrow('当前轮已取消')
      await expect(p2).rejects.toThrow('当前轮已取消')
      expect(bridge.pendingCount).toBe(0)

      const p3 = bridge.request('call_003', 'workflow_update_partial_workflow', { operations: [] })
      bridge.resolveResult('call_003', { content: [{ type: 'text', text: 'ok' }], details: details() })
      await expect(p3).resolves.toEqual({
        content: [{ type: 'text', text: 'ok' }],
        details: details(),
      })
    })
  })

  describe('超时处理', () => {
    it('超过指定超时时间后待处理请求应自动 reject', async () => {
      vi.useFakeTimers()

      const bridgeWithTimeout = new FrontendBridge(sendToFrontend as unknown as SendToFrontendFn, { timeoutMs: 5000 })

      const promise = bridgeWithTimeout.request('call_001', 'workflow_update_partial_workflow', { operations: [] })

      // 快进 5 秒
      vi.advanceTimersByTime(5000)

      await expect(promise).rejects.toThrow('等待前端执行超时')

      bridgeWithTimeout.dispose()
      vi.useRealTimers()
    })

    it('在超时前 resolve 应正常返回结果，不触发超时', async () => {
      vi.useFakeTimers()

      const bridgeWithTimeout = new FrontendBridge(sendToFrontend as unknown as SendToFrontendFn, { timeoutMs: 5000 })
      const expectedResult: ToolResult = {
        content: [{ type: 'text', text: '及时返回' }],
        details: details('及时返回'),
      }

      const promise = bridgeWithTimeout.request('call_001', 'workflow_update_partial_workflow', { operations: [] })

      // 在超时前解析
      vi.advanceTimersByTime(2000)
      bridgeWithTimeout.resolveResult('call_001', expectedResult)

      await expect(promise).resolves.toEqual(expectedResult)

      bridgeWithTimeout.dispose()
      vi.useRealTimers()
    })

    it('收到工具进度心跳后应续期超时计时器', async () => {
      vi.useFakeTimers()

      const bridgeWithTimeout = new FrontendBridge(sendToFrontend as unknown as SendToFrontendFn, { timeoutMs: 5000 })
      const promise = bridgeWithTimeout.request('call_001', 'wf_executeWorkflow', { scope: 'workflow' })

      vi.advanceTimersByTime(4000)
      expect(bridgeWithTimeout.touchRequest('call_001')).toBe(true)

      vi.advanceTimersByTime(4000)
      expect(bridgeWithTimeout.pendingCount).toBe(1)

      vi.advanceTimersByTime(1000)
      await expect(promise).rejects.toThrow('等待前端执行超时')

      bridgeWithTimeout.dispose()
      vi.useRealTimers()
    })
  })
})
