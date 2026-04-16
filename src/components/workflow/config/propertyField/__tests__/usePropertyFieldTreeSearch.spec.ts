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

const createLargeTreeOptions = () =>
  Array.from({ length: 8 }, (_, groupIndex) => ({
    key: `group-${groupIndex + 1}`,
    label: `分组${groupIndex + 1}`,
    children: Array.from({ length: 8 }, (_, subGroupIndex) => ({
      key: `group-${groupIndex + 1}-${subGroupIndex + 1}`,
      label: `子分组${groupIndex + 1}-${subGroupIndex + 1}`,
      children: Array.from({ length: 10 }, (_, leafIndex) => ({
        key: `leaf-${groupIndex + 1}-${subGroupIndex + 1}-${leafIndex + 1}`,
        label: `温度指标${groupIndex + 1}-${subGroupIndex + 1}-${leafIndex + 1}`,
      })),
    })),
  }))

const createSearchHarness = (
  sourceOptions = treeOptions,
  overrides?: {
    maxSearchLeafMatches?: number
    maxExpandKeys?: number
    enableSearchResultGuard?: boolean
    matchMode?: 'contains' | 'regex'
  },
) =>
  defineComponent({
    setup(_, { expose }) {
      const normalizedOptions = computed(() =>
        normalizePropertyFieldTreeOptions(sourceOptions, false),
      )

      const state = usePropertyFieldTreeSearch({
        options: normalizedOptions,
        debounceMs: 150,
        ...overrides,
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

  it('安全展开会限制展开键数量并允许收起', () => {
    const wrapper = mount(
      createSearchHarness(createLargeTreeOptions(), {
        maxExpandKeys: 10,
      }),
    )
    const exposed = wrapper.vm as unknown as {
      expandedKeys: Record<string, boolean>
      expandAllNodes: () => void
      collapseAllNodes: () => void
      expandAllLabel: string
    }

    expect(exposed.expandAllLabel).toBe('安全展开')

    exposed.expandAllNodes()
    expect(Object.keys(exposed.expandedKeys)).toHaveLength(10)

    exposed.collapseAllNodes()
    expect(exposed.expandedKeys).toEqual({})
  })

  it('搜索结果过多时只保留命中分组和摘要节点', async () => {
    vi.useFakeTimers()
    const wrapper = mount(
      createSearchHarness(createLargeTreeOptions(), {
        maxSearchLeafMatches: 6,
        maxExpandKeys: 20,
      }),
    )
    const exposed = wrapper.vm as unknown as {
      query: string
      filteredOptions: Array<{
        key?: string
        label?: string
        children?: Array<{ key?: string; label?: string; children?: Array<{ key?: string; label?: string }> }>
      }>
      expandedKeys: Record<string, boolean>
      isSearchResultTruncated: boolean
      searchResultMessage: string
    }

    exposed.query = '温度指标'
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(150)
    await wrapper.vm.$nextTick()

    expect(exposed.isSearchResultTruncated).toBe(true)
    expect(exposed.searchResultMessage).toContain('已按分组摘要显示')
    expect(exposed.filteredOptions.length).toBeGreaterThan(0)
    const summarizedChildren = exposed.filteredOptions[0]?.children?.[0]?.children || []
    expect(summarizedChildren.some((node) => node.key?.includes('__search-summary__'))).toBe(true)
    expect(
      summarizedChildren.every(
        (node) =>
          node.label?.includes('温度指标') || node.label?.includes('请继续缩小搜索范围'),
      ),
    ).toBe(true)
    expect(Object.keys(exposed.expandedKeys).length).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it('关闭搜索保护时返回完整命中子树且不显示摘要节点', async () => {
    vi.useFakeTimers()
    const wrapper = mount(
      createSearchHarness(createLargeTreeOptions(), {
        maxSearchLeafMatches: 6,
        maxExpandKeys: 20,
        enableSearchResultGuard: false,
      }),
    )
    const exposed = wrapper.vm as unknown as {
      query: string
      filteredOptions: Array<{
        children?: Array<{ children?: Array<{ key?: string; label?: string }> }>
      }>
      isSearchResultTruncated: boolean
      searchResultMessage: string
    }

    exposed.query = '温度指标'
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(150)
    await wrapper.vm.$nextTick()

    expect(exposed.isSearchResultTruncated).toBe(false)
    expect(exposed.searchResultMessage).toBe('')
    const leaves = exposed.filteredOptions[0]?.children?.flatMap((child) => child.children || []) || []
    expect(leaves.length).toBeGreaterThan(6)
    expect(leaves.some((node) => node.key?.includes('__search-summary__'))).toBe(false)

    vi.useRealTimers()
  })

  it('搜索态手动展开父节点时仍只暴露命中子树', async () => {
    vi.useFakeTimers()
    const wrapper = mount(createSearchHarness())
    const exposed = wrapper.vm as unknown as {
      query: string
      filteredOptions: Array<{
        label?: string
        children?: Array<{ label?: string; children?: Array<{ label?: string }> }>
      }>
      expandedKeys: Record<string, boolean>
    }

    exposed.query = '目标'
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(150)
    await wrapper.vm.$nextTick()

    exposed.expandedKeys = {
      'group-1': true,
      'group-1-1': true,
    }
    await wrapper.vm.$nextTick()

    expect(exposed.filteredOptions).toHaveLength(1)
    expect(exposed.filteredOptions[0]?.label).toBe('一级分组')
    expect(exposed.filteredOptions[0]?.children).toHaveLength(1)
    expect(exposed.filteredOptions[0]?.children?.[0]?.label).toBe('二级分组')
    expect(exposed.filteredOptions[0]?.children?.[0]?.children).toEqual([
      expect.objectContaining({
        key: 'leaf-1',
        label: '目标节点',
      }),
    ])

    vi.useRealTimers()
  })

  it('正则模式下按表达式匹配节点', async () => {
    vi.useFakeTimers()
    const wrapper = mount(
      createSearchHarness([
        {
          key: 'group-1',
          label: '工序一',
          children: [
            { key: 'leaf-1', label: '温度-01' },
            { key: 'leaf-2', label: '压力-01' },
          ],
        },
      ], {
        matchMode: 'regex',
      }),
    )
    const exposed = wrapper.vm as unknown as {
      query: string
      filteredOptions: Array<{ label?: string; children?: Array<{ label?: string }> }>
      searchErrorMessage: string
    }

    exposed.query = '^温度-\\d+$'
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(150)
    await wrapper.vm.$nextTick()

    expect(exposed.searchErrorMessage).toBe('')
    expect(exposed.filteredOptions).toHaveLength(1)
    expect(exposed.filteredOptions[0]?.children).toEqual([
      expect.objectContaining({
        key: 'leaf-1',
        label: '温度-01',
      }),
    ])

    vi.useRealTimers()
  })

  it('正则模式下表达式无效时显示错误且返回空结果', async () => {
    vi.useFakeTimers()
    const wrapper = mount(
      createSearchHarness(treeOptions, {
        matchMode: 'regex',
      }),
    )
    const exposed = wrapper.vm as unknown as {
      query: string
      filteredOptions: Array<{ label?: string }>
      searchErrorMessage: string
    }

    exposed.query = '['
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(150)
    await wrapper.vm.$nextTick()

    expect(exposed.searchErrorMessage).toBe('正则表达式无效，请检查输入格式')
    expect(exposed.filteredOptions).toEqual([])

    vi.useRealTimers()
  })
})
