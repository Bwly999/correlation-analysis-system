import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createJsonResult } from '@/nodes/result'
import DataDisplayPanel from '../DataDisplayPanel.vue'

describe('DataDisplayPanel', () => {
  it('renders a structured table summary for wide tables instead of a raw json block', () => {
    const rows = Array.from({ length: 5 }, (_, rowIndex) =>
      Object.fromEntries(
        Array.from({ length: 16 }, (_, colIndex) => [
          `field_${colIndex}`,
          colIndex === 0 ? `row-${rowIndex}` : `cell-${rowIndex}-${colIndex}-${'x'.repeat(32)}`,
        ]),
      ),
    )

    const wrapper = mount(DataDisplayPanel, {
      props: {
        title: '输入数据',
        data: createJsonResult(rows),
        type: 'input',
      },
      global: {
        stubs: {
          ToggleSwitch: true,
          MonacoEditor: true,
        },
      },
    })

    expect(wrapper.get('[data-test="data-preview-summary"]').text()).toContain('表格数据')
    expect(wrapper.get('[data-test="data-preview-omitted-columns"]').text()).toContain('已省略')
    expect(wrapper.text()).not.toContain('field_15')
    expect(wrapper.text()).not.toContain('x'.repeat(24))
    expect(wrapper.find('pre').exists()).toBe(false)
  })

  it('opens text preview lazily and still keeps the preview text within budget', async () => {
    const wrapper = mount(DataDisplayPanel, {
      props: {
        title: '输出数据',
        data: createJsonResult({
          huge: 'y'.repeat(5000),
          nested: {
            content: 'z'.repeat(5000),
          },
        }),
        type: 'output',
      },
      global: {
        stubs: {
          ToggleSwitch: true,
          MonacoEditor: true,
        },
      },
    })

    expect(wrapper.find('[data-test="data-preview-text"]').exists()).toBe(false)

    await wrapper.get('[data-test="data-preview-toggle-text"]').trigger('click')

    const text = wrapper.get('[data-test="data-preview-text"]').text()
    expect(text.length).toBeLessThanOrEqual(2600)
    expect(text).toContain('已截断')
    expect(text).not.toContain('y'.repeat(120))
    expect(text).not.toContain('z'.repeat(120))
  })
})
