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

  it('summarizes oversized report outputs without returning full findings or metrics', () => {
    const result = buildPiAgentSafeToolResult({
      toolName: 'wf_executeWorkflow',
      toolCallId: 'call_3',
      rawResult: {
        ok: true,
        scope: 'single',
        nodeId: 'node_model',
        status: 'success',
        output: {
          kind: 'report',
          payload: {
            title: '模型诊断报告',
            summary: '价格、渠道和促销都值得优先验证。'.repeat(20),
            keyMetrics: Array.from({ length: 100 }, (_, index) => ({
              name: `metric_${index}`,
              value: index,
            })),
            findings: Array.from({ length: 50 }, (_, index) => `发现_${index}_${'结论'.repeat(20)}`),
            recommendations: Array.from({ length: 60 }, (_, index) => `建议_${index}_${'优化'.repeat(20)}`),
          },
        },
      },
    })

    expect(result.nodes).toHaveLength(1)
    const node = result.nodes[0]
    expect(node).toBeDefined()
    expect(node?.resultKind).toBe('report')
    expect(node?.keyMetrics).toHaveLength(5)
    expect(node?.findings).toHaveLength(5)
    expect(node?.recommendations).toHaveLength(5)
    expect(String(node?.summary ?? '').length).toBeLessThanOrEqual(123)
  })

  it('summarizes chart outputs without returning full axis or series payloads', () => {
    const result = buildPiAgentSafeToolResult({
      toolName: 'wf_executeWorkflow',
      toolCallId: 'call_4',
      rawResult: {
        ok: true,
        scope: 'single',
        nodeId: 'node_chart',
        status: 'success',
        output: {
          kind: 'chart',
          payload: {
            title: '重要性图表',
            xAxis: {
              data: Array.from({ length: 300 }, (_, index) => `feature_${index}`),
            },
            series: Array.from({ length: 12 }, (_, index) => ({
              name: `series_${index}`,
              type: 'bar',
              data: Array.from({ length: 500 }, (_inner, pointIndex) => pointIndex + index),
            })),
          },
        },
      },
    })

    expect(result.nodes).toHaveLength(1)
    const node = result.nodes[0]
    expect(node).toBeDefined()
    expect(node?.resultKind).toBe('chart')
    expect(node?.dimensions).toEqual({
      categories: 300,
      series: 12,
    })
    expect(node?.seriesSummary).toHaveLength(5)
    expect(node?.seriesSummary?.[0]).toEqual(
      expect.objectContaining({
        name: 'series_0',
        type: 'bar',
      }),
    )
  })
})
