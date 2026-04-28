import { describe, expect, it } from 'vitest'
import { getNodeDefinition } from '../registry'

describe('data-cleaning split nodes', () => {
  it('registers split cleaning nodes with focused responsibilities', () => {
    const dedupNode = getNodeDefinition('data-dedup')
    const missingOutlierNode = getNodeDefinition('data-missing-outlier')
    const encodingScalingNode = getNodeDefinition('data-encoding-scaling')

    expect(dedupNode).toBeTruthy()
    expect(missingOutlierNode).toBeTruthy()
    expect(encodingScalingNode).toBeTruthy()
  })

  it('uses multi-options for field selection in split nodes', () => {
    const dedupNode = getNodeDefinition('data-dedup')
    const missingOutlierNode = getNodeDefinition('data-missing-outlier')
    const encodingScalingNode = getNodeDefinition('data-encoding-scaling')

    expect(dedupNode?.properties.find((property) => property.name === 'deduplicationFields')?.type).toBe(
      'multi-options',
    )
    expect(missingOutlierNode?.properties.find((property) => property.name === 'targetColumns')?.type).toBe(
      'multi-options',
    )
    expect(encodingScalingNode?.properties.find((property) => property.name === 'targetColumns')?.type).toBe(
      'multi-options',
    )
  })

  it('keeps legacy data-cleaning as non-creatable compatibility node', () => {
    const legacyNode = getNodeDefinition('data-cleaning')
    expect(legacyNode).toBeTruthy()
    expect(legacyNode?.isLegacy).toBe(true)
  })
})
