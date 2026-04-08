import { computed, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import {
  normalizePropertyFieldTreeOptions,
  usePropertyFieldTreeSearch,
} from '../usePropertyFieldTreeSearch'

const treeOptions = [
  {
    key: 'group-1',
    label: '一级分组',
    children: [
      {
        key: 'group-1-1',
        label: '二级分组',
        children: [{ key: 'leaf-1', label: '目标节点' }],
      },
    ],
  },
  {
    key: 'group-2',
    label: '其他分组',
    children: [{ key: 'leaf-2', label: '普通节点' }],
  },
]

const createSearchHarness = () =>
  defineComponent({
    setup(_, { expose }) {
      const normalizedOptions = computed(() =>
        normalizePropertyFieldTreeOptions(treeOptions, false),
      )

      const state = usePropertyFieldTreeSearch({
        options: normalizedOptions,
        debounceMs: 150,
      })

      expose(state)

      return () => null
    },
  })

describe('usePropertyFieldTreeSearch', () => {
  it('延迟生效查询并展开命中路径', async () => {
    vi.useFakeTimers()
    const wrapper = mount(createSearchHarness())
    const exposed = wrapper.vm as unknown as {
      query: string
      filteredOptions: Array<{ label?: string; children?: Array<{ label?: string }> }>
      expandedKeys: Record<string, boolean>
    }

    exposed.query = '目标'
    await wrapper.vm.$nextTick()

    expect(exposed.filteredOptions).toHaveLength(2)
    expect(exposed.expandedKeys).toEqual({})

    vi.advanceTimersByTime(150)
    await wrapper.vm.$nextTick()

    expect(exposed.filteredOptions).toHaveLength(1)
    expect(exposed.filteredOptions[0]?.label).toBe('一级分组')
    expect(exposed.expandedKeys).toEqual({
      'group-1': true,
      'group-1-1': true,
    })

    vi.useRealTimers()
  })

  it('连续快速输入时只按最后一次查询过滤', async () => {
    vi.useFakeTimers()
    const wrapper = mount(createSearchHarness())
    const exposed = wrapper.vm as unknown as {
      query: string
      filteredOptions: Array<{ label?: string; children?: Array<{ label?: string }> }>
    }

    exposed.query = '目'
    exposed.query = '普通'
    await wrapper.vm.$nextTick()

    vi.advanceTimersByTime(149)
    await wrapper.vm.$nextTick()
    expect(exposed.filteredOptions).toHaveLength(2)

    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()

    expect(exposed.filteredOptions).toHaveLength(1)
    expect(exposed.filteredOptions[0]?.label).toBe('其他分组')

    vi.useRealTimers()
  })

  it('全部展开和全部收起会维护整棵树的展开状态', () => {
    const wrapper = mount(createSearchHarness())
    const exposed = wrapper.vm as unknown as {
      expandedKeys: Record<string, boolean>
      expandAllNodes: () => void
      collapseAllNodes: () => void
    }

    exposed.expandAllNodes()
    expect(exposed.expandedKeys).toEqual({
      'group-1': true,
      'group-1-1': true,
      'group-2': true,
    })

    exposed.collapseAllNodes()
    expect(exposed.expandedKeys).toEqual({})
  })
})
