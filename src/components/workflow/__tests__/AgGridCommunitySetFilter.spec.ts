import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AgGridCommunitySetFilter from '../common/AgGridCommunitySetFilter.vue'

describe('AgGridCommunitySetFilter', () => {
  it('内联展开并允许选择值', async () => {
    const filterChangedCallback = vi.fn()
    const wrapper = mount(AgGridCommunitySetFilter, {
      props: {
        params: {
          api: {
            forEachNode: (cb: (node: any) => void) => {
              cb({ data: { value: 1 } })
              cb({ data: { value: 2 } })
            },
          },
          getValue: (node: any) => node.data.value,
          filterChangedCallback,
        } as any,
      },
    })

    await wrapper.get('button.ag-community-set-filter__toggle').trigger('click')
    await wrapper.get('input[type="checkbox"]').setValue(true)

    expect(wrapper.text()).toContain('已选 1 项')
    expect(filterChangedCallback).toHaveBeenCalled()
  })
})
