import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowResultDashboardModal from '../WorkflowResultDashboardModal.vue'
import type { WorkflowResultDashboardSummary } from '../resultDashboard'

vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue', 'handle', 'animation', 'itemKey', 'tag'],
    emits: ['update:modelValue'],
    template: `
      <component :is="tag || 'div'" data-testid="draggable-root">
        <slot />
      </component>
    `,
  },
}))

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

const createWrapper = () =>
  mount(WorkflowResultDashboardModal, {
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

describe('WorkflowResultDashboardModal', () => {
  it('renders a top-right X icon close button and emits close on click', async () => {
    const wrapper = createWrapper()

    const closeButton = wrapper.find('button[aria-label="关闭结果看板"]')
    expect(closeButton.exists()).toBe(true)
    expect(closeButton.find('svg').exists()).toBe(true)

    await closeButton.trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('uses vue-draggable-plus with grip-only handle and animated reorder in grid mode', async () => {
    const wrapper = createWrapper()
    const getPanelLabels = () => wrapper.findAll('.panel-stub').map((item) => item.text())

    expect(getPanelLabels()).toEqual(['报告 A', '报告 B'])

    const draggable = wrapper.findComponent({ name: 'VueDraggable' })
    expect(draggable.exists()).toBe(true)
    expect(draggable.props('handle')).toBe('.dashboard-panel__drag-handle')
    expect(draggable.props('animation')).toBe(180)

    await draggable.vm.$emit('update:modelValue', [summary.nodes[1], summary.nodes[0]])
    await wrapper.vm.$nextTick()

    expect(getPanelLabels()).toEqual(['报告 B', '报告 A'])
  })

  it('uses vue-draggable-plus in free-grid mode and keeps bottom-right resize behavior', async () => {
    const wrapper = createWrapper()

    const freeGridModeButton = wrapper.findAll('.toolbar-button')[1]
    await freeGridModeButton!.trigger('click')

    const draggables = wrapper.findAllComponents({ name: 'VueDraggable' })
    const freeGridDraggable = draggables[0]
    expect(freeGridDraggable).toBeTruthy()
    expect(freeGridDraggable!.props('handle')).toBe('.dashboard-panel__drag-handle')
    expect(freeGridDraggable!.props('animation')).toBe(180)

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
