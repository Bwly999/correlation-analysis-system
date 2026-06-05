import { describe, expect, it } from 'vitest'
import {
  buildSanitizedWorkflowSnapshot,
  clampJsonSize,
  countUtf8Bytes,
  sanitizeWorkflowSnapshot,
} from '../piAgentSanitize'

describe('piAgentSanitize', () => {
  it('sanitizes config and object outputs without leaking full rows', () => {
    const hugeJson = JSON.stringify(
      Array.from({ length: 2000 }, (_, index) => ({
        feature: index,
        target: index * 2,
        note: `说明_${index}`.repeat(20),
      })),
    )

    const snapshot = sanitizeWorkflowSnapshot([
      {
        id: 'node_1',
        type: 'custom',
        label: '手动输入数据',
        position: { x: 100, y: 200 },
        selected: true,
        dragging: false,
        data: {
          label: '手动输入数据',
          type: 'manual-json-import',
          category: 'trigger',
          config: {
            jsonData: hugeJson,
            keepField: 'target',
          },
          status: 'success',
          error: undefined,
          logs: ['a'.repeat(500)],
          output: {
            kind: 'json',
            payload: {
              rows: Array.from({ length: 2000 }, (_, index) => ({
                id: index,
                value: `值_${index}`,
              })),
              sourceData: Array.from({ length: 2000 }, (_, index) => ({
                id: index,
                nested: { score: index },
              })),
              summary: '保留摘要',
            },
          },
        },
      },
    ])

    expect(snapshot).toHaveLength(1)
    const node = snapshot[0] as Record<string, any>

    expect(node.selected).toBeUndefined()
    expect(node.dragging).toBeUndefined()
    expect(node.data.config.keepField).toBe('target')
    expect(node.data.config.jsonData).toMatchObject({
      _truncated: true,
      _type: 'string',
    })
    expect(typeof node.data.config.jsonData.preview).toBe('string')
    expect(node.data.output.payload.rows).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 2000,
    })
    expect(node.data.output.payload.sourceData).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 2000,
    })
    expect(node.data.output.payload.summary).toBe('保留摘要')
    expect(node.data.logs).toHaveLength(1)
    expect(String(node.data.logs[0]).length).toBeLessThanOrEqual(201)
  })

  it('limits tabular data to 3 rows and 200 columns, including grouped tables', () => {
    const wideRow = Object.fromEntries(
      Array.from({ length: 260 }, (_, index) => [`field_${index}`, `value_${index}`]),
    )

    const snapshot = sanitizeWorkflowSnapshot([
      {
        id: 'node_table',
        type: 'custom',
        label: '宽表节点',
        position: { x: 0, y: 0 },
        selected: false,
        dragging: false,
        data: {
          label: '宽表节点',
          type: 'file-import',
          category: 'trigger',
          config: {},
          status: 'success',
          error: undefined,
          logs: [],
          output: {
            kind: 'tableCollection',
            payload: Array.from({ length: 6 }, (_, groupIndex) => ({
              name: `group_${groupIndex}`,
              data: Array.from({ length: 5 }, () => wideRow),
            })),
          },
        },
      },
    ])

    const node = snapshot[0] as Record<string, any>
    expect(node.data.output.payload.length).toBeGreaterThan(0)
    expect(node.data.output.payload.length).toBeLessThanOrEqual(5)
    expect(node.data.output._truncated).toBe(true)
    expect(node.data.output.payload[0].data).toHaveLength(3)
    expect(Object.keys(node.data.output.payload[0].data[0])).toHaveLength(200)
  })

  it('keeps snapshot structure while enforcing the 32KB UTF-8 limit', () => {
    const snapshot = sanitizeWorkflowSnapshot(
      Array.from({ length: 12 }, (_, index) => ({
        id: `node_${index}`,
        type: 'custom',
        label: `节点_${index}`,
        position: { x: index * 40, y: index * 20 },
        selected: false,
        dragging: false,
        data: {
          label: `节点_${index}`,
          type: 'manual-json-import',
          category: 'trigger',
          config: {
            jsonData: '数据'.repeat(12000),
          },
          status: 'success',
          error: undefined,
          logs: [`日志_${index}`.repeat(2000)],
          output: {
            kind: 'table',
            payload: Array.from({ length: 300 }, () =>
              Object.fromEntries(
                Array.from({ length: 260 }, (_inner, fieldIndex) => [
                  `field_${fieldIndex}`,
                  `值_${index}_${fieldIndex}`.repeat(10),
                ]),
              )),
          },
        },
      })),
    )

    const serialized = JSON.stringify(snapshot)
    expect(countUtf8Bytes(serialized)).toBeLessThanOrEqual(32768)
    expect(snapshot).toHaveLength(12)
    snapshot.forEach((node) => {
      const item = node as Record<string, any>
      expect(item.id).toBeTruthy()
      expect(item.data.label).toBeTruthy()
    })
  })

  it('clampJsonSize respects UTF-8 byte length', () => {
    const value = {
      text: '中文'.repeat(1000),
      nested: {
        note: '保留',
      },
    }

    const result = clampJsonSize(value, 256)
    expect(countUtf8Bytes(JSON.stringify(result))).toBeLessThanOrEqual(256)
  })

  it('sanitizes edges down to structural fields only', () => {
    const snapshot = buildSanitizedWorkflowSnapshot({
      name: '测试工作流',
      nodes: [],
      edges: [
        {
          id: 'edge_1',
          source: 'node_1',
          target: 'node_2',
          sourceHandle: 'out',
          targetHandle: 'in',
          data: { huge: 'x'.repeat(1000) },
          style: { stroke: 'red' },
          markerEnd: 'arrow',
        } as any,
      ],
    })

    expect(snapshot.edges).toEqual([
      {
        id: 'edge_1',
        source: 'node_1',
        target: 'node_2',
        sourceHandle: 'out',
        targetHandle: 'in',
      },
    ])
  })

  it('sanitizes aggregated multi-node output shaped like an array of objects', () => {
    const groupedRows = Array.from({ length: 300 }, (_, index) => ({
      sourceNodeId: `node_${index % 3}`,
      sourceNodeLabel: `来源_${index % 3}`,
      metric: index,
      note: `聚合说明_${index}`.repeat(10),
      ...Object.fromEntries(
        Array.from({ length: 240 }, (_inner, fieldIndex) => [`field_${fieldIndex}`, `${index}_${fieldIndex}`]),
      ),
    }))

    const snapshot = buildSanitizedWorkflowSnapshot({
      name: '聚合测试',
      nodes: [
        {
          id: 'node_merge',
          type: 'custom',
          label: '数据聚合',
          position: { x: 0, y: 0 },
          selected: false,
          dragging: false,
          data: {
            label: '数据聚合',
            type: 'data-merge',
            category: 'action',
            config: {
              mode: 'append',
              sources: ['node_a', 'node_b', 'node_c'],
            },
            status: 'success',
            logs: [],
            output: groupedRows,
          },
        },
      ],
      edges: [],
    })

    const node = snapshot.nodes[0] as Record<string, any>
    expect(node.data.output).toMatchObject({
      kind: 'table',
      _truncated: true,
      _totalRows: 300,
    })
    expect(node.data.output.payload).toHaveLength(3)
    expect(Object.keys(node.data.output.payload[0] ?? {})).toHaveLength(200)
  })

  it('sanitizes js-transform outputs that embed large nested arrays inside objects', () => {
    const transformedRows = Array.from({ length: 400 }, (_, index) => ({
      bucket: index % 10,
      avgValue: index / 10,
      tag: `标签_${index}`,
    }))

    const snapshot = buildSanitizedWorkflowSnapshot({
      name: 'JS 转换测试',
      nodes: [
        {
          id: 'node_js',
          type: 'custom',
          label: 'JS 执行',
          position: { x: 20, y: 20 },
          selected: false,
          dragging: false,
          data: {
            label: 'JS 执行',
            type: 'js-transform',
            category: 'action',
            config: {
              code: 'return rows.map(row => row)',
            },
            status: 'success',
            logs: [],
            output: {
              kind: 'json',
              payload: {
                rows: transformedRows,
                derived: {
                  data: transformedRows,
                  summary: '已完成聚合转换',
                },
                report: {
                  topBuckets: transformedRows.slice(0, 20),
                },
              },
            },
          },
        },
      ],
      edges: [],
    })

    const node = snapshot.nodes[0] as Record<string, any>
    expect(node.data.output.payload.rows).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 400,
    })
    expect(node.data.output.payload.derived.data).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 400,
    })
    expect(node.data.output.payload.report.topBuckets).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 20,
    })
  })

  it('sanitizes analysis report outputs with large findings, recommendations and metrics payloads', () => {
    const reportSnapshot = buildSanitizedWorkflowSnapshot({
      name: '模型报告测试',
      nodes: [
        {
          id: 'node_report',
          type: 'custom',
          label: '随机森林重要性',
          position: { x: 60, y: 60 },
          selected: false,
          dragging: false,
          data: {
            label: '随机森林重要性',
            type: 'random-forest-feature-importance',
            category: 'terminal',
            config: {
              targetField: 'sales',
            },
            status: 'success',
            logs: [],
            output: {
              kind: 'report',
              payload: {
                title: '随机森林分析报告',
                summary: '价格、折扣和渠道对销量存在显著影响。'.repeat(20),
                findings: Array.from({ length: 100 }, (_, index) => `发现_${index}_${'结论'.repeat(30)}`),
                recommendations: Array.from({ length: 80 }, (_, index) => `建议_${index}_${'优化'.repeat(30)}`),
                keyMetrics: Array.from({ length: 200 }, (_, index) => ({
                  name: `metric_${index}`,
                  value: index,
                  detail: '指标说明'.repeat(20),
                })),
                matrix: Array.from({ length: 120 }, (_, index) => ({
                  feature: `feature_${index}`,
                  importance: Math.random(),
                })),
              },
            },
          },
        },
      ],
      edges: [],
    })

    const output = (reportSnapshot.nodes[0] as Record<string, any>).data.output
    expect(output.kind).toBe('report')
    expect(output.payload.summary).toMatchObject({
      _truncated: true,
      _type: 'string',
    })
    expect(output.payload.findings).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 100,
    })
    expect(output.payload.recommendations).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 80,
    })
    expect(output.payload.keyMetrics).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 200,
    })
  })

  it('sanitizes chart/model outputs with oversized series data', () => {
    const chartSnapshot = buildSanitizedWorkflowSnapshot({
      name: '图表模型测试',
      nodes: [
        {
          id: 'node_chart',
          type: 'custom',
          label: 'SHAP 图表',
          position: { x: 80, y: 80 },
          selected: false,
          dragging: false,
          data: {
            label: 'SHAP 图表',
            type: 'xgboost-shap',
            category: 'terminal',
            config: {
              targetField: 'sales',
            },
            status: 'success',
            logs: [],
            output: {
              kind: 'chart',
              payload: {
                title: 'SHAP 重要性图',
                xAxis: {
                  data: Array.from({ length: 300 }, (_, index) => `feature_${index}`),
                },
                series: Array.from({ length: 20 }, (_, seriesIndex) => ({
                  name: `series_${seriesIndex}`,
                  type: 'bar',
                  data: Array.from({ length: 500 }, (_, index) => index + seriesIndex),
                })),
              },
            },
          },
        },
      ],
      edges: [],
    })

    const output = (chartSnapshot.nodes[0] as Record<string, any>).data.output
    expect(output.kind).toBe('chart')
    expect(output.payload.xAxis.data).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 300,
    })
    expect(output.payload.series).toMatchObject({
      _truncated: true,
      _type: 'array',
      total: 20,
    })
  })

  it('uses runtime accessors to enrich snapshot when canvas nodes no longer carry output, error and logs', () => {
    const snapshot = buildSanitizedWorkflowSnapshot({
      name: '运行态补全测试',
      nodes: [
        {
          id: 'node_runtime',
          type: 'custom',
          label: '运行态节点',
          position: { x: 0, y: 0 },
          selected: false,
          dragging: false,
          data: {
            label: '运行态节点',
            type: 'pearson',
            category: 'terminal',
            config: {
              targetField: 'target',
            },
            status: 'error',
            logs: [],
          },
        } as any,
      ],
      edges: [],
      getNodeOutput: (nodeId) =>
        nodeId === 'node_runtime'
          ? {
              kind: 'table',
              payload: [{ target: 1, score: 2 }],
            }
          : null,
      getNodeError: (nodeId) =>
        nodeId === 'node_runtime' ? '字段 target 不存在' : undefined,
      getNodeLogs: (nodeId) =>
        nodeId === 'node_runtime' ? ['第一条运行日志', '第二条运行日志'] : [],
    })

    expect(snapshot.nodes[0]).toMatchObject({
      data: {
        status: 'error',
        error: '字段 target 不存在',
        logs: ['第一条运行日志', '第二条运行日志'],
      },
    })
    expect((snapshot.nodes[0] as Record<string, any>).data.output).toMatchObject({
      kind: 'table',
      payload: [{ target: 1, score: 2 }],
    })
  })
})
