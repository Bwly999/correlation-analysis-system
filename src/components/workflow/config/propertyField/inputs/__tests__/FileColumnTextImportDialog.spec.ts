import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FileColumnTextImportDialog from '../FileColumnTextImportDialog.vue'

describe('FileColumnTextImportDialog', () => {
  it('未启用预览时在右侧展示占位说明', () => {
    const wrapper = mount(FileColumnTextImportDialog, {
      props: {
        visible: true,
        valueLabel: 'SN',
        defaultDeduplicate: true,
      },
      global: {
        stubs: {
          Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
          Button: { template: '<button><slot />{{ label }}</button>', props: ['label'] },
          Select: true,
          ToggleSwitch: true,
          VirtualScroller: true,
        },
      },
    })

    expect(wrapper.find('[data-testid="sn-import-preview-placeholder"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('选择列后可点击预览')
    expect(wrapper.find('.sn-import-dialog__virtual').exists()).toBe(false)
  })

  it('上传文件并识别列后默认打开 SN 预览', async () => {
    const wrapper = mount(FileColumnTextImportDialog, {
      props: {
        visible: true,
        valueLabel: 'SN',
        defaultDeduplicate: true,
      },
      global: {
        stubs: {
          Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
          Button: { template: '<button><slot />{{ label }}</button>', props: ['label'] },
          Select: true,
          ToggleSwitch: true,
          VirtualScroller: {
            props: ['items'],
            template:
              '<div class="sn-import-dialog__virtual">{{ items.join("|") }}</div>',
          },
        },
      },
    })

    const file = new File(['SN,备注\nSN001,A\nSN002,B\n'], 'sn.csv', { type: 'text/csv' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })

    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('[data-testid="sn-import-preview-placeholder"]').exists()).toBe(false)
    expect(wrapper.find('.sn-import-dialog__virtual').exists()).toBe(true)
    expect(wrapper.text()).toContain('SN001|SN002')
  })
})
