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

    const preview = createSafeJsonPreview(data)
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

    const preview = createSafeJsonPreview(data)
    const json = stringifySafePreview(preview)

    expect(preview.kind).toBe('report')
    expect(json).toContain('"sectionCount": 1')
    expect(json).toContain('"sampleCount": 4096')
    expect(json).toContain('"itemCount": 50')
    expect(json).not.toContain('"values"')
  })
})
