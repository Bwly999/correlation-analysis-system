import { describe, expect, it } from 'vitest'
import { recommendAnalysisMethods } from '../methodAdvisor.js'
import type { AgenticDataProfile } from '../dataProfile.js'

const buildProfile = (overrides: Partial<AgenticDataProfile> = {}): AgenticDataProfile => ({
  rowCount: 120,
  scannedRowCount: 120,
  fields: [
    { name: 'sales', type: 'numeric', missingRate: 0, uniqueCount: 100, sampleValues: [100, 120] },
    { name: 'price', type: 'numeric', missingRate: 0, uniqueCount: 80, sampleValues: [9.9, 8.8] },
    { name: 'discount', type: 'numeric', missingRate: 0.05, uniqueCount: 20, sampleValues: [0.1, 0.2] },
  ],
  candidateTargetColumns: ['sales'],
  candidateFeatureColumns: ['price', 'discount'],
  ...overrides,
})

describe('agentic method advisor', () => {
  it('recommends correlation, regression and feature importance for numeric targets', () => {
    const result = recommendAnalysisMethods(buildProfile())

    expect(result.recommended).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'Pearson 相关系数',
          nodeTypes: ['correlation-analysis'],
          nodeConfig: { method: 'pearson' },
        }),
        expect.objectContaining({
          method: 'Spearman 相关系数',
          nodeTypes: ['correlation-analysis'],
          nodeConfig: { method: 'spearman' },
        }),
        expect.objectContaining({ method: '多元线性回归', nodeTypes: ['multiple-linear-regression'] }),
        expect.objectContaining({ method: '随机森林特征重要度', nodeTypes: ['random-forest-feature-importance'] }),
      ]),
    )
  })

  it('recommends classification methods and avoids Pearson as primary for categorical targets', () => {
    const result = recommendAnalysisMethods(buildProfile({
      fields: [
        { name: 'converted', type: 'categorical', missingRate: 0, uniqueCount: 2, sampleValues: ['是', '否'] },
        { name: 'price', type: 'numeric', missingRate: 0, uniqueCount: 80, sampleValues: [9.9, 8.8] },
      ],
      candidateTargetColumns: ['converted'],
      candidateFeatureColumns: ['price'],
    }))

    expect(result.recommended).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: '逻辑回归分类', nodeTypes: ['logistic-regression-classification'] }),
      ]),
    )
    expect(result.recommended.find((item) => item.method === 'Pearson 相关系数')?.priority).not.toBe('primary')
  })

  it('reports risks for small samples and high missing rates', () => {
    const result = recommendAnalysisMethods(buildProfile({
      rowCount: 12,
      scannedRowCount: 12,
      fields: [
        { name: 'sales', type: 'numeric', missingRate: 0, uniqueCount: 10, sampleValues: [100, 120] },
        { name: 'price', type: 'numeric', missingRate: 0.45, uniqueCount: 5, sampleValues: [9.9, 8.8] },
      ],
      candidateTargetColumns: ['sales'],
      candidateFeatureColumns: ['price'],
    }))

    expect(result.risks).toEqual(expect.arrayContaining(['样本量偏少，统计结论稳定性较弱']))
    expect(result.preprocessingSuggestions).toEqual(expect.arrayContaining(['字段 price 缺失率较高，建议先进行缺失值处理']))
  })
})
