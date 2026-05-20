import { describe, expect, it } from 'vitest'
import {
  buildNormalizationStats,
  normalizeChartRows,
  normalizeSeriesValue,
} from '../tools/normalization'
import {
  applyValueBoundsToGroups,
  applyValueBoundsToRows,
  filterRowsByRenderableKeys,
} from '../tools/filtering'
import { downsampleLineRows } from '../tools/sampling'
import { filterInvalidLineRows } from '../tools/outlierHandling'

type ChartRow = Record<string, unknown>

describe('dataChart tools', () => {
  it('normalizes chart rows with min-max stats while keeping non-target fields', () => {
    const rows: ChartRow[] = [
      { score: 10, revenue: 1000, label: 'A' },
      { score: 20, revenue: 2000, label: 'B' },
      { score: 30, revenue: 3000, label: 'C' },
    ]

    const stats = buildNormalizationStats(rows, ['score', 'revenue'])
    const normalizedRows = normalizeChartRows(rows, ['score', 'revenue'], stats, 'min-max')

    expect(normalizedRows).toEqual([
      { score: 0, revenue: 0, label: 'A' },
      { score: 0.5, revenue: 0.5, label: 'B' },
      { score: 1, revenue: 1, label: 'C' },
    ])
    expect(normalizeSeriesValue(5, undefined, 'min-max')).toBeNull()
  })

  it('normalizes only selected y fields and keeps x values unchanged for scatter-like data', () => {
    const rows: ChartRow[] = [
      { temperature: 10, score: 100, cost: 1000 },
      { temperature: 20, score: 200, cost: 2000 },
      { temperature: 30, score: 300, cost: 3000 },
    ]

    const stats = buildNormalizationStats(rows, ['score', 'cost'])
    const normalizedRows = normalizeChartRows(rows, ['score', 'cost'], stats, 'z-score')

    expect(normalizedRows.map((row) => row.temperature)).toEqual([10, 20, 30])
    expect(normalizedRows[0]?.score).toBeLessThan(0)
    expect(normalizedRows[1]?.score).toBe(0)
    expect(normalizedRows[2]?.score).toBeGreaterThan(0)
    expect(normalizedRows[0]?.cost).toBeLessThan(0)
    expect(normalizedRows[1]?.cost).toBe(0)
    expect(normalizedRows[2]?.cost).toBeGreaterThan(0)
  })

  it('filters rows and groups by numeric bounds using selected keys', () => {
    const rows: ChartRow[] = [
      { score: 10, revenue: 100 },
      { score: 20, revenue: 200 },
      { score: 30, revenue: 300 },
    ]

    expect(applyValueBoundsToRows(rows, ['score'], 15, 25)).toEqual([{ score: 20, revenue: 200 }])
    expect(filterRowsByRenderableKeys([{ score: 1 }, { score: 'bad' }, { score: 3 }], ['score'])).toEqual([
      { score: 1 },
      { score: 3 },
    ])

    const groups = [
      { name: 'A', data: rows },
      { name: 'B', data: [{ score: 18, revenue: 180 }, { score: 28, revenue: 280 }] },
    ]

    expect(applyValueBoundsToGroups(groups, ['score'], 15, 25)).toEqual([
      { name: 'A', data: [{ score: 20, revenue: 200 }] },
      { name: 'B', data: [{ score: 18, revenue: 180 }] },
    ])
  })

  it('downsamples line rows and keeps line-only invalid-row filtering behavior', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      score: index === 3 ? -100 : index === 8 ? 100 : index,
      value: index * 10,
    }))

    const sampled = downsampleLineRows(rows, ['score'], 6)
    const sampledScores = sampled.map((row) => row.score)

    expect(sampled.length).toBeLessThanOrEqual(6)
    expect(sampledScores).toContain(-100)
    expect(sampledScores).toContain(100)
    expect(sampledScores[0]).toBe(0)

    expect(filterInvalidLineRows([{ score: 1 }, { score: 'bad' }, { score: 2 }], ['score'])).toEqual([
      { score: 1 },
      { score: 2 },
    ])
  })
})
