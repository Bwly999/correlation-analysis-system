import { describe, expect, it } from 'vitest'
import { createTableResult } from '../result'
import { nodeDefinitions } from '../registry'
import { pcaNode } from '../definitions/pca'

describe('PCA node', () => {
  it('should be registered as a terminal analysis node with help metadata', () => {
    const definition = nodeDefinitions.find((item) => item.name === 'pca')
    expect(definition).toBeTruthy()
    expect(definition?.category).toBe('terminal')
    expect(definition?.displayName).toBe('PCA 主成分分析')
    expect(definition?.help?.summary).toBeTruthy()
  })

  it('should return a standardized report result with explained variance and loadings', async () => {
    const result = await pcaNode.execute(
      createTableResult([
        { f1: 1, f2: 2, category: 'A' },
        { f1: 2, f2: 4, category: 'B' },
        { f1: 3, f2: 6, category: 'C' },
        { f1: 4, f2: 8, category: 'D' },
        { f1: 5, f2: 10, category: 'E' },
      ]),
      { factorNames: ['f1', 'f2'], componentCount: 2, standardize: true },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('PCA 主成分分析')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(result.payload.sections?.[0]?.type).toBe('summary')
    expect(result.payload.sections?.[1]?.type).toBe('chart')
    expect(result.meta?.metrics?.componentCount).toBe(2)

    const ratios = (result.meta?.metrics as any)?.explainedVarianceRatio as number[] | undefined
    expect(Array.isArray(ratios)).toBe(true)
    expect((ratios ?? [])[0] ?? 0).toBeGreaterThan(0.95)
  })
})

