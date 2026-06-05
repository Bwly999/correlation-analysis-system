/**
 * 分析请求裁剪逻辑：只保留 targetField + factorNames 白名单字段，减少请求体大小。
 */

export type TrimAnalysisPayloadOptions = {
  rows: Array<Record<string, unknown>>
  targetField: string
  factorNames: string[]
}

export const trimAnalysisPayload = (options: TrimAnalysisPayloadOptions) => {
  const { rows, targetField, factorNames } = options

  if (!targetField) {
    throw new Error('请先选择目标变量')
  }

  if (!Array.isArray(factorNames) || factorNames.length === 0) {
    throw new Error('请先选择参与分析的字段')
  }

  const deduplicatedFactors = factorNames.filter((name) => name !== targetField)
  if (deduplicatedFactors.length === 0) {
    throw new Error('请先选择参与分析的字段')
  }

  const allowedKeys = new Set([targetField, ...deduplicatedFactors])

  return rows.map((row) => {
    const trimmed: Record<string, unknown> = {}
    for (const key of allowedKeys) {
      if (key in row) {
        trimmed[key] = row[key]
      }
    }
    return trimmed
  })
}