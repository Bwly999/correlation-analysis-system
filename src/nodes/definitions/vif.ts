import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'

type NumericRow = Record<string, number | null>

type VifItem = {
  field: string
  vif: number
  tolerance: number
  r2: number
  riskLevel: 'low' | 'warning' | 'danger'
}

type VifRisk = {
  code: 'high_vif' | 'warning_vif' | 'constant_field'
  level: 'warning' | 'danger'
  title: string
  message: string
  fields?: string[]
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const buildNumericDataset = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0] ?? {})
  const numericKeys = keys.filter((key) => rows.some((row) => toFiniteNumber(row[key]) !== null))

  const normalizedRows: NumericRow[] = rows.map((row) => {
    const normalized: NumericRow = {}
    numericKeys.forEach((key) => {
      normalized[key] = toFiniteNumber(row[key])
    })
    return normalized
  })

  return { numericKeys, normalizedRows }
}

const normalizeSelectedFields = (
  selected: unknown,
  allKeys: string[],
  numericKeys: string[],
) => {
  const rawFields = Array.isArray(selected)
    ? selected.filter((item): item is string => typeof item === 'string')
    : typeof selected === 'string'
      ? [selected]
      : []

  const uniqueFields = rawFields.filter((field, index) => rawFields.indexOf(field) === index)
  const missingFields = uniqueFields.filter((field) => !allKeys.includes(field))
  const nonNumericFields = uniqueFields.filter(
    (field) => allKeys.includes(field) && !numericKeys.includes(field),
  )
  const validFields = uniqueFields.filter((field) => numericKeys.includes(field))

  return {
    validFields,
    missingFields,
    nonNumericFields,
  }
}

const solveLinearRegressionR2 = (target: number[], predictors: number[][]) => {
  if (predictors.length === 0 || predictors[0]?.length === 0) return 0

  const designMatrix = predictors.map((row) => [1, ...row])
  const beta = solveLeastSquares(designMatrix, target)
  const predicted = designMatrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * (beta[index] ?? 0), 0),
  )
  const targetMean = target.reduce((sum, value) => sum + value, 0) / target.length
  const totalSumSquares = target.reduce((sum, value) => sum + (value - targetMean) ** 2, 0)
  const residualSumSquares = target.reduce(
    (sum, value, index) => sum + (value - (predicted[index] ?? 0)) ** 2,
    0,
  )

  if (totalSumSquares <= 1e-12) return 1

  return Math.min(1, Math.max(0, 1 - residualSumSquares / totalSumSquares))
}

const solveLeastSquares = (designMatrix: number[][], target: number[]) => {
  const xTx = designMatrix[0]!.map((_, columnIndex) =>
    designMatrix[0]!.map((__, innerIndex) =>
      designMatrix.reduce(
        (sum, row) => sum + (row[columnIndex] ?? 0) * (row[innerIndex] ?? 0),
        0,
      ),
    ),
  )

  const xTy = designMatrix[0]!.map((_, columnIndex) =>
    designMatrix.reduce(
      (sum, row, rowIndex) => sum + (row[columnIndex] ?? 0) * (target[rowIndex] ?? 0),
      0,
    ),
  )

  return gaussianElimination(xTx, xTy)
}

const gaussianElimination = (matrix: number[][], vector: number[]) => {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0])

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![pivot] ?? 0) > Math.abs(augmented[maxRow]![pivot] ?? 0)) {
        maxRow = row
      }
    }

    ;[augmented[pivot], augmented[maxRow]] = [augmented[maxRow]!, augmented[pivot]!]
    const pivotValue = augmented[pivot]![pivot] ?? 0

    if (Math.abs(pivotValue) < 1e-12) {
      continue
    }

    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot]![column] = (augmented[pivot]![column] ?? 0) / pivotValue
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const factor = augmented[row]![pivot] ?? 0
      for (let column = pivot; column <= size; column += 1) {
        augmented[row]![column] =
          (augmented[row]![column] ?? 0) - factor * (augmented[pivot]![column] ?? 0)
      }
    }
  }

  return augmented.map((row) => row[size] ?? 0)
}

const toRiskLevel = (vif: number): VifItem['riskLevel'] => {
  if (vif >= 10) return 'danger'
  if (vif >= 5) return 'warning'
  return 'low'
}

const buildBarChartOption = (items: VifItem[]) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  grid: { top: 20, left: 90, right: 24, bottom: 20, containLabel: true },
  xAxis: {
    type: 'value',
    name: 'VIF',
  },
  yAxis: {
    type: 'category',
    data: items.map((item) => item.field).reverse(),
  },
  series: [
    {
      name: 'VIF',
      type: 'bar',
      data: items
        .map((item) => ({
          value: Number.isFinite(item.vif) ? Number(item.vif.toFixed(3)) : 999,
          itemStyle: {
            color:
              item.riskLevel === 'danger'
                ? '#dc2626'
                : item.riskLevel === 'warning'
                  ? '#d97706'
                  : '#2563eb',
            borderRadius: [0, 4, 4, 0],
          },
        }))
        .reverse(),
      label: {
        show: true,
        position: 'right',
        formatter: ({ value }: { value: number }) => (value >= 999 ? '∞' : value.toFixed(2)),
        color: '#334155',
      },
    },
  ],
})

