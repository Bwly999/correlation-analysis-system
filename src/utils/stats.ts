/**
 * 计算一组数值的箱线图五个关键统计值 [最小值, 下四分位数, 中位数, 上四分位数, 最大值]
 * 针对大数据量自动进行采样以平衡精度与性能
 */
export const calculateBoxValues = (data: any[], key: string): [number, number, number, number, number] => {
  let values = data
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number')

  if (values.length === 0) return [0, 0, 0, 0, 0]

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

  const sorted = [...values].sort((a, b) => a - b)
  const len = sorted.length

  return [
    sorted[0]!,
    sorted[Math.floor(len * 0.25)]!,
    sorted[Math.floor(len * 0.5)]!,
    sorted[Math.floor(len * 0.75)]!,
    sorted[len - 1]!,
  ]
}
