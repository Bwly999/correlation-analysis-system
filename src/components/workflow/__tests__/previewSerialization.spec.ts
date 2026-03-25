import { describe, expect, it } from 'vitest'
import { createJsonResult, createReportResult } from '@/nodes/result'
import {
  DEFAULT_PREVIEW_SERIALIZE_OPTIONS,
  createSafeJsonPreview,
  stringifySafePreview,
} from '../previewSerialization'

describe('previewSerialization', () => {
  it('truncates deep json payloads and marks preview metadata', () => {
    const data = createJsonResult({
      list: Array.from({ length: DEFAULT_PREVIEW_SERIALIZE_OPTIONS.maxArrayItems + 3 }, (_, index) => ({
        index,
        nested: {
          label: `row-${index}`,
          deeper: {
            blocked: true,
          },
        },
      })),
      text: 'x'.repeat(DEFAULT_PREVIEW_SERIALIZE_OPTIONS.maxStringLength + 40),
    })

    const preview = createSafeJsonPreview(data) as ReturnType<typeof createJsonResult>
    const json = stringifySafePreview(preview)

    expect(preview.meta?.previewTruncated).toBe(true)
    expect(json).toContain('"__truncated": true')
    expect(json).toContain('"__omittedItems"')
    expect(json).toContain('"__truncatedString"')
    expect(json).not.toContain('"blocked": true')
  })

  it('creates report summary preview instead of serializing the full report payload', () => {
    const data = createReportResult({
      title: '超大报告',
      sections: [
        {
          type: 'details',
          title: '完整明细',
          items: Array.from({ length: 50 }, (_, index) => ({
            feature: `f${index}`,
            values: Array.from({ length: 20 }, (_, valueIndex) => valueIndex),
          })),
        },
      ],
      metadata: {
        sampleCount: 4096,
      },
    })

    const preview = createSafeJsonPreview(data) as ReturnType<typeof createReportResult>
    const json = stringifySafePreview(preview)

    expect(preview.kind).toBe('report')
    expect(json).toContain('"sectionCount": 1')
    expect(json).toContain('"sampleCount": 4096')
    expect(json).toContain('"itemCount": 50')
    expect(json).not.toContain('"values"')
  })

  it('sanitizes oversized report metadata instead of keeping the raw meta payload', () => {
    const data = createReportResult(
      {
        title: 'Pearson 相关系数矩阵分析',
        sections: [
          {
            type: 'text',
            content: '摘要',
          },
        ],
      },
      {
        meta: {
          sourceData: Array.from({ length: 200 }, (_, index) => ({ id: index, feature: `f${index}` })),
          pairDetails: Array.from({ length: 400 }, (_, index) => ({
            pair: `f${index}-target`,
            value: index / 100,
          })),
          matrixData: Array.from({ length: 100 }, (_, rowIndex) =>
            Array.from({ length: 100 }, (_, colIndex) => rowIndex * colIndex),
          ),
          metrics: {
            sampleCount: 4096,
          },
        },
      },
    )

    const preview = createSafeJsonPreview(data) as ReturnType<typeof createReportResult>
    const json = stringifySafePreview(preview)

    expect(json).toContain('"__reason": "budgetExceeded"')
    expect(json).toContain('"pairDetails"')
    expect(json).not.toContain('"pair": "f399-target"')
    expect(json).not.toContain('"sourceData": [')
    expect(json).not.toContain('"matrixData": [')
  })

  it('falls back early when a plain object exceeds the global preview budget', () => {
    const hugeObject = Object.fromEntries(
      Array.from({ length: 5000 }, (_, index) => [
        `field_${index}`,
        {
          nested: `value-${index}`,
          payload: 'x'.repeat(120),
        },
      ]),
    )

    const preview = createSafeJsonPreview(hugeObject)
    const json = stringifySafePreview(preview)

    expect(json).toContain('"__reason": "budgetExceeded"')
    expect(json).toContain('"__previewTruncated": true')
    expect(json).not.toContain('field_4999')
  })
})
