import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PropertyField from '../PropertyField.vue'

vi.mock('../../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

describe('PropertyField', () => {
  it('为 options 使用 Select 的 editable 和内置过滤', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'field',
          displayName: '字段',
          type: 'options',
          default: '',
          editable: true,
          allowRegexSearch: true,
          options: [
            { name: 'city', value: 'city' },
            { name: 'score', value: 'score' },
          ],
        },
        modelValue: '',
        upstreamFactors: [],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          Select: {
            props: ['editable', 'filter', 'filterMatchMode', 'filterInputProps'],
            template:
              '<div><input class="options-filter-input" v-bind="filterInputProps" /><div class="select-props">{{ editable }}|{{ filter }}|{{ filterMatchMode }}|{{ typeof filterInputProps.onKeydown }}</div><slot name="filtericon" /></div>',
          },
        },
      },
    })

    expect(wrapper.find('.select-props').text()).toBe('true|true|contains|undefined')
    expect(wrapper.get('[data-testid="options-regex-toggle"]').classes()).toContain('bg-white')

    await wrapper.get('[data-testid="options-regex-toggle"]').trigger('click')

    expect(wrapper.find('.select-props').text()).toBe('true|true|custom_regex|undefined')
    expect(wrapper.get('[data-testid="options-regex-toggle"]').classes()).toContain('!bg-blue-50')
  })

  it('为 multi-options 切换正则过滤模式', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          editable: true,
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
          MultiSelect: {
            props: ['filter', 'filterMatchMode', 'filterInputProps'],
            template:
              '<div v-bind="$attrs"><input class="multi-options-filter-input" v-bind="filterInputProps" /><div class="multi-select-props">{{ filter }}|{{ filterMatchMode }}</div><slot name="filtericon" /></div>',
          },
        },
      },
    })

    expect(wrapper.find('.multi-select-props').text()).toBe('true|contains')
    expect(wrapper.find('.ndv-multi-options').exists()).toBe(true)
    expect(wrapper.get('[data-testid="multi-options-regex-toggle"]').classes()).toContain('bg-white')

    await wrapper.get('[data-testid="multi-options-regex-toggle"]').trigger('click')

    expect(wrapper.find('.multi-select-props').text()).toBe('true|custom_regex')
    expect(wrapper.get('[data-testid="multi-options-regex-toggle"]').classes()).toContain('!bg-blue-50')
  })

  it('为 multi-options 允许在过滤框回车确认自定义字段', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          editable: true,
          filterable: true,
          options: [
            { name: 'city', value: 'city' },
            { name: 'score', value: 'score' },
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
          MultiSelect: {
            props: ['filterInputProps'],
            template: '<input class="multi-options-filter-input" v-bind="filterInputProps" />',
          },
        },
      },
    })

    await wrapper.get('.multi-options-filter-input').setValue('manual_field')
    await wrapper.get('.multi-options-filter-input').trigger('keydown', { key: 'Enter' })

    const emitted = wrapper.emitted('update:modelValue') || []
    expect(emitted[emitted.length - 1]).toEqual([['manual_field']])
  })
})
