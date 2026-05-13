import { describe, expect, it } from 'vitest'
import { helpCenterContent } from '@/help/content'
import { getWorkflowTemplateDefinition } from '../templates'

describe('dashboard comparison template', () => {
  it('no longer relies on chart-display as a template terminal', () => {
    const template = getWorkflowTemplateDefinition('dashboard-comparison')

    expect(template?.keyNodes).not.toContain('图表展示')
    expect(template?.workflow.nodes.map((node) => node.data.type)).not.toContain('chart-display')
    expect(template?.workflow.edges).toHaveLength(1)
  })

  it('stops recommending chart-display in the help center analysis step', () => {
    const analysisStep = helpCenterContent.quickStart.find((step) => step.step === 3)

    expect(analysisStep?.recommendedNodes).not.toContain('chart-display')
  })
})
