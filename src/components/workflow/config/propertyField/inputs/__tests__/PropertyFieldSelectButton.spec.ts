import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PropertyFieldSelectButton from '../PropertyFieldSelectButton.vue'

describe('PropertyFieldSelectButton', () => {
  const baseProps = {
    modelValue: 'time',
    prop: {
      name: 'fetchMode',
      displayName: '启动方式',
      type: 'select-button',
      default: 'time',
    },
    options: [
      { name: '按时间查询', value: 'time' },
      { name: '按方案查询', value: 'scheme' },
    ],
    isHero: true,
  } as const

  it('为启动方式透传不可清空的单选约束', () => {
    const wrapper = mount(PropertyFieldSelectButton, {
      props: baseProps,
      global: {
        stubs: {
          SelectButton: {
            props: ['modelValue', 'options', 'allowEmpty', 'class'],
            template: `
              <div class="select-button-stub" :class="$attrs.class" :data-allow-empty="String(allowEmpty)"></div>
            `,
          },
        },
      },
    })

    expect(wrapper.get('.select-button-stub').attributes('data-allow-empty')).toBe('false')
  })

  it('在再次点击当前选项时保持选中值而不是清空', async () => {
    const wrapper = mount(PropertyFieldSelectButton, {
      props: baseProps,
      global: {
        stubs: {
          SelectButton: {
            props: ['modelValue', 'options', 'allowEmpty'],
            emits: ['update:modelValue'],
            template: `
              <div>
                <button
                  v-for="option in options"
                  :key="option.value"
                  type="button"
                  class="stub-click"
                  @click="$emit('update:modelValue', option.value === modelValue && allowEmpty !== false ? null : option.value)"
                >
                  {{ option.name }}
                </button>
              </div>
            `,
          },
        },
      },
    })

    await wrapper.findAll('.stub-click')[0]?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['time']])
  })
})
