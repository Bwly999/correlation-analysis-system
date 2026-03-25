import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfigFooter from '../ConfigFooter.vue'

describe('ConfigFooter', () => {
  it('renders 应用 as the save action label', () => {
    const wrapper = mount(ConfigFooter, {
      global: {
        stubs: {
          Button: {
            props: ['label'],
            template: '<button>{{ label }}</button>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('应用')
    expect(wrapper.text()).not.toContain('应用并保存')
  })
})
