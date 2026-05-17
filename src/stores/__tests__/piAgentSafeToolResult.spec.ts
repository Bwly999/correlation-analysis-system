import { describe, expect, it } from 'vitest'
import type { PiAgentSafeToolResult } from '@/ai/types'
import { buildPiAgentSafeToolResult } from '../piAgentSafeToolResult'

describe('piAgentSafeToolResult', () => {
  it('summarizes global table execution results without returning full rows', () => {
    const result = buildPiAgentSafeToolResult({
      toolName: 'wf_executeWorkflow',
      toolCallId: 'call_1',
      rawResult: {
        ok: true,
        scope: 'global',
        executionId: 'exec_1',
        status: 'success',
        dashboardSummary: {
          id: 'run_1',
          workflowName: '销量分析',
          status: 'success',
          startTime: 1,
          duration: 1200,
          executionTargetIds: ['node_table'],
          executionScopeNodeIds: ['node_table'],
          terminalNodeIds: ['node_table'],
        },
        nodeResults: [
          {
            id: 'node_table',
            label: '导入销售表',
            position: { x: 0, y: 0 },
            data: {
              label: '导入销售表',
              type: 'file-import',
              category: 'trigger',
              config: {},
              status: 'success',
              logs: [],
              output: {
                kind: 'table',
                payload: Array.from({ length: 5 }, (_, index) => ({
                  sales: 100 + index,
                  price: 20 + index,
                  note: `备注${index}`.repeat(80),
                  ...Object.fromEntries(
                    Array.from({ length: 210 }, (_inner, fieldIndex) => [`field_${fieldIndex}`, fieldIndex]),
                  ),
                })),
                meta: {
                  rowCount: 5,
                },
              },
            },
          },
        ],
      },
    })

    expect(result).toMatchObject({
      ok: true,
      scope: 'global',
      executionId: 'exec_1',
      status: 'success',
    } satisfies Partial<PiAgentSafeToolResult>)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toBeDefined()
    expect(result.nodes[0]).toMatchObject({
      nodeId: 'node_table',
      nodeLabel: '导入销售表',
      resultKind: 'table',
      rowCount: 5,
      columnCount: 213,
    })
    const firstNode = result.nodes[0]!
    expect(firstNode.sampleRows).toHaveLength(3)
    expect(Object.keys(firstNode.sampleRows?.[0] ?? {})).toHaveLength(200)
    expect(String(firstNode.sampleRows?.[0]?.note ?? '')).toContain('...')
    expect(result.summary).toContain('执行')
  })

  it('uses the same safe structure for single-node debug results', () => {
    const result = buildPiAgentSafeToolResult({
      toolName: 'wf_executeWorkflow',
      toolCallId: 'call_2',
      rawResult: {
        ok: true,
        scope: 'single',
        nodeId: 'node_report',
        status: 'success',
        output: {
          kind: 'report',
          payload: {
            title: '销量诊断结论',
            summary: '价格与销量存在显著相关性',
            keyMetrics: [
              { name: 'Pearson', value: 0.82 },
            ],
            findings: ['价格上涨时销量同步提升'],
            recommendations: ['继续验证折扣因素'],
          },
        },
      },
    })

    expect(result).toMatchObject({
      ok: true,
      scope: 'single',
      status: 'success',
    } satisfies Partial<PiAgentSafeToolResult>)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toBeDefined()
    expect(result.nodes[0]).toMatchObject({
      nodeId: 'node_report',
      resultKind: 'report',
      title: '销量诊断结论',
      summary: '价格与销量存在显著相关性',
      findings: ['价格上涨时销量同步提升'],
      recommendations: ['继续验证折扣因素'],
    })
    expect(result.summary).toContain('单节点')
  })
})
