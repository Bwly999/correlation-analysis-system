import type { ChartRow, NormalizationMethod, SeriesStats } from '../types'

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const calculateMean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const calculateStd = (values: number[], mean: number) => {
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export const buildNormalizationStats = (rows: ChartRow[], keys: string[]) => {
  const stats = new Map<string, SeriesStats>()

  keys.forEach((key) => {
    const values = rows.map((row) => row[key]).filter(isFiniteNumber)
    if (values.length === 0) return

    const min = Math.min(...values)
    const max = Math.max(...values)
    const mean = calculateMean(values)
    const std = calculateStd(values, mean)

    stats.set(key, { min, max, mean, std })
  })

  return stats
}

export const normalizeSeriesValue = (
  value: unknown,
  stats: SeriesStats | undefined,
  method: NormalizationMethod,
) => {
  if (!isFiniteNumber(value) || !stats) return null

  if (method === 'min-max') {
    if (stats.max === stats.min) return 0.5
    return (value - stats.min) / (stats.max - stats.min)
  }

  if (stats.std === 0) return 0
  return (value - stats.mean) / stats.std
}

export const normalizeChartRows = (
  rows: ChartRow[],
  keys: string[],
  stats: Map<string, SeriesStats>,
  method: NormalizationMethod,
) =>
  rows.map((row) => {
    const normalizedRow: ChartRow = { ...row }

    keys.forEach((key) => {
      normalizedRow[key] = normalizeSeriesValue(row[key], stats.get(key), method)
    })

    return normalizedRow
  })
