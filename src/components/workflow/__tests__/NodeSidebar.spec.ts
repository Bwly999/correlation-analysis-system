import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NodeSidebar from '../NodeSidebar.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

vi.mock('../nodes/NodeIcon.vue', () => ({
  default: {
    props: ['type'],
    template: '<div class="node-icon">{{ type }}</div>',
  },
}))

describe('NodeSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
  })

  const mountSidebar = () =>
    mount(NodeSidebar, {
      global: {
        directives: {
          tooltip: () => undefined,
        },
      },
    })

  it('groups nodes by task-oriented library groups while preserving category filters', async () => {
    const wrapper = mountSidebar()

    const groupTitles = wrapper.findAll('[data-testid="library-group-title"]').map((node) => node.text())
    const filterLabels = wrapper.findAll('[data-testid="category-filter"]').map((node) => node.text())

    expect(filterLabels).toEqual(['全部', '数据接入', '数据准备', '分析输出'])
    expect(groupTitles).toContain('导入数据')
    expect(groupTitles).toContain('统计分析')
    expect(wrapper.text()).toContain('单调性分析')

    await wrapper.findAll('[data-testid="category-filter"]')[2]?.trigger('click')

    const actionGroupTitles = wrapper
      .findAll('[data-testid="library-group-title"]')
      .map((node) => node.text())

    expect(actionGroupTitles).toContain('清洗与筛选')
    expect(actionGroupTitles).not.toContain('统计分析')
    expect(wrapper.text()).not.toContain('单调性分析')
  })

  it('searches by aliases and help usage text, and explains the match reason', async () => {
    const wrapper = mountSidebar()
    const input = wrapper.find('input')

    await input.setValue('回归')

    expect(wrapper.text()).toContain('Lasso 回归')
    expect(wrapper.text()).toContain('多元线性回归')
    expect(wrapper.text()).toContain('命中')

    await input.setValue('上传')

    expect(wrapper.text()).toContain('本地文件导入')
    expect(wrapper.text()).toContain('用途匹配')
  })

  it('records recently used nodes and prioritizes connectable shortcuts during pending connections', async () => {
    const store = useWorkflowStore()
    const addAndConnectNode = vi.spyOn(store, 'addAndConnectNode')

    const wrapper = mountSidebar()
    const fileImportCard = wrapper.find('[data-node-type="file-import"]')

    await fileImportCard.trigger('click')

    expect(addAndConnectNode).toHaveBeenCalledWith(
      'file-import',
      '本地文件导入',
      expect.objectContaining({ x: 200, y: 200 }),
    )

    const persisted = JSON.parse(window.localStorage.getItem('workflow-node-sidebar-recent') || '[]')
    expect(persisted[0]).toBe('file-import')
    expect(wrapper.text()).toContain('最近使用')
    expect(wrapper.text()).toContain('本地文件导入')

    wrapper.unmount()

    const storeAgain = useWorkflowStore()
    storeAgain.nodes = [
      {
        id: 'source-1',
        type: 'custom',
        position: { x: 10, y: 20 },
        label: '来源',
        data: {
          label: '来源',
          type: 'manual-json-import',
          category: 'trigger',
          config: {},
          status: 'idle',
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]
    storeAgain.pendingConnection = {
      sourceNodeId: 'source-1',
    }

    const reconnectWrapper = mountSidebar()

    expect(reconnectWrapper.text()).toContain('当前可接入')
    expect(reconnectWrapper.find('[data-shortcut-section="connectable"]').exists()).toBe(true)
    expect(reconnectWrapper.find('[data-shortcut-section="recent"]').exists()).toBe(false)
  })

  it('shows the multiple-input badge in both browse groups and shortcut sections', async () => {
    const wrapper = mountSidebar()
    const mergeBrowseCard = wrapper.find('[data-group-id="merge-aggregate"] [data-node-type="data-merge"]')

    expect(mergeBrowseCard.exists()).toBe(true)
    expect(mergeBrowseCard.text()).toContain('处理')
    expect(mergeBrowseCard.text()).toContain('多输入')

    await mergeBrowseCard.trigger('click')
    wrapper.unmount()

    const shortcutWrapper = mountSidebar()
    const mergeShortcutCard = shortcutWrapper.find(
      '[data-shortcut-section="recent"] [data-node-type="data-merge"]',
    )

    expect(mergeShortcutCard.exists()).toBe(true)
    expect(mergeShortcutCard.text()).toContain('多输入')
  })

  it('shows context recommendations from the latest workflow node before falling back to static defaults', () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'source-1',
        type: 'custom',
        position: { x: 10, y: 20 },
        label: '导入',
        data: {
          label: '导入',
          type: 'file-import',
          category: 'trigger',
          config: {},
          status: 'idle',
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]

    const wrapper = mountSidebar()
    const contextSection = wrapper.find('[data-shortcut-section="context"]')

    expect(contextSection.exists()).toBe(true)
    expect(contextSection.text()).toContain('上下文推荐')
    expect(contextSection.text()).toContain('去重')
    expect(contextSection.text()).toContain('数据筛选')
    expect(contextSection.text()).toContain('缺失/异常值处理')
    expect(contextSection.text()).not.toContain('图表展示')
  })

  it('prioritizes the source node recommended next steps inside the connectable shortcut section', () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'source-1',
        type: 'custom',
        position: { x: 10, y: 20 },
        label: '导入',
        data: {
          label: '导入',
          type: 'file-import',
          category: 'trigger',
          config: {},
          status: 'idle',
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]
    store.pendingConnection = {
      sourceNodeId: 'source-1',
    }

    const wrapper = mountSidebar()
    const nodeTypes = wrapper
      .findAll('[data-shortcut-section="connectable"] [data-node-type]')
      .map((node) => node.attributes('data-node-type'))

    expect(nodeTypes.slice(0, 3)).toEqual(['data-dedup', 'data-filter', 'data-missing-outlier'])
  })

  it('collapses and expands an individual browse group within the current sidebar session', async () => {
    const wrapper = mountSidebar()
    const importGroup = wrapper.find('[data-group-id="import-data"]')
    const toggle = importGroup.find('[data-testid="group-toggle"]')

    expect(importGroup.find('[data-testid="group-body"]').exists()).toBe(true)

    await toggle.trigger('click')

    expect(importGroup.find('[data-testid="group-body"]').exists()).toBe(false)

    await toggle.trigger('click')

    expect(importGroup.find('[data-testid="group-body"]').exists()).toBe(true)
  })

  it('collapses and expands the fallback shortcut section for common starters', async () => {
    const wrapper = mountSidebar()
    const shortcutSection = wrapper.find('[data-shortcut-section="recommended"]')
    const toggle = shortcutSection.find('[data-testid="shortcut-toggle"]')
    const nodeTypes = wrapper
      .findAll('[data-shortcut-section="recommended"] [data-node-type]')
      .map((node) => node.attributes('data-node-type'))

    expect(shortcutSection.exists()).toBe(true)
    expect(shortcutSection.text()).toContain('常用起点')
    expect(nodeTypes).toEqual(['file-import', 'manual-json-import', 'neighbor-system'])
    expect(shortcutSection.find('[data-testid="shortcut-body"]').exists()).toBe(true)

    await toggle.trigger('click')

    expect(shortcutSection.find('[data-testid="shortcut-body"]').exists()).toBe(false)

    await toggle.trigger('click')

    expect(shortcutSection.find('[data-testid="shortcut-body"]').exists()).toBe(true)
  })
})
