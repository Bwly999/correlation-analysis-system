import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpCenterModal from '../HelpCenterModal.vue'

describe('HelpCenterModal', () => {
  it('shows quick start content by default and can open category node summaries', async () => {
    const wrapper = mount(HelpCenterModal, {
      props: { visible: true },
      global: {
        stubs: {
          Dialog: { template: '<div><slot name="header" /><slot /></div>' },
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.text()).toContain('3 分钟上手')
    expect(wrapper.text()).toContain('导入数据')

    const categoryButton = wrapper.findAll('button').find((node) => node.text().includes('数据接入'))
    expect(categoryButton).toBeTruthy()

    await categoryButton!.trigger('click')

    expect(wrapper.text()).toContain('本地文件导入')
    expect(wrapper.text()).toContain('从本地 CSV、Excel 或 JSON 文件导入一份原始表格数据。')
  })
})
