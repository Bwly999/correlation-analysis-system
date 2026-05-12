/**
 * 计算一组数值的箱线图五个关键统计值 [最小值, 下四分位数, 中位数, 上四分位数, 最大值]
 * 针对大数据量自动进行采样以平衡精度与性能
 */
const getNumericValues = (data: any[], key: string) => {
  let values = data
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number')

  if (values.length === 0) return []

  // 性能优化：如果数据量超过 10000 条，进行等距采样以保证排序性能
  if (values.length > 10000) {
    const sampleSize = 5000
    const step = values.length / sampleSize
    const sampled: number[] = []
    for (let i = 0; i < sampleSize; i++) {
      sampled.push(values[Math.floor(i * step)]!)
    }
    values = sampled
  }

  return [...values].sort((a, b) => a - b)
}

const getQuantileByFloor = (sorted: number[], ratio: number) => {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))
  return sorted[index]!
}

const getInterpolatedPercentile = (sorted: number[], ratio: number) => {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!

  const position = (sorted.length - 1) * ratio
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sorted[lowerIndex]!
  const upperValue = sorted[upperIndex]!

  if (lowerIndex === upperIndex) {
    return lowerValue
  }

  const weight = position - lowerIndex
  return lowerValue + (upperValue - lowerValue) * weight
}

export type BoxplotWhiskerMode = 'iqr' | 'percentile'

export type BoxplotStats = {
  boxValues: [number, number, number, number, number]
  outliers: number[]
}

export const calculateBoxplotStats = (
  data: any[],
  key: string,
  whiskerMode: BoxplotWhiskerMode,
): BoxplotStats => {
  const sorted = getNumericValues(data, key)

  if (sorted.length === 0) {
    return {
      boxValues: [0, 0, 0, 0, 0],
      outliers: [],
    }
  }

  const q1 = getQuantileByFloor(sorted, 0.25)
  const median = getQuantileByFloor(sorted, 0.5)
  const q3 = getQuantileByFloor(sorted, 0.75)

  if (whiskerMode === 'percentile') {
    const low = getInterpolatedPercentile(sorted, 0.02)
    const high = getInterpolatedPercentile(sorted, 0.98)

    return {
      boxValues: [low, q1, median, q3, high],
      outliers: sorted.filter((value) => value < low || value > high),
    }
  }

  const iqr = q3 - q1
  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr
  const low = sorted.find((value) => value >= lowerFence) ?? sorted[0]!
  const high = [...sorted].reverse().find((value) => value <= upperFence) ?? sorted[sorted.length - 1]!

  return {
    boxValues: [low, q1, median, q3, high],
    outliers: sorted.filter((value) => value < low || value > high),
  }
}

export const calculateBoxValues = (data: any[], key: string): [number, number, number, number, number] => {
  const sorted = getNumericValues(data, key)

  if (sorted.length === 0) return [0, 0, 0, 0, 0]

  return [
    sorted[0]!,
    getQuantileByFloor(sorted, 0.25),
    getQuantileByFloor(sorted, 0.5),
    getQuantileByFloor(sorted, 0.75),
    sorted[sorted.length - 1]!,
  ]
}
