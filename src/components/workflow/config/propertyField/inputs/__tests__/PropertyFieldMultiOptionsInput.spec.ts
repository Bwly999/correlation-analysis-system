import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertyFieldMultiOptionsInput from '../PropertyFieldMultiOptionsInput.vue'

const multiOptions = [
  { name: '温度', value: 'temperature' },
  { name: '压力', value: 'pressure' },
  { name: '批次', value: 'batch' },
]

describe('PropertyFieldMultiOptionsInput', () => {
  it('筛选后全选与反选仅增减当前命中项，不覆盖未命中的既有选择', async () => {
    const wrapper = mount(PropertyFieldMultiOptionsInput, {
      props: {
        modelValue: ['batch'],
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          placeholder: '请选择字段',
        },
        options: multiOptions,
        sourceOptionCount: multiOptions.length,
      },
      global: {
        stubs: {
          MultiSelect: {
            props: ['selectAll'],
            emits: ['filter', 'selectall-change'],
            template: `
              <div>
                <button
                  type="button"
                  data-testid="filter-temperature"
                  @click="$emit('filter', { originalEvent: { type: 'input' }, value: '温' })"
                >
                  筛选温度
                </button>
                <button
                  type="button"
                  data-testid="toggle-select-all"
                  @click="$emit('selectall-change', { originalEvent: { type: 'click' }, checked: !selectAll })"
                >
                  切换全选
                </button>
                <div data-testid="select-all-state">{{ selectAll }}</div>
              </div>
            `,
          },
        },
      },
    })

    await wrapper.get('[data-testid="filter-temperature"]').trigger('click')
    await wrapper.get('[data-testid="toggle-select-all"]').trigger('click')

    const emitted = wrapper.emitted('update:modelValue') || []
    expect(emitted[0]?.[0]).toEqual(['batch', 'temperature'])

    await wrapper.setProps({
      modelValue: ['batch', 'temperature'],
    })

    await wrapper.get('[data-testid="toggle-select-all"]').trigger('click')

    const updatedEmitted = wrapper.emitted('update:modelValue') || []
    expect(updatedEmitted[1]?.[0]).toEqual(['batch'])
  })
})
