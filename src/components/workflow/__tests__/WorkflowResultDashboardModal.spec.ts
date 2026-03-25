import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
      writable: true,
    })
  })

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

  it('keeps a usable minimum panel height in grid mode when only one node is selected', async () => {
    const wrapper = createWrapper()

    const secondCheckbox = wrapper.findAll('input[type="checkbox"]')[1]
    if (!secondCheckbox) {
      throw new Error('未找到第二个节点选择复选框')
    }
    await secondCheckbox.setValue(false)

    const draggable = wrapper.findComponent({ name: 'VueDraggable' })
    expect(draggable.exists()).toBe(true)
    expect(draggable.attributes('style')).toContain('grid-auto-rows: minmax(320px, auto);')

    const gridItem = wrapper.find('.dashboard-grid__item')
    expect(gridItem.exists()).toBe(true)
    expect(gridItem.attributes('style')).toContain('min-height: 320px;')
  })

  it('toggles the node selector sidebar and expands the workspace width', async () => {
    const wrapper = createWrapper()

    const collapseButton = wrapper.find('button[aria-label="收起节点选择"]')
    expect(collapseButton.exists()).toBe(true)

    await collapseButton.trigger('click')

    expect(wrapper.find('.dashboard-sidebar--collapsed').exists()).toBe(true)
    expect(wrapper.findAll('button[aria-label="展开节点选择"]')).toHaveLength(1)
  })

  it('enters focus mode on fullscreen and hides overview and expanded sidebar by default', async () => {
    const requestFullscreen = vi.fn(async function (this: HTMLElement) {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: this,
      })
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

    const exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: null,
      })
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    })

    const wrapper = createWrapper()

    await wrapper.find('button[aria-label="进入全屏专注模式"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.dashboard-shell--focus').exists()).toBe(true)
    expect(wrapper.find('.dashboard-overview').exists()).toBe(false)
    expect(wrapper.find('.dashboard-sidebar--collapsed').exists()).toBe(true)
    expect(wrapper.find('.focus-mode-banner').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="退出全屏专注模式"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('按 Esc 退出全屏模式')
    expect(wrapper.text()).toContain('显示运行概览')

    await wrapper.find('button[aria-label="退出全屏专注模式"]').trigger('click')

    expect(exitFullscreen).toHaveBeenCalledTimes(1)
  })
})
