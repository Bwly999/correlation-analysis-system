import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { createTableCollectionResult, createTableResult } from '@/nodes/result'
import { useDataQualityProfile } from '../useDataQualityProfile'

describe('useDataQualityProfile', () => {
  it('calculates missing rate and numeric statistics for table results', () => {
    const { fieldProfiles, summary, missingBuckets, fieldsAtOrAboveMissingRate } =
      useDataQualityProfile(
        computed(() =>
          createTableResult([
            { id: 'A', score: 10, temp: 20, remark: '' },
            { id: 'B', score: null, temp: 30, remark: 'ok' },
            { id: 'C', score: 30, temp: Number.NaN, remark: undefined },
            { id: 'D', score: '', temp: 40, remark: 'hold' },
          ]),
        ),
      )

    expect(summary.value).toMatchObject({
      rowCount: 4,
      fieldCount: 4,
      missingFieldCount: 3,
      numericFieldCount: 2,
    })
    expect(summary.value.highestMissingRate).toBe(0.5)

    const score = fieldProfiles.value.find((field) => field.field === 'score')
    expect(score).toMatchObject({
      missingCount: 2,
      nonMissingCount: 2,
      missingRate: 0.5,
      type: 'number',
      min: 10,
      max: 30,
      mean: 20,
    })

    const temp = fieldProfiles.value.find((field) => field.field === 'temp')
    expect(temp).toMatchObject({
      missingCount: 1,
      missingRate: 0.25,
      min: 20,
      max: 40,
      mean: 30,
    })

    const remark = fieldProfiles.value.find((field) => field.field === 'remark')
    expect(remark).toMatchObject({
      type: 'string',
      missingCount: 2,
      missingRate: 0.5,
    })
    expect(remark?.min).toBeUndefined()
    expect(remark?.max).toBeUndefined()
    expect(remark?.mean).toBeUndefined()

    expect(fieldsAtOrAboveMissingRate.value(30).map((field) => field.field)).toEqual([
      'remark',
      'score',
    ])
    expect(missingBuckets.value.map((bucket) => [bucket.label, bucket.count])).toEqual([
      ['0%', 1],
      ['0-10%', 0],
      ['10-30%', 1],
      ['30-60%', 2],
      ['60%+', 0],
    ])
  })

  it('merges table collection groups before profiling the full field set', () => {
    const { fieldProfiles, summary, fieldsAtOrAboveMissingRate } = useDataQualityProfile(
      computed(() =>
        createTableCollectionResult([
          {
            name: 'A',
            data: [
              { score: 1, onlyA: 'x' },
              { score: 2, onlyA: '' },
            ],
          },
          {
            name: 'B',
            data: [
              { score: null, onlyB: 9 },
              { score: 4, onlyB: 10 },
            ],
          },
        ]),
      ),
    )

    expect(summary.value.rowCount).toBe(4)
    expect(summary.value.fieldCount).toBe(3)
    expect(fieldProfiles.value.map((field) => field.field)).toEqual(['onlyA', 'onlyB', 'score'])
    expect(fieldsAtOrAboveMissingRate.value(50).map((field) => field.field)).toEqual([
      'onlyA',
      'onlyB',
    ])
  })

  it('prefers source profile and metrics when available', () => {
    const { rows, fieldProfiles, summary, missingBuckets, fieldsAtOrAboveMissingRate } =
      useDataQualityProfile(
        computed(() =>
          createTableResult(
            [
              { score: 1, note: 'x' },
              { score: 2, note: 'y' },
            ],
            {
              meta: {
                profile: [
                  {
                    field: 'score',
                    type: 'string',
                    missingCount: 3,
                    nonMissingCount: 9,
                    missingRate: 0.25,
                  },
                  {
                    field: 'note',
                    type: 'number',
                    missingCount: 0,
                    nonMissingCount: 12,
                    missingRate: 0,
                    min: 10,
                    max: 30,
                    mean: 20,
                  },
                ],
                metrics: {
                  rowCount: 12,
                  fieldCount: 2,
                  numericFieldCount: 1,
                },
              },
            },
          ),
        ),
      )

    expect(rows.value).toHaveLength(2)
    expect(fieldProfiles.value).toEqual([
      {
        field: 'note',
        type: 'number',
        totalCount: 12,
        missingCount: 0,
        nonMissingCount: 12,
        missingRate: 0,
        min: 10,
        max: 30,
        mean: 20,
      },
      {
        field: 'score',
        type: 'string',
        totalCount: 12,
        missingCount: 3,
        nonMissingCount: 9,
        missingRate: 0.25,
        min: undefined,
        max: undefined,
        mean: undefined,
      },
    ])
    expect(summary.value).toMatchObject({
      rowCount: 12,
      fieldCount: 2,
      missingFieldCount: 1,
      numericFieldCount: 1,
      highestMissingRate: 0.25,
    })
    expect(missingBuckets.value.map((bucket) => [bucket.label, bucket.count])).toEqual([
      ['0%', 1],
      ['0-10%', 0],
      ['10-30%', 1],
      ['30-60%', 0],
      ['60%+', 0],
    ])
    expect(fieldsAtOrAboveMissingRate.value(20).map((field) => field.field)).toEqual(['score'])
  })

  it('can build summary from source profile without requiring original rows', () => {
    const { rows, fieldProfiles, summary, hasProfileData, fieldsAtOrAboveMissingRate } =
      useDataQualityProfile(
        computed(() =>
          createTableResult([], {
            meta: {
              profile: [
                {
                  field: 'score',
                  type: 'number',
                  missingCount: 4,
                  nonMissingCount: 6,
                  missingRate: 0.4,
                  min: 1,
                  max: 6,
                  mean: 3.5,
                },
              ],
              metrics: {
                rowCount: 10,
                fieldCount: 1,
                numericFieldCount: 1,
              },
            },
          }),
        ),
      )

    expect(rows.value).toEqual([])
    expect(fieldProfiles.value).toHaveLength(1)
    expect(summary.value).toMatchObject({
      rowCount: 10,
      fieldCount: 1,
      missingFieldCount: 1,
      numericFieldCount: 1,
      highestMissingRate: 0.4,
    })
    expect(hasProfileData.value).toBe(true)
    expect(fieldsAtOrAboveMissingRate.value(30).map((field) => field.field)).toEqual(['score'])
  })
})
