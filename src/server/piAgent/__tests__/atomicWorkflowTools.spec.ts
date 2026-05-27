import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAtomicWorkflowTools } from '../tools/atomicWorkflowTools.js'
import type { FrontendBridge, ToolResult } from '../frontendBridge.js'
import type { PiAgentSafeToolResult } from '../../../ai/types.js'

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
    resolve: (toolCallId: string, result: ToolResult) => {
      const entry = pending.get(toolCallId)
      if (entry) {
        entry.resolve(result)
        pending.delete(toolCallId)
      }
    },
    reject: (toolCallId: string, error: Error) => {
      const entry = pending.get(toolCallId)
      if (entry) {
        entry.reject(error)
        pending.delete(toolCallId)
      }
    },
  }
}

const successDetails = (summary: string): PiAgentSafeToolResult => ({
  ok: true,
  scope: 'global',
  executionId: null,
  status: 'success',
  summary,
  nodes: [],
  artifacts: [],
  warnings: [],
})

const successResult = (text: string, details: PiAgentSafeToolResult = successDetails(text)): ToolResult => ({
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

  it('仅暴露合并后的画布修改工具和执行工具', () => {
    const names = tools.map((tool) => tool.name)

    expect(names).toEqual([
      'workflow_update_partial_workflow',
      'wf_executeWorkflow',
    ])
    expect(names).not.toContain('wf_addNode')
    expect(names).not.toContain('wf_connectNodes')
  })

  it('将 workflow_update_partial_workflow 转发到 FrontendBridge 并返回前端结果', async () => {
    const onUpdate = vi.fn()
    const tool = tools.find((item) => item.name === 'workflow_update_partial_workflow')!

    const resultPromise = tool.execute(
      'call_update',
      {
        operations: [
          {
            id: 'node_manual_1',
            type: 'createNode',
            nodeType: 'manual-json-import',
            nodeLabel: '手动输入数据',
          },
          {
            id: 'move_1',
            type: 'moveNode',
            nodeRef: 'node_manual_1',
            position: { x: 100, y: 200 },
          },
        ],
        summary: '添加并移动节点',
      },
      undefined as any,
      onUpdate,
      undefined as any,
    )

    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: 'text', text: '正在等待前端画布应用增量修改...' }],
      details: { status: 'waiting_frontend_canvas' },
    })
    expect(mock.bridge.request).toHaveBeenCalledWith('call_update', 'workflow_update_partial_workflow', {
      operations: [
        {
          id: 'node_manual_1',
          type: 'createNode',
          nodeType: 'manual-json-import',
          nodeLabel: '手动输入数据',
        },
        {
          id: 'move_1',
          type: 'moveNode',
          nodeRef: 'node_manual_1',
          position: { x: 100, y: 200 },
        },
      ],
      summary: '添加并移动节点',
    })

    mock.resolve('call_update', successResult('画布修改成功'))
    const result = await resultPromise

    expect((result as any).content[0]?.text).toBe('画布修改成功')
    expect((result as any).details.summary).toBe('画布修改成功')
  })

  it('拒绝缺少必要字段的增量操作', async () => {
    const tool = tools.find((item) => item.name === 'workflow_update_partial_workflow')!

    await expect(tool.execute(
      'call_invalid',
      {
        operations: [
          {
            id: 'bad_1',
            type: 'connectNodes',
            sourceRef: 'node_a',
          },
        ],
      },
      undefined as any,
      undefined as any,
      undefined as any,
    )).rejects.toThrow('缺少 sourceRef 或 targetRef')
    expect(mock.bridge.request).not.toHaveBeenCalled()
  })

  it('将 wf_executeWorkflow 执行参数转发到 FrontendBridge', async () => {
    const onUpdate = vi.fn()
    const tool = tools.find((item) => item.name === 'wf_executeWorkflow')!

    const resultPromise = tool.execute(
      'call_execute',
      { scope: 'node', nodeId: 'node_debug_1', mode: 'rerun_upstream' },
      undefined as any,
      onUpdate,
      undefined as any,
    )

    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: 'text', text: '正在等待前端画布执行工作流...' }],
      details: { status: 'waiting_frontend_canvas' },
    })
    expect(mock.bridge.request).toHaveBeenCalledWith('call_execute', 'wf_executeWorkflow', {
      scope: 'node',
      nodeId: 'node_debug_1',
      mode: 'rerun_upstream',
    })

    mock.resolve('call_execute', successResult('节点调试完成'))
    await resultPromise
  })

  it('前端桥接失败时向上抛出错误，交由 Pi SDK 标记 isError', async () => {
    const tool = tools.find((item) => item.name === 'wf_executeWorkflow')!

    const resultPromise = tool.execute(
      'call_err',
      { scope: 'workflow' },
      undefined as any,
      undefined as any,
      undefined as any,
    )

    mock.reject('call_err', new Error('前端执行失败'))
    await expect(resultPromise).rejects.toThrow('前端执行失败')
  })
})
