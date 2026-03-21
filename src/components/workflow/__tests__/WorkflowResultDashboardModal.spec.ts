import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowResultDashboardModal from '../WorkflowResultDashboardModal.vue'
import type { WorkflowResultDashboardSummary } from '../resultDashboard'

const summary: WorkflowResultDashboardSummary = {
  workflowName: '测试工作流',
  status: 'success',
  startTime: Date.now(),
  duration: 1200,
  nodeCount: 2,
  selectedDefaultNodeIds: ['node_a', 'node_b'],
  metrics: {
    outputCount: 2,
    errorCount: 0,
    terminalOutputCount: 2,
  },
  nodes: [
    {
      nodeId: 'node_a',
      label: '报告 A',
      type: 'pearson',
      category: 'terminal',
      isExecutionTarget: true,
      status: 'success',
      hasOutput: true,
      isTerminal: true,
      resultKind: 'report',
      resultKindLabel: '分析报告',
      summary: 'A 摘要',
      output: {
        kind: 'report',
        payload: { title: 'A', sections: [] },
        preview: { viewer: 'report-viewer' },
      },
    },
    {
      nodeId: 'node_b',
      label: '报告 B',
      type: 'spearman',
      category: 'terminal',
      isExecutionTarget: true,
      status: 'success',
      hasOutput: true,
      isTerminal: true,
      resultKind: 'report',
      resultKindLabel: '分析报告',
      summary: 'B 摘要',
      output: {
        kind: 'report',
        payload: { title: 'B', sections: [] },
        preview: { viewer: 'report-viewer' },
      },
    },
  ],
}

describe('WorkflowResultDashboardModal', () => {
  it('supports drag reorder in grid mode', async () => {
    const wrapper = mount(WorkflowResultDashboardModal, {
      props: {
        visible: true,
        summary,
      },
      global: {
        stubs: {
          Dialog: {
            template: '<div><slot name="header" /><slot /></div>',
          },
          Button: {
            template: '<button><slot />{{ label }}</button>',
            props: ['label'],
          },
          WorkflowResultPanel: {
            props: ['node'],
            template: '<div class="panel-stub">{{ node.label }}</div>',
          },
          DataAnalysisModal: true,
        },
      },
    })

    const getPanelLabels = () => wrapper.findAll('.panel-stub').map((item) => item.text())

    expect(getPanelLabels()).toEqual(['报告 A', '报告 B'])

    const gridItems = wrapper.findAll('.dashboard-grid__item')
    await gridItems[0]!.trigger('dragstart')
    await gridItems[1]!.trigger('drop')

    expect(getPanelLabels()).toEqual(['报告 B', '报告 A'])
  })

  it('resizes free-grid cards by dragging the bottom-right handle', async () => {
    const wrapper = mount(WorkflowResultDashboardModal, {
      props: {
        visible: true,
        summary,
      },
      global: {
        stubs: {
          Dialog: {
            template: '<div><slot name="header" /><slot /></div>',
          },
          Button: {
            template: '<button><slot />{{ label }}</button>',
            props: ['label'],
          },
          WorkflowResultPanel: {
            props: ['node'],
            template: '<div class="panel-stub">{{ node.label }}</div>',
          },
          DataAnalysisModal: true,
        },
      },
    })

    const freeGridModeButton = wrapper.findAll('.toolbar-button')[1]
    await freeGridModeButton!.trigger('click')

    const firstItem = wrapper.find('.dashboard-free-grid__item')
    expect(firstItem.attributes('style')).not.toContain('left:')
    expect(firstItem.attributes('style')).not.toContain('top:')
    expect(firstItem.attributes('style')).toContain('width: 420px')
    expect(firstItem.attributes('style')).toContain('height: 320px')

    const resizeHandle = wrapper.find('.dashboard-free-grid__resize-handle')
    await resizeHandle.trigger('mousedown', {
      clientX: 0,
      clientY: 0,
    })

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 240, clientY: 320 }))
    await wrapper.vm.$nextTick()

    expect(firstItem.attributes('style')).toContain('width: 660px')
    expect(firstItem.attributes('style')).toContain('height: 640px')

    window.dispatchEvent(new MouseEvent('mouseup'))
  })
})
