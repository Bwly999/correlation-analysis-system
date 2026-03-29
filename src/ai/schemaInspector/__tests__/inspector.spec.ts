import { describe, expect, it } from 'vitest'
import { createJsonResult, createTableResult } from '@/nodes/result'
import { inspectAiSchemaSummary } from '../inspector'

describe('inspectAiSchemaSummary', () => {
  it('summarizes table results into AI-readable column metadata', () => {
    const summary = inspectAiSchemaSummary({
      source: {
        kind: 'canvas-cache',
        nodeRef: 'node_import_1',
      },
      value: createTableResult([
        {
          sn: 'SN-ABC-001-0001',
          temperature: 23.5,
          pressure: 10.2,
          yieldRate: 0.91,
          createdAt: '2026-03-01',
        },
        {
          sn: 'SN-ABC-001-0002',
          temperature: 24.1,
          pressure: 10.4,
          yieldRate: 0.88,
          createdAt: '2026-03-02',
        },
      ]),
    })

    expect(summary.resultKind).toBe('table')
    expect(summary.summary.numericColumns).toContain('temperature')
    expect(summary.summary.numericColumns).toContain('yieldRate')
    expect(summary.summary.candidateTargetColumns).toContain('yieldRate')
    expect(summary.summary.candidateFeatureColumns).toContain('temperature')
    expect(summary.columns.find((column) => column.name === 'sn')).toMatchObject({
      isLikelyId: true,
    })
    expect(summary.columns.find((column) => column.name === 'createdAt')).toMatchObject({
      detectedType: 'date',
    })
  })

  it('treats object-array json payload as tabular data', () => {
    const summary = inspectAiSchemaSummary({
      source: {
        kind: 'canvas-cache',
        nodeRef: 'node_json_1',
      },
      value: createJsonResult([
        { feature: 1, target: 2 },
        { feature: 2, target: 4 },
      ]),
    })

    expect(summary.resultKind).toBe('table')
    expect(summary.summary.numericColumns).toEqual(['feature', 'target'])
    expect(summary.summary.candidateTargetColumns).toContain('target')
  })

  it('returns a blocked summary for non-tabular json payloads', () => {
    const summary = inspectAiSchemaSummary({
      source: {
        kind: 'canvas-cache',
        nodeRef: 'node_json_2',
      },
      value: createJsonResult({
        meta: { page: 1 },
        data: [{ feature: 1 }],
      }),
    })

    expect(summary.resultKind).toBe('json')
    expect(summary.columns).toEqual([])
    expect(summary.summary.blockedReasons).toContain('当前 JSON 结构不是对象数组，暂不支持自动字段推断')
  })
})
