import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowResultPanel from '../WorkflowResultPanel.vue'
import type { ResultDashboardNode } from '../resultDashboard'

const createNode = (): ResultDashboardNode => ({
  nodeId: 'node_a',
  label: '测试节点',
  type: 'report',
  category: 'terminal',
  isExecutionTarget: true,
  status: 'success',
  hasOutput: false,
  isTerminal: true,
  resultKind: null,
  resultKindLabel: '分析报告',
  summary: '测试摘要',
  output: null,
})

describe('WorkflowResultPanel', () => {
  it('does not render deprecated size controls in free-grid mode', () => {
    const wrapper = mount(WorkflowResultPanel, {
      props: {
        node: createNode(),
        freeGrid: true,
      },
    })

    expect(wrapper.findAll('.panel-size-button')).toHaveLength(0)
    expect(wrapper.findAll('button')).toHaveLength(1)
  })
})
