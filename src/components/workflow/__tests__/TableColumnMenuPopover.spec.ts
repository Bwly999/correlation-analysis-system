import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TableColumnMenuPopover from '../viewers/TableColumnMenuPopover.vue'

describe('TableColumnMenuPopover', () => {
  it('菜单浮层层级高于弹窗遮罩', () => {
    const wrapper = mount(TableColumnMenuPopover, {
      attachTo: document.body,
      props: {
        field: 'name',
        left: 120,
        top: 48,
        pinned: undefined,
        columns: [
          { name: '名称', value: 'name', visible: true },
          { name: '城市', value: 'city', visible: true },
        ],
      },
    })

    expect(window.getComputedStyle(wrapper.element).zIndex).toBe('1400')
  })
})
