import { describe, expect, it } from 'vitest'
import { getWorkflowLayoutMetrics } from '../layout'

describe('getWorkflowLayoutMetrics', () => {
  it('returns widescreen metrics when viewport width is at least 1600', () => {
    const metrics = getWorkflowLayoutMetrics(1920)

    expect(metrics.sidebarWidth).toBe(336)
    expect(metrics.logExpandedHeight).toBe(248)
    expect(metrics.contentPadding).toBe(16)
    expect(metrics.nodeListItemPaddingClass).toBe('p-3')
  })

  it('keeps default metrics on standard screens', () => {
    const metrics = getWorkflowLayoutMetrics(1440)

    expect(metrics.sidebarWidth).toBe(340)
    expect(metrics.logExpandedHeight).toBe(300)
    expect(metrics.contentPadding).toBe(24)
    expect(metrics.nodeListItemPaddingClass).toBe('p-3.5')
  })
})
