import { describe, expect, it, vi } from 'vitest'
import { createTableResult } from '../result'
import { nodeDefinitions } from '../registry'
import { randomForestFeatureImportanceNode } from '../definitions/randomForestFeatureImportance'

describe('random forest feature importance node', () => {
  it('should be registered as a terminal analysis node with help metadata', () => {
    const definition = nodeDefinitions.find((item) => item.name === 'random-forest-feature-importance')
    expect(definition).toBeTruthy()
    expect(definition?.category).toBe('terminal')
    expect(definition?.displayName).toBe('随机森林特征重要性')
    expect(definition?.help?.summary).toBeTruthy()
  })

  it('should return a standardized report result with importance ranking and risks', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            summary: {
              targetField: 'target',
              sampleCount: 72,
              featureCount: 3,
              r2: 0.9182,
              mae: 0.4861,
              nEstimators: 200,
              maxDepth: 8,
            },
            importance: [
              { name: 'f1', value: 0.63, rank: 1 },
              { name: 'f2', value: 0.24, rank: 2 },
              { name: 'f3', value: 0.13, rank: 3 },
            ],
            cumulativeImportance: [
              { name: 'f1', cumulativeValue: 0.63, rank: 1 },
              { name: 'f2', cumulativeValue: 0.87, rank: 2 },
              { name: 'f3', cumulativeValue: 1, rank: 3 },
            ],
            predictions: {
              actual: [10, 14, 18],
              predicted: [10.5, 13.6, 18.4],
            },
            risks: [
              {
                code: 'top_feature_dominance',
                level: 'low',
                title: '头部因子贡献集中',
                message: '前 1 个因子已覆盖主要解释度。',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as any

    const result = await randomForestFeatureImportanceNode.execute(
      createTableResult([
        { target: 10, f1: 1, f2: 3, f3: 8 },
        { target: 14, f1: 2, f2: 4, f3: 7 },
        { target: 18, f1: 3, f2: 5, f3: 6 },
      ]),
      { targetField: 'target', factorNames: ['f1', 'f2', 'f3'] },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('随机森林特征重要性')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(result.payload.sections?.[0]?.type).toBe('summary')
    expect(result.payload.sections?.[1]?.option?.series?.[0]?.type).toBe('bar')
    expect(result.payload.sections?.[2]?.option?.series?.[0]?.type).toBe('line')
    expect(result.payload.sections?.[3]?.option?.series?.[0]?.type).toBe('scatter')
    expect(result.payload.sections?.[4]?.type).toBe('risk-list')
    expect((result.meta?.metrics as any)?.featureCount).toBe(3)
    expect(Array.isArray((result.meta as any)?.importance)).toBe(true)
    expect(Array.isArray((result.meta as any)?.risks)).toBe(true)
  })
})
