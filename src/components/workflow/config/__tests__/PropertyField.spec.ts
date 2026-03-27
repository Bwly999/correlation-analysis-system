import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PropertyField from '../PropertyField.vue'

vi.mock('../../MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['language', 'declarations'],
    template: '<div class="monaco-mock">{{ language }}|{{ declarations }}</div>',
  },
}))

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

  it('为启动方式提供独立的强调样式容器', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fetchMode',
          displayName: '启动方式',
          type: 'select-button',
          default: 'time',
          options: [
            { name: '按时间查询', value: 'time' },
            { name: '按方案查询', value: 'scheme' },
          ],
        },
        modelValue: 'time',
        upstreamFactors: [],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          SelectButton: {
            props: ['class'],
            template: '<div class="select-button-stub" :class="$attrs.class"></div>',
          },
        },
      },
    })

    expect(wrapper.find('.select-button-hero').exists()).toBe(true)
    expect(wrapper.find('.select-button-hero__eyebrow').text()).toContain('查询策略')
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
            props: ['filterInputProps', 'pt'],
            template:
              '<input class="multi-options-filter-input" v-bind="{ ...(filterInputProps || {}), ...(pt?.pcFilter?.root || {}) }" />',
          },
        },
      },
    })

    await wrapper.get('.multi-options-filter-input').setValue('manual_field')
    await wrapper.get('.multi-options-filter-input').trigger('keydown', { key: 'Enter' })

    const emitted = wrapper.emitted('update:modelValue') || []
    expect(emitted[emitted.length - 1]).toEqual([['manual_field']])
  })

  it('为开启 forceInput 的 multi-options 在空选项时提供强制输入提示并允许回车写入', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          editable: true,
          forceInput: true,
          options: [],
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
            props: ['filterInputProps', 'emptyFilterMessage', 'emptyMessage', 'pt'],
            template:
              '<div><input class="multi-options-filter-input" v-bind="{ ...(filterInputProps || {}), ...(pt?.pcFilter?.root || {}) }" /><div class="multi-options-empty-message">{{ emptyFilterMessage || emptyMessage }}</div></div>',
          },
        },
      },
    })

    expect(wrapper.find('.multi-options-empty-message').text()).toContain(
      '暂无可选项，可直接输入后按回车添加',
    )

    await wrapper.get('.multi-options-filter-input').setValue('manual_field')
    await wrapper.get('.multi-options-filter-input').trigger('keydown', { key: 'Enter' })

    const emitted = wrapper.emitted('update:modelValue') || []
    expect(emitted[emitted.length - 1]).toEqual([['manual_field']])
  })

  it('为 forceInput 的 multi-options 补充手工输入值的展示标签', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          editable: true,
          forceInput: true,
          options: [],
        },
        modelValue: ['manual_field'],
        upstreamFactors: [],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          MultiSelect: {
            props: ['options'],
            template:
              '<div class="multi-options-options">{{ options.map((item) => `${item.name}:${item.value}`).join("|") }}</div>',
          },
        },
      },
    })

    expect(wrapper.find('.multi-options-options').text()).toContain('manual_field:manual_field')
  })
})
