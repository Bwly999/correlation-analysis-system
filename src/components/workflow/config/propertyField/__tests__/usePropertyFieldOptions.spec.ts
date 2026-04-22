import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { usePropertyFieldOptions } from '../usePropertyFieldOptions'

describe('usePropertyFieldOptions', () => {
  it('仅为需要禁用提示的上游字段创建新对象，其余项复用原引用', () => {
    const numericOption = { name: '温度', value: 'temperature', dataType: 'number' }
    const textOption = { name: '批次', value: 'batchCode', dataType: 'string' }
    let latestOptions: any[] = []

    const wrapper = mount(defineComponent({
      props: {
        modelValue: { type: Array, default: () => [] },
      },
      setup(props) {
        const { normalizedOptionSource } = usePropertyFieldOptions({
          prop: {
            name: 'xFields',
            displayName: 'X 字段',
            type: 'multi-options',
            default: [],
            useUpstreamFactors: true,
          },
          modelValue: props.modelValue,
          upstreamFactors: [numericOption, textOption],
        })

        return () => {
          latestOptions = normalizedOptionSource.value
          return h('div')
        }
      },
    }))

    expect(latestOptions[0]).toBe(numericOption)
    expect(latestOptions[1]).not.toBe(textOption)
    expect(latestOptions[1]).toMatchObject({
      name: '批次',
      value: 'batchCode',
      disabled: true,
      hint: '仅支持数值字段参与当前分析',
    })

    wrapper.unmount()
  })

  it('multi-options 仅在存在缺失已选值时追加手工项', () => {
    const baseOption = { name: '温度', value: 'temperature' }
    let latestOptions: any[] = []

    const wrapper = mount(defineComponent({
      props: {
        modelValue: { type: Array, default: () => [] },
      },
      setup(props) {
        const { normalizedMultiOptionsSource } = usePropertyFieldOptions({
          prop: {
            name: 'fields',
            displayName: '字段列表',
            type: 'multi-options',
            default: [],
            forceInput: true,
            options: [baseOption],
          },
          modelValue: props.modelValue,
          upstreamFactors: [],
        })

        return () => {
          latestOptions = normalizedMultiOptionsSource.value
          return h('div')
        }
      },
    }), {
      props: {
        modelValue: ['temperature', 'manual_field'],
      },
    })

    expect(latestOptions).toHaveLength(2)
    expect(latestOptions[0]).toBe(baseOption)
    expect(latestOptions[1]).toEqual({
      name: 'manual_field',
      value: 'manual_field',
    })

    wrapper.unmount()
  })
})
