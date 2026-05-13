import { describe, expect, it } from 'vitest'
import { buildWorkflowAiNodeCatalog } from '../catalog'

describe('workflow ai node catalog', () => {
  it('does not expose chart-display as a creatable node', () => {
    const catalog = buildWorkflowAiNodeCatalog()

    expect(catalog.map((item) => item.name)).not.toContain('chart-display')
  })
})
