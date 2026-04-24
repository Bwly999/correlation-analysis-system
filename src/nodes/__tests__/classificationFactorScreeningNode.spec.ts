import { describe, expect, it } from 'vitest'
import { createTableResult } from '../result'
import { nodeDefinitions } from '../registry'
import { classificationFactorScreeningNode } from '../definitions/classificationFactorScreening'

describe('classification factor screening node', () => {
  it('should be registered as a terminal analysis node with help metadata', () => {
    const definition = nodeDefinitions.find((item) => item.name === 'classification-factor-screening')
    expect(definition).toBeTruthy()
    expect(definition?.category).toBe('terminal')
    expect(definition?.displayName).toBe('分类因子筛查')
    expect(definition?.help?.summary).toBeTruthy()
  })

  it('should return a standardized report result for mixed numeric and categorical factors', async () => {
    const result = await classificationFactorScreeningNode.execute(
      createTableResult([
        { label: 'A', temp: 10, pressure: 1.1, line: 'L1' },
        { label: 'A', temp: 11, pressure: 1.2, line: 'L1' },
        { label: 'A', temp: 12, pressure: 1.15, line: 'L2' },
        { label: 'B', temp: 20, pressure: 2.1, line: 'L2' },
        { label: 'B', temp: 21, pressure: 2.2, line: 'L2' },
        { label: 'B', temp: 22, pressure: 2.15, line: 'L3' },
      ]),
      {
        targetField: 'label',
        factorNames: ['temp', 'pressure', 'line'],
        alpha: 0.05,
        maxResultCount: 10,
      },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('分类因子筛查')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(result.payload.sections?.[0]?.type).toBe('summary')
    expect(result.payload.sections?.[1]?.type).toBe('chart')
    expect(result.payload.sections?.[2]?.type).toBe('text')
    expect((result.meta?.metrics as any)?.classCount).toBe(2)
    expect((result.meta?.metrics as any)?.testedFactorCount).toBe(3)
    expect((result.meta?.metrics as any)?.significantFactorCount).toBeGreaterThanOrEqual(1)
    expect((result.meta as any)?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factorName: 'temp',
          factorType: 'numeric',
        }),
        expect.objectContaining({
          factorName: 'line',
          factorType: 'categorical',
        }),
      ]),
    )
  })
})
