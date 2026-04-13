import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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

  it('为 resolveOptions 失败的 options 保留加载错误提示', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'field',
          displayName: '字段',
          type: 'options',
          default: '',
          resolveOptions: async () => {
            throw new Error('远程选项加载失败')
          },
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
            props: ['emptyFilterMessage'],
            template: '<div class="options-empty-message">{{ emptyFilterMessage }}</div>',
          },
        },
      },
    })

    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.options-empty-message').text()).toContain('远程选项加载失败')
  })

  it('为 multi-options 默认关闭正则过滤，并允许切换到正则过滤', async () => {
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

  it('为 allowRegexSearch=false 的 multi-options 保持普通过滤且不渲染切换按钮', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          allowRegexSearch: false,
          options: [
            { name: 'temp_avg', value: 'temp_avg' },
            { name: 'temp_max', value: 'temp_max' },
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
            props: ['filter', 'filterMatchMode'],
            template:
              '<div v-bind="$attrs"><div class="multi-select-props">{{ filter }}|{{ filterMatchMode }}</div><slot name="filtericon" /></div>',
          },
        },
      },
    })

    expect(wrapper.find('.multi-select-props').text()).toBe('true|contains')
    expect(wrapper.find('[data-testid="multi-options-regex-toggle"]').exists()).toBe(false)
  })

  it('为 multi-options 保持与 options 一致的基础字号', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'fields',
          displayName: '字段列表',
          type: 'multi-options',
          default: [],
          options: [
            { name: '温度', value: 'temperature' },
            { name: '压力', value: 'pressure' },
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
            template: '<div class="multi-select-root" v-bind="$attrs"></div>',
          },
        },
      },
    })

    expect(wrapper.get('.multi-select-root').classes()).toContain('ndv-multi-options')
    expect(wrapper.get('.multi-select-root').classes()).not.toContain('text-xs')
  })

  it('为开启自动全选的 multi-options 在依赖刷新后自动选中全部远程选项', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'selectedProcesses',
          displayName: '工序',
          type: 'multi-options',
          default: [],
          autoSelectAllOnOptionsChange: true,
          dependencies: ['productName'],
          resolveOptions: async ({ config }) => {
            if (!config.productName) return []
            return [
              { name: '涂布', value: '涂布' },
              { name: '装配', value: '装配' },
            ]
          },
        },
        modelValue: [],
        upstreamFactors: [],
        configContext: {
          productName: '',
        },
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          MultiSelect: {
            props: ['options'],
            template: '<div class="multi-options-options">{{ options.length }}</div>',
          },
        },
      },
    })

    await flushPromises()

    await wrapper.setProps({
      configContext: {
        productName: '电池A',
      },
    })

    await flushPromises()

    const emitted = wrapper.emitted('update:modelValue') || []
    expect(emitted[emitted.length - 1]).toEqual([['涂布', '装配']])
  })

  it('为开启自动全选的 multi-options 在已有选择时不覆盖当前值', async () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'selectedProcesses',
          displayName: '工序',
          type: 'multi-options',
          default: [],
          autoSelectAllOnOptionsChange: true,
          dependencies: ['productName'],
          resolveOptions: async ({ config }) => {
            if (!config.productName) return []
            return [
              { name: '涂布', value: '涂布' },
              { name: '装配', value: '装配' },
            ]
          },
        },
        modelValue: ['自定义工序'],
        upstreamFactors: [],
        configContext: {
          productName: '',
        },
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          MultiSelect: {
            props: ['options'],
            template: '<div class="multi-options-options">{{ options.length }}</div>',
          },
        },
      },
    })

    await flushPromises()

    await wrapper.setProps({
      configContext: {
        productName: '电池A',
      },
    })

    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
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

  it('为 datetime-range 将持久化后的字符串数组规范化为 DatePicker 可识别的 Date 数组', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'timeRange',
          displayName: '查询日期',
          type: 'datetime-range',
          default: null,
          dateOnly: true,
        },
        modelValue: ['2026-04-01T00:00:00.000Z', '2026-04-07T00:00:00.000Z'],
        upstreamFactors: [],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          DatePicker: {
            props: ['modelValue'],
            template:
              '<div class="date-picker-model">{{ Array.isArray(modelValue) ? modelValue.map((item) => item instanceof Date ? item.toISOString() : typeof item).join("|") : typeof modelValue }}</div>',
          },
        },
      },
    })

    expect(wrapper.find('.date-picker-model').text()).toBe(
      '2026-04-01T00:00:00.000Z|2026-04-07T00:00:00.000Z',
    )
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

  it('为已有手工值的 forceInput multi-options 继续保留回车输入提示', () => {
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
            props: ['emptyFilterMessage', 'emptyMessage'],
            template:
              '<div class="multi-options-empty-message">{{ emptyFilterMessage || emptyMessage }}</div>',
          },
        },
      },
    })

    expect(wrapper.find('.multi-options-empty-message').text()).toContain(
      '暂无可选项，可直接输入后按回车添加',
    )
  })

  it('为分析字段禁用非数值上游字段并展示紧凑提示', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'xFields',
          displayName: 'X 字段',
          type: 'multi-options',
          default: [],
          useUpstreamFactors: true,
        },
        modelValue: [],
        upstreamFactors: [
          { name: '温度', value: 'temperature', dataType: 'number' },
          { name: '批次', value: 'batchCode', dataType: 'string' },
        ],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          MultiSelect: {
            props: ['options', 'optionDisabled'],
            template:
              '<div><div class="multi-options-option-disabled">{{ optionDisabled }}</div><div class="multi-options-options">{{ options.map((item) => `${item.name}:${item.value}:${item.disabled ? "disabled" : "enabled"}:${item.hint || ""}`).join("|") }}</div></div>',
          },
        },
      },
    })

    expect(wrapper.find('.multi-options-option-disabled').text()).toBe('disabled')
    expect(wrapper.find('.multi-options-options').text()).toContain('温度:temperature:enabled')
    expect(wrapper.find('.multi-options-options').text()).toContain('批次:batchCode:disabled:仅支持数值字段参与当前分析')
    expect(wrapper.text()).toContain('字段受限')
  })

  it('继续通过红色星标表达必填，而不额外渲染默认值或必填提示标签', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'topN',
          displayName: '重点展示因子数',
          type: 'number',
          default: 8,
          required: true,
        },
        modelValue: 8,
        upstreamFactors: [],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          InputNumber: {
            props: ['modelValue'],
            template: '<div class="input-number-stub">{{ modelValue }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).not.toContain('默认值')
    expect(wrapper.text()).not.toContain('必填')

    const requiredWrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'targetField',
          displayName: '目标字段',
          type: 'string',
          default: '',
          required: true,
        },
        modelValue: '',
        upstreamFactors: [],
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          InputText: {
            props: ['modelValue'],
            template: '<div class="input-text-stub">{{ modelValue }}</div>',
          },
        },
      },
    })

    expect(requiredWrapper.text()).not.toContain('必填')
    expect(requiredWrapper.text()).toContain('*')
  })

  it('为分析字段在缺少上游可选字段时展示紧凑空状态提示', () => {
    setActivePinia(createPinia())

    const wrapper = mount(PropertyField, {
      props: {
        prop: {
          name: 'xFields',
          displayName: 'X 字段',
          type: 'multi-options',
          default: [],
          useUpstreamFactors: true,
          required: true,
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
            props: ['options'],
            template: '<div class="multi-options-options">{{ options.length }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('缺少上游')
  })
})
