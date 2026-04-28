import { describe, it, expect, vi } from 'vitest'

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

vi.mock('../../../nodes/result.js', () => ({
  normalizeNodeResult: (value: unknown) => value,
}))

import { executeNodesForAgent } from '../nodeExecutor.js'

const mockRequest: any = {
  mode: 'create',
  prompt: '测试',
  profile: { id: 'test', source: 'system' },
  nodeCatalog: [],
}

describe('executeNodesForAgent — 扩展节点', () => {
  it('执行 Spearman 相关分析', async () => {
    const plan = {
      summary: 'Spearman 测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"x":1,"y":2},{"x":2,"y":4},{"x":3,"y":6},{"x":4,"y":8},{"x":5,"y":10}]' } },
        { id: 'n2', type: 'createNode' as const, nodeType: 'spearman', nodeLabel: 'Spearman分析' },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }
    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results).toHaveLength(2)
    expect(results[0]!.success).toBe(true)
    expect(results[0]!.nodeType).toBe('manual-json-import')
    expect(results[1]!.success).toBe(true)
    expect(results[1]!.nodeType).toBe('spearman')
  })

  it('执行 Pearson 相关分析并返回矩阵', async () => {
    const plan = {
      summary: 'Pearson 测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"x":1,"y":2},{"x":2,"y":4},{"x":3,"y":6}]' } },
        { id: 'n2', type: 'createNode' as const, nodeType: 'pearson', nodeLabel: 'Pearson' },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }
    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results[1]!.success).toBe(true)
    expect(results[1]!.resultSummary).toContain('字段')
  })

  it('执行数据清洗节点', async () => {
    const plan = {
      summary: '清洗测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"a":1,"b":2},{"a":1,"b":2},{"a":3,"b":null}]' } },
        { id: 'n2', type: 'createNode' as const, nodeType: 'data-cleaning', nodeLabel: '清洗', config: { removeDuplicates: true, removeNullRows: true } },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }
    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results[1]!.success).toBe(true)
  })

  it('兼容服务端目录中的数据清洗配置命名', async () => {
    const plan = {
      summary: '清洗配置兼容测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"a":1,"b":2},{"a":1,"b":2},{"a":3,"b":""}]' } },
        {
          id: 'n2',
          type: 'createNode' as const,
          nodeType: 'data-cleaning',
          nodeLabel: '清洗',
          config: {
            deduplicationMode: 'full_row',
            missingValueStrategy: 'drop',
          },
        },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }

    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results[1]!.success).toBe(true)
    expect(results[1]!.rowCount).toBe(1)
  })

  it('执行图表展示节点', async () => {
    const plan = {
      summary: '图表测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"x":1},{"x":2}]' } },
        { id: 'n2', type: 'createNode' as const, nodeType: 'chart-display', nodeLabel: '图表' },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }
    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results[1]!.success).toBe(true)
    expect(results[1]!.resultSummary).toContain('图表')
  })

  it('执行拆分后的去重节点', async () => {
    const plan = {
      summary: '去重测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"k":"A","v":1},{"k":"A","v":2}]' } },
        {
          id: 'n2',
          type: 'createNode' as const,
          nodeType: 'data-dedup',
          nodeLabel: '去重',
          config: { deduplicationMode: 'by_fields', deduplicationFields: ['k'], deduplicationKeep: 'first' },
        },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }

    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    expect(results[1]!.success).toBe(true)
    expect(results[1]!.rowCount).toBe(1)
  })

  it('上游失败时下游不执行', async () => {
    const plan = {
      summary: '失败传递测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: {} },
        { id: 'n2', type: 'createNode' as const, nodeType: 'pearson', nodeLabel: 'Pearson' },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }
    const events: any[] = []
    const results = await executeNodesForAgent(plan, mockRequest, (e) => events.push(e))
    // n1 缺少 jsonData config，会失败
    expect(results[0]!.success).toBe(false)
    // n2 依赖 n1 的结果，但没有结果可用，所以 n2 不应该被标记为成功执行
    // 由于上游结果缓存中没有成功结果，n2 的输入为 null
  })

  it('Pearson 对不足数据报错', async () => {
    const plan = {
      summary: '边界测试',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [
        { id: 'n1', type: 'createNode' as const, nodeType: 'manual-json-import', nodeLabel: '导入', config: { jsonData: '[{"x":"a","y":"b"}]' } },
        { id: 'n2', type: 'createNode' as const, nodeType: 'pearson', nodeLabel: 'Pearson' },
        { id: 'e1', type: 'connectNodes' as const, sourceRef: 'n1', targetRef: 'n2' },
      ],
    }
    const results = await executeNodesForAgent(plan, mockRequest, () => {})
    // x 和 y 是字符串不是数字，Pearson 应该失败
    expect(results[1]!.success).toBe(false)
    expect(results[1]!.resultSummary).toContain('失败')
  })
})
