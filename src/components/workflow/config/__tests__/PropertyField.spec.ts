import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PropertyField from '../PropertyField.vue'

vi.mock('../../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

describe('PropertyField', () => {
  it('should filter multi-options by regex when enabled', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          filterable: true,
          allowRegexSearch: true,
          options: [
            { name: 'temp_avg', value: 'temp_avg' },
            { name: 'temp_max', value: 'temp_max' },
            { name: 'pressure', value: 'pressure' },
          ],
        },
        modelValue: [],
        upstreamFactors: [],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          InputText: {
            props: ['modelValue', 'placeholder'],
            emits: ['update:modelValue'],
            template:
              '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
          MultiSelect: {
            props: ['options', 'modelValue'],
            emits: ['update:modelValue'],
            template:
              '<div><slot name="header" /><div class="multi-select-stub">{{ options.map((item) => item.name).join(",") }}</div></div>',
          },
        },
      },
    })

    await wrapper.get('input[placeholder="搜索选项"]').setValue('^temp_')
    await wrapper.get('[data-testid="multi-options-regex-toggle"]').trigger('click')

    expect(wrapper.find('.multi-select-stub').text()).toBe('temp_avg,temp_max')
    expect(wrapper.text()).toContain('正则')
  })
})
