import { describe, expect, it } from 'vitest'
import {
  buildCustomFactorsFromColumnMapping,
  buildCustomFactorsFromDraft,
  getDraftFieldLineStats,
} from '../importers'

describe('customFactor importers', () => {
  it('imports batch draft rows when unlocked multi-line fields have aligned row counts', () => {
    const factors = buildCustomFactorsFromDraft({
      factorKey: { value: 'TEMP_1\nTEMP_2', locked: false },
      factorName: { value: '温度1\n温度2', locked: false },
      materialType: { value: '正极', locked: true },
      processName: { value: '涂布', locked: true },
      r2Name: { value: 'R2-1\nR2-2', locked: false },
    })

    expect(factors).toHaveLength(2)
    expect(factors[0]).toMatchObject({
      factorKey: 'TEMP_1',
      factorName: '温度1',
      materialType: '正极',
      processName: '涂布',
      r2Name: 'R2-1',
    })
    expect(factors[1]).toMatchObject({
      factorKey: 'TEMP_2',
      factorName: '温度2',
      materialType: '正极',
      processName: '涂布',
      r2Name: 'R2-2',
    })
  })

  it('throws when unlocked multi-line fields have mismatched row counts', () => {
    expect(() =>
      buildCustomFactorsFromDraft({
        factorKey: { value: 'TEMP_1\nTEMP_2', locked: false },
        factorName: { value: '温度1', locked: false },
        materialType: { value: '正极', locked: true },
        processName: { value: '涂布', locked: true },
        r2Name: { value: 'R2-1\nR2-2', locked: false },
      }),
    ).toThrow('多行字段的行数不一致')
  })

  it('reports real-time line stats for each draft field', () => {
    const stats = getDraftFieldLineStats({
      factorKey: { value: 'TEMP_1\n\nTEMP_2', locked: false },
      factorName: { value: '温度1', locked: true },
      materialType: { value: '', locked: false },
      processName: { value: '涂布', locked: true },
      r2Name: { value: 'R2-1\nR2-2', locked: false },
    })

    expect(stats.factorKey).toMatchObject({ lineCount: 2, locked: false })
    expect(stats.factorName).toMatchObject({ lineCount: 1, locked: true })
    expect(stats.materialType).toMatchObject({ lineCount: 0, locked: false })
  })

  it('builds factors from excel column mapping', () => {
    const factors = buildCustomFactorsFromColumnMapping(
      [
        {
          因子编码: 'TEMP_1',
          因子名称: '温度1',
          物料类型: '正极',
          工序: '涂布',
          R2名称: 'R2-1',
        },
        {
          因子编码: 'TEMP_2',
          因子名称: '温度2',
          物料类型: '正极',
          工序: '辊压',
          R2名称: 'R2-2',
        },
      ],
      {
        factorKey: '因子编码',
        factorName: '因子名称',
        materialType: '物料类型',
        processName: '工序',
        r2Name: 'R2名称',
      },
    )

    expect(factors).toHaveLength(2)
    expect(factors[0]).toMatchObject({ factorKey: 'TEMP_1', processName: '涂布' })
    expect(factors[1]).toMatchObject({ factorKey: 'TEMP_2', processName: '辊压' })
  })
})
