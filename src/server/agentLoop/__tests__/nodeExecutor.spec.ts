import { describe, it, expect, vi } from 'vitest'
import { executeNodesForAgent } from '../nodeExecutor.js'

// Mock inspectionRuntimeShared
vi.mock('../../workflowAi/inspectionRuntimeShared.js', () => ({
  INSPECTABLE_NODE_DEFINITIONS: new Map([
    ['manual-json-import', {
      name: 'manual-json-import',
      displayName: '手动输入数据',
      category: 'trigger',
      properties: [],
      execute: (_input: unknown, config: Record<string, unknown>) => {
        const data = config.jsonData
        if (typeof data !== 'string') throw new Error('需要 jsonData')
        const rows = JSON.parse(data)
        return { kind: 'table', payload: Array.isArray(rows) ? rows : [rows] }
      },
    }],
  ]),
}))

// Mock normalizeNodeResult
vi.mock('../../../nodes/result.js', () => ({
  normalizeNodeResult: (value: unknown) => value,
}))

describe('executeNodesForAgent', () => {
  const mockRequest = {
    mode: 'create' as const,
    prompt: '测试',
    profile: { id: 'test', source: 'system' as const },
    nodeCatalog: [],
  }

  it('执行 manual-json-import 节点', async () => {
    const plan = {
      summary: '测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        {
          id: 'n1',
          type: 'createNode' as const,
          nodeType: 'manual-json-import',
          nodeLabel: '数据导入',
          config: { jsonData: '[{"x":1},{"x":2}]' },
        },
      ],
    }

    const events: any[] = []
    const results = await executeNodesForAgent(plan, mockRequest, (e) => events.push(e))

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].nodeType).toBe('manual-json-import')
    expect(results[0].rowCount).toBe(2)
  })

  it('报告不支持的节点类型', async () => {
    const plan = {
      summary: '测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        {
          id: 'n1',
          type: 'createNode' as const,
          nodeType: 'unknown-node',
          nodeLabel: '未知节点',
        },
      ],
    }

    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toBe('unsupported_node_type')
    expect(results[0].resultSummary).toContain('不支持')
  })

  it('按拓扑序执行多个节点', async () => {
    const plan = {
      summary: '测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"x":1}]' } },
        { id: 'n2', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入2', config: { jsonData: '[{"y":2}]' } },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }

    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results).toHaveLength(2)
    // n1 应该先执行（无上游依赖）
    expect(results[0].nodeId).toBe('n1')
    expect(results[1].nodeId).toBe('n2')
  })

  it('发送节点执行事件', async () => {
    const plan = {
      summary: '测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '数据', config: { jsonData: '[{"a":1}]' } },
      ],
    }

    const events: any[] = []
    await executeNodesForAgent(plan, mockRequest, (e) => events.push(e))

    const types = events.map((e) => e.type)
    expect(types).toContain('node_execution_started')
    expect(types).toContain('node_execution_completed')
  })
})
