import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAtomicWorkflowTools } from '../tools/atomicWorkflowTools.js'
import type { FrontendBridge, ToolResult } from '../frontendBridge.js'

/** 创建一个模拟的 FrontendBridge，允许测试控制 resolve/reject */
function createMockBridge() {
  const pending = new Map<string, { resolve: (r: ToolResult) => void; reject: (e: Error) => void }>()

  const mockBridge = {
    request: vi.fn(
      (toolCallId: string, _toolName: string, _params: Record<string, unknown>) =>
        new Promise<ToolResult>((resolve, reject) => {
          pending.set(toolCallId, { resolve, reject })
        }),
    ),
    resolveResult: vi.fn(),
    rejectResult: vi.fn(),
    get pendingCount() {
      return pending.size
    },
    dispose: vi.fn(),
  } as unknown as FrontendBridge

  return {
    bridge: mockBridge,
    /** 模拟前端成功返回结果 */
    resolve: (toolCallId: string, result: ToolResult) => {
      const entry = pending.get(toolCallId)
      if (entry) {
        entry.resolve(result)
        pending.delete(toolCallId)
      }
    },
    /** 模拟前端返回错误 */
    reject: (toolCallId: string, error: Error) => {
      const entry = pending.get(toolCallId)
      if (entry) {
        entry.reject(error)
        pending.delete(toolCallId)
      }
    },
  }
}

/** 成功结果工厂 */
const successResult = (text: string, details: Record<string, unknown> = {}): ToolResult => ({
  content: [{ type: 'text', text }],
  details,
})

describe('原子工作流工具 (atomicWorkflowTools)', () => {
  let mock: ReturnType<typeof createMockBridge>
  let tools: ReturnType<typeof createAtomicWorkflowTools>

  beforeEach(() => {
    mock = createMockBridge()
    tools = createAtomicWorkflowTools(mock.bridge)
    vi.useRealTimers()
  })

  describe('wf_addNode', () => {
    it('应将 addNode 调用转发到 FrontendBridge 并返回前端结果', async () => {
      const tool = tools.find((t) => t.name === 'wf_addNode')!
      expect(tool).toBeDefined()
      expect(tool.name).toBe('wf_addNode')

      const resultPromise = tool.execute(
        'call_001',
        { nodeType: 'manual-json-import', label: '测试', position: { x: 100, y: 200 } },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith(
        'call_001',
        'wf_addNode',
        { nodeType: 'manual-json-import', label: '测试', position: { x: 100, y: 200 } },
      )

      mock.resolve('call_001', successResult('节点创建成功', { nodeId: 'node_abc' }))
      const result = await resultPromise

      expect((result as any).content[0]?.text).toBe('节点创建成功')
      expect((result as any).details.nodeId).toBe('node_abc')
    })
  })

  describe('wf_connectNodes', () => {
    it('应将 connectNodes 调用转发到 FrontendBridge', async () => {
      const tool = tools.find((t) => t.name === 'wf_connectNodes')!
      expect(tool).toBeDefined()

      const resultPromise = tool.execute(
        'call_002',
        { sourceId: 'node_a', targetId: 'node_b' },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith('call_002', 'wf_connectNodes', {
        sourceId: 'node_a',
        targetId: 'node_b',
      })

      mock.resolve('call_002', successResult('连线创建成功', { edgeId: 'edge_001' }))
      const result = await resultPromise

      expect((result as any).details.edgeId).toBe('edge_001')
    })
  })

  describe('wf_updateNodeConfig', () => {
    it('应将 updateNodeConfig 调用转发到 FrontendBridge', async () => {
      const tool = tools.find((t) => t.name === 'wf_updateNodeConfig')!

      const resultPromise = tool.execute(
        'call_003',
        { nodeId: 'node_a', config: { param1: 'value1' } },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith('call_003', 'wf_updateNodeConfig', {
        nodeId: 'node_a',
        config: { param1: 'value1' },
      })

      mock.resolve('call_003', successResult('配置已更新'))
      await resultPromise
    })
  })

  describe('wf_renameNode', () => {
    it('应将 renameNode 调用转发到 FrontendBridge', async () => {
      const tool = tools.find((t) => t.name === 'wf_renameNode')!

      const resultPromise = tool.execute(
        'call_004',
        { nodeId: 'node_a', label: '新名称' },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith('call_004', 'wf_renameNode', {
        nodeId: 'node_a',
        label: '新名称',
      })

      mock.resolve('call_004', successResult('节点已重命名'))
      await resultPromise
    })
  })

  describe('wf_removeNode', () => {
    it('应将 removeNode 调用转发到 FrontendBridge', async () => {
      const tool = tools.find((t) => t.name === 'wf_removeNode')!

      const resultPromise = tool.execute(
        'call_005',
        { nodeId: 'node_a' },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith('call_005', 'wf_removeNode', {
        nodeId: 'node_a',
      })

      mock.resolve('call_005', successResult('节点已删除'))
      await resultPromise
    })
  })

  describe('wf_disconnectEdge', () => {
    it('应将 disconnectEdge 调用转发到 FrontendBridge', async () => {
      const tool = tools.find((t) => t.name === 'wf_disconnectEdge')!

      const resultPromise = tool.execute(
        'call_006',
        { edgeId: 'edge_001' },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith('call_006', 'wf_disconnectEdge', {
        edgeId: 'edge_001',
      })

      mock.resolve('call_006', successResult('连线已断开'))
      await resultPromise
    })
  })

  describe('wf_moveNode', () => {
    it('应将 moveNode 调用转发到 FrontendBridge', async () => {
      const tool = tools.find((t) => t.name === 'wf_moveNode')!

      const resultPromise = tool.execute(
        'call_007',
        { nodeId: 'node_a', position: { x: 500, y: 300 } },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith('call_007', 'wf_moveNode', {
        nodeId: 'node_a',
        position: { x: 500, y: 300 },
      })

      mock.resolve('call_007', successResult('节点已移动'))
      await resultPromise
    })
  })

  describe('wf_executeWorkflow', () => {
    it('应将 executeWorkflow 调用转发到 FrontendBridge', async () => {
      const tool = tools.find((t) => t.name === 'wf_executeWorkflow')!

      const resultPromise = tool.execute(
        'call_008',
        { nodeIds: ['node_a', 'node_b'] },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      expect(mock.bridge.request).toHaveBeenCalledWith('call_008', 'wf_executeWorkflow', {
        nodeIds: ['node_a', 'node_b'],
      })

      mock.resolve('call_008', successResult('工作流执行完成'))
      await resultPromise
    })
  })

  describe('所有工具应覆盖所有操作类型', () => {
    it('应包含 8 个原子操作工具', () => {
      const names = tools.map((t) => t.name)
      expect(names).toContain('wf_addNode')
      expect(names).toContain('wf_connectNodes')
      expect(names).toContain('wf_updateNodeConfig')
      expect(names).toContain('wf_renameNode')
      expect(names).toContain('wf_removeNode')
      expect(names).toContain('wf_disconnectEdge')
      expect(names).toContain('wf_moveNode')
      expect(names).toContain('wf_executeWorkflow')
      expect(tools).toHaveLength(8)
    })

    it('每个工具执行错误时应返回错误结果', async () => {
      const tool = tools.find((t) => t.name === 'wf_addNode')!

      const resultPromise = tool.execute(
        'call_err',
        { nodeType: 'unknown' },
        undefined as any,
        undefined as any,
        undefined as any,
      )

      mock.reject('call_err', new Error('未找到节点定义: unknown'))
      const result = await resultPromise

      expect((result as any).content[0]?.text).toContain('未找到节点定义')
    })
  })
})
