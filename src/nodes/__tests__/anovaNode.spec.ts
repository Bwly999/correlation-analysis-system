import { describe, expect, it } from 'vitest'
import { createTableResult } from '../result'
import { nodeDefinitions } from '../registry'
import { anovaNode } from '../definitions/anova'

describe('ANOVA node', () => {
  it('should be registered as a terminal analysis node with help metadata', () => {
    const definition = nodeDefinitions.find((item) => item.name === 'anova')
    expect(definition).toBeTruthy()
    expect(definition?.category).toBe('terminal')
    expect(definition?.displayName).toBe('方差分析')
    expect(definition?.help?.summary).toBeTruthy()
  })

  it('should return a standardized report result with F statistic and p value', async () => {
    const result = await anovaNode.execute(
      createTableResult([
        { group: 'A', target: 10 },
        { group: 'A', target: 11 },
        { group: 'A', target: 9 },
        { group: 'B', target: 20 },
        { group: 'B', target: 19 },
        { group: 'B', target: 21 },
        { group: 'C', target: 30 },
        { group: 'C', target: 32 },
        { group: 'C', target: 31 },
      ]),
      { targetField: 'target', groupField: 'group' },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('单因素方差分析')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(result.payload.sections?.[0]?.type).toBe('summary')
    expect(result.payload.sections?.[1]?.option?.series?.[0]?.type).toBe('bar')
    expect(result.payload.sections?.[2]?.option?.series?.[0]?.type).toBe('boxplot')
    expect((result.meta?.metrics as any)?.groupCount).toBe(3)
    expect((result.meta?.metrics as any)?.fStatistic ?? 0).toBeGreaterThan(50)
    expect((result.meta?.metrics as any)?.pValue ?? 1).toBeLessThan(0.001)
  })
})
