import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AgGridCommunitySetFilter from '../common/AgGridCommunitySetFilter.vue'

describe('AgGridCommunitySetFilter', () => {
  it('内联展开并允许选择值', async () => {
    const filterChangedCallback = vi.fn()
    const getValue = vi.fn((node: any) => node?.data?.value)
    const forEachNode = vi.fn((cb: (node: any) => void) => {
      cb({ data: { value: 1 } })
      cb({ data: { value: 2 } })
    })
    const wrapper = mount(AgGridCommunitySetFilter, {
      props: {
        params: {
          api: { forEachNode },
          getValue,
          filterChangedCallback,
        } as any,
      },
    })

    // onMounted 调用 forEachNode + getValue 收集唯一值
    await flushPromises()
    expect(forEachNode).toHaveBeenCalled()
    // 永久展开：直接渲染选项列表，无需 toggle
    expect(wrapper.text()).toContain('筛选数值')
    expect(wrapper.text()).toContain('2 个唯一值')
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)

    // 勾选第一个值 → 触发 filterChangedCallback
    await checkboxes[0]!.setValue(true)
    expect(filterChangedCallback).toHaveBeenCalled()
  })
})
