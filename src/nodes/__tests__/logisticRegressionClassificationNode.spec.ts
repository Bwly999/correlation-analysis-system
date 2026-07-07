import { describe, expect, it, vi } from 'vitest'
import { createTableResult } from '../result'
import { nodeDefinitions } from '../registry'
import { logisticRegressionClassificationNode } from '../definitions/logisticRegressionClassification'

describe('logistic regression classification node', () => {
  it('should be registered as a terminal analysis node with help metadata', () => {
    const definition = nodeDefinitions.find((item) => item.name === 'logistic-regression-classification')
    expect(definition).toBeTruthy()
    expect(definition?.category).toBe('terminal')
    expect(definition?.displayName).toBe('逻辑回归分类分析')
    expect(definition?.help?.summary).toBeTruthy()
  })

  it('should return a standardized report result with classification metrics and coefficients', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            summary: {
              targetField: 'label',
              sampleCount: 80,
              featureCount: 3,
              classCount: 2,
              accuracy: 0.91,
              macroF1: 0.9,
              auc: 0.95,
            },
            metrics: {
              accuracy: 0.91,
              precision: 0.9,
              recall: 0.91,
              f1: 0.9,
              macroPrecision: 0.9,
              macroRecall: 0.91,
              macroF1: 0.9,
              auc: 0.95,
            },
            confusionMatrix: {
              labels: ['A', 'B'],
              matrix: [
                [18, 2],
                [1, 19],
              ],
            },
            rocCurve: {
              fpr: [0, 0.1, 1],
              tpr: [0, 0.92, 1],
            },
            coefficients: [
              {
                feature: 'temp',
                className: 'B',
                coefficient: 1.2,
                oddsRatio: 3.32,
                rank: 1,
              },
              {
                feature: 'pressure',
                className: 'B',
                coefficient: 0.8,
                oddsRatio: 2.23,
                rank: 2,
              },
            ],
            risks: [
              {
                code: 'class_imbalance',
                level: 'medium',
                title: '类别分布不均衡',
                message: '建议结合混淆矩阵审阅少数类表现。',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as any

    const result = await logisticRegressionClassificationNode.execute(
      createTableResult([
        { label: 'A', temp: 10, pressure: 1.1, line: 'L1' },
        { label: 'B', temp: 20, pressure: 2.1, line: 'L2' },
      ]),
      {
        targetField: 'label',
        factorNames: ['temp', 'pressure', 'line'],
      },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('逻辑回归分类分析')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(result.payload.sections?.[0]?.type).toBe('summary')
    expect(result.payload.sections?.[1]?.type).toBe('summary')
    expect(result.payload.sections?.[2]?.type).toBe('chart')
    expect(result.payload.sections?.[3]?.type).toBe('chart')
    expect(result.payload.sections?.[4]?.type).toBe('chart')
    expect(result.payload.sections?.[5]?.type).toBe('risk-list')
    expect((result.meta?.metrics as any)?.classCount).toBe(2)
    expect((result.meta as any)?.coefficients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: 'temp',
          className: 'B',
        }),
      ]),
    )
  })
})
