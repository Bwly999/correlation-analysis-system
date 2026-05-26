import { describe, expect, it } from 'vitest'
import { buildDataProfile } from '../dataProfile.js'

describe('agentic data profile', () => {
  it('infers field roles, quality and candidate columns from tabular rows', () => {
    const profile = buildDataProfile([
      { sales: 100, price: 9.9, city: '上海', date: '2026-01-01' },
      { sales: 120, price: 8.8, city: '北京', date: '2026-01-02' },
      { sales: null, price: 10.1, city: '上海', date: '2026-01-03' },
    ])

    expect(profile.rowCount).toBe(3)
    expect(profile.scannedRowCount).toBe(3)
    expect(profile.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'sales',
          type: 'numeric',
          missingRate: 1 / 3,
        }),
        expect.objectContaining({
          name: 'price',
          type: 'numeric',
          missingRate: 0,
        }),
        expect.objectContaining({
          name: 'city',
          type: 'categorical',
          uniqueCount: 2,
        }),
        expect.objectContaining({
          name: 'date',
          type: 'datetime',
        }),
      ]),
    )
    expect(profile.candidateTargetColumns).toContain('sales')
    expect(profile.candidateFeatureColumns).toEqual(expect.arrayContaining(['price', 'city']))
  })

  it('limits scanning to protect agent context size', () => {
    const rows = Array.from({ length: 6000 }, (_, index) => ({
      sales: index,
      price: index * 2,
    }))

    const profile = buildDataProfile(rows)

    expect(profile.rowCount).toBe(6000)
    expect(profile.scannedRowCount).toBe(5000)
  })
})
