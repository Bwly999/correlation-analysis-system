import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createJsonResult } from '@/nodes/result'
import WorkflowResultPanel from '../WorkflowResultPanel.vue'
import type { ResultDashboardNode } from '../resultDashboard'

vi.mock('../viewers/JsonViewer.vue', () => ({
  default: {
    props: ['data'],
    template: '<div class="json-viewer-stub">{{ JSON.stringify(data) }}</div>',
  },
}))

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

  it('renders the fallback json viewer immediately for plain outputs', () => {
    const node = createNode()
    node.hasOutput = true
    node.resultKind = 'json'
    node.resultKindLabel = 'JSON 数据'
    node.output = createJsonResult({
      message: '即时渲染',
    })

    const wrapper = mount(WorkflowResultPanel, {
      props: {
        node,
      },
    })

    expect(wrapper.get('.json-viewer-stub').text()).toContain('即时渲染')
  })
})
