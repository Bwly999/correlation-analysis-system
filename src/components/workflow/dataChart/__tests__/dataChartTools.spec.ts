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
