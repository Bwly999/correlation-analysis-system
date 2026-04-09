import { describe, it, expect, beforeEach, vi } from 'vitest'
import { config, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PropertyField from '../config/PropertyField.vue'
import type { NodeProperty } from '@/nodes/types'

vi.mock('../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

const baseTreeOptions = [
  { key: 'group-1', label: '分组', children: [{ key: 'node-a', label: '节点 A' }] },
  { key: 'node-b', label: '节点 B' },
]

const createTreeProp = (overrides: Partial<NodeProperty> = {}): NodeProperty => ({
  name: 'treeField',
  displayName: '树形选择',
  type: 'tree',
  options: baseTreeOptions,
  ...overrides,
})

describe('PropertyField', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    config.global.directives = {
      ...(config.global.directives || {}),
      tooltip: () => undefined,
    }
  })

  it('在默认多选模式下透传统一的树值结构', async () => {
    const wrapper = mount(PropertyField, {
      props: {
        prop: createTreeProp(),
        modelValue: {},
        upstreamFactors: [],
      },
      global: {
        stubs: {
          PropertyFieldTreeInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: `
              <button
                type="button"
                data-testid="tree-select"
                @click="$emit('update:modelValue', {
                  selectedKeys: ['node-a', 'node-b'],
                  values: [undefined, undefined],
                })"
              >
                触发选择
              </button>
            `,
          },
        },
      },
    })

    await wrapper.get('[data-testid="tree-select"]').trigger('click')

    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    expect(updates?.[updates.length - 1]?.[0]).toEqual({
      selectedKeys: ['node-a', 'node-b'],
      values: [undefined, undefined],
    })
  })

  it('singleSelect 开启时仍透传统一的树值结构', async () => {
    const wrapper = mount(PropertyField, {
      props: {
        prop: createTreeProp({ singleSelect: true }),
        modelValue: {},
        upstreamFactors: [],
      },
      global: {
        stubs: {
          PropertyFieldTreeInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: `
              <button
                type="button"
                data-testid="tree-select-single"
                @click="$emit('update:modelValue', {
                  selectedKeys: ['node-b'],
                  values: [undefined],
                })"
              >
                触发单选
              </button>
            `,
          },
        },
      },
    })

    await wrapper.get('[data-testid="tree-select-single"]').trigger('click')

    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    expect(updates?.[updates.length - 1]?.[0]).toEqual({
      selectedKeys: ['node-b'],
      values: [undefined],
    })
  })
})
