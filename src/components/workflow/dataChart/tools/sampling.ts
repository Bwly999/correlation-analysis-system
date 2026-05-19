import type { ChartRow } from '../types'
import { isFiniteNumber } from './normalization'

export const downsampleLineRows = (rows: ChartRow[], keys: string[], limit: number) => {
  if (rows.length <= limit || limit <= 2) return rows

  const primaryKey = keys[0]
  if (!primaryKey) return rows.slice(0, limit)

  const bucketSize = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(limit / 2))))
  const sampled: ChartRow[] = []

  for (let start = 0; start < rows.length; start += bucketSize) {
    const bucket = rows.slice(start, start + bucketSize)
    if (bucket.length === 0) continue

    const first = bucket[0]
    const last = bucket[bucket.length - 1]
    let minRow = first
    let maxRow = first

    for (const row of bucket) {
      const currentValue = row[primaryKey]
      const minValue = minRow?.[primaryKey]
      const maxValue = maxRow?.[primaryKey]

      if (isFiniteNumber(currentValue) && isFiniteNumber(minValue) && currentValue < minValue) {
        minRow = row
      }
      if (isFiniteNumber(currentValue) && isFiniteNumber(maxValue) && currentValue > maxValue) {
        maxRow = row
      }
    }

    const candidates = [first, minRow, maxRow, last].filter(
      (row, index, list): row is ChartRow => Boolean(row) && list.indexOf(row) === index,
    )
    sampled.push(...candidates)
  }

  return sampled.slice(0, limit)
}