const buildRisks = (items: VifItem[]) => {
  const highRiskFields = items.filter((item) => item.vif >= 10).map((item) => item.field)
  const warningFields = items
    .filter((item) => item.vif >= 5 && item.vif < 10)
    .map((item) => item.field)
  const constantFields = items
    .filter((item) => !Number.isFinite(item.vif))
    .map((item) => item.field)

  const risks: VifRisk[] = []

  if (highRiskFields.length > 0) {
    risks.push({
      code: 'high_vif',
      level: 'danger',
      title: '高共线字段',
      message: `字段 ${highRiskFields.join('、')} 的 VIF 已超过 10，说明共线性较强，建议先做删减、合并或降维。`,
      fields: highRiskFields,
    })
  }

  if (warningFields.length > 0) {
    risks.push({
      code: 'warning_vif',
      level: 'warning',
      title: '共线性需关注',
      message: `字段 ${warningFields.join('、')} 的 VIF 已超过 5，建议结合业务判断是否需要进一步处理。`,
      fields: warningFields,
    })
  }

  if (constantFields.length > 0) {
    risks.push({
      code: 'constant_field',
      level: 'warning',
      title: '常量字段无法稳定评估',
      message: `字段 ${constantFields.join('、')} 近似常量，无法得到稳定的 VIF 结果，建议先移除这类字段。`,
      fields: constantFields,
    })
  }

  return risks
}

export const vifNode: NodeDefinition = {
  name: 'vif',
  displayName: 'VIF 共线性检测',
  icon: 'sigma',
  category: 'terminal',
  description: '评估多个数值因子之间的共线性风险，输出各字段的 VIF 指标和风险提示。',
  properties: [
    {
      name: 'factorNames',
      displayName: '检测字段',
      type: 'tags',
      useUpstreamFactors: true,
      description: '选择需要评估共线性的数值字段；留空时默认使用当前表格中的全部数值字段。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无可分析的输入数据')
    }

    const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const { numericKeys, normalizedRows } = buildNumericDataset(rows)
    if (numericKeys.length < 2) {
      throw new Error('至少需要 2 个数值字段才能进行 VIF 检测')
    }

    const selection = normalizeSelectedFields(config.factorNames, allKeys, numericKeys)
    if (selection.missingFields.length > 0) {
      throw new Error(`所选字段中以下字段不存在：${selection.missingFields.join('、')}`)
    }
    if (selection.nonNumericFields.length > 0) {
      throw new Error(`所选字段中以下字段不支持 VIF 检测：${selection.nonNumericFields.join('、')}`)
    }

    const factorNames =
      selection.validFields.length > 0 ? selection.validFields : numericKeys
    if (factorNames.length < 2) {
      throw new Error('至少需要 2 个有效数值字段才能进行 VIF 检测')
    }

    const completeRows = normalizedRows.filter((row) =>
      factorNames.every((field) => row[field] !== null && row[field] !== undefined),
    )

    if (completeRows.length < 5) {
      throw new Error('有效样本不足，无法完成 VIF 检测')
    }

    const items = factorNames
      .map((field) => {
        const otherFields = factorNames.filter((item) => item !== field)
        const target = completeRows.map((row) => row[field] as number)
        const predictors = completeRows.map((row) => otherFields.map((item) => row[item] as number))
        const r2 = solveLinearRegressionR2(target, predictors)
        const tolerance = Number((1 - r2).toFixed(6))
        const vif = tolerance <= 1e-6 ? Number.POSITIVE_INFINITY : Number((1 / tolerance).toFixed(6))

        return {
          field,
          vif,
          tolerance,
          r2: Number(r2.toFixed(6)),
          riskLevel: toRiskLevel(vif),
        } satisfies VifItem
      })
      .sort((left, right) => {
        if (!Number.isFinite(left.vif) && !Number.isFinite(right.vif)) return 0
        if (!Number.isFinite(left.vif)) return -1
        if (!Number.isFinite(right.vif)) return 1
        return right.vif - left.vif
      })

    const risks = buildRisks(items)
    const maxVif = items[0]?.vif ?? 0
    const warningCount = items.filter((item) => item.vif >= 5).length

    return createReportResult(
      {
        title: 'VIF 共线性检测',
        metadata: {
          featureCount: factorNames.length,
          sampleCount: completeRows.length,
          maxVif: Number.isFinite(maxVif) ? Number(maxVif.toFixed(3)) : '∞',
          riskCount: risks.length,
        },
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '检测摘要',
            cards: [
              { label: '检测字段数', value: factorNames.length },
              { label: '有效样本量', value: completeRows.length },
              { label: '最高 VIF', value: Number.isFinite(maxVif) ? Number(maxVif.toFixed(3)) : '∞' },
              { label: '需关注字段数', value: warningCount },
            ],
            content: `本次基于 ${completeRows.length} 行完整样本检测 ${factorNames.length} 个字段的共线性风险，VIF 越高表示该字段越可能与其他字段存在冗余解释关系。`,
          },
          {
            key: 'ranking',
            type: 'chart',
            title: 'VIF 排序',
            option: buildBarChartOption(items),
            items,
          },
          {
            key: 'risks',
            type: 'risk-list',
            title: '共线性风险提示',
            items: risks,
          },
          {
            key: 'details',
            type: 'text',
            title: '字段明细',
            content: JSON.stringify(
              items.map((item) => ({
                字段: item.field,
                VIF: Number.isFinite(item.vif) ? Number(item.vif.toFixed(3)) : '∞',
                容忍度: item.tolerance,
                拟合R2: item.r2,
                风险等级: item.riskLevel,
              })),
              null,
              2,
            ),
          },
        ],
      },
      {
        meta: {
          metrics: {
            featureCount: factorNames.length,
            sampleCount: completeRows.length,
            maxVif: Number.isFinite(maxVif) ? Number(maxVif.toFixed(6)) : Number.POSITIVE_INFINITY,
          },
          items,
          risks,
        },
      },
    )
  },
}
