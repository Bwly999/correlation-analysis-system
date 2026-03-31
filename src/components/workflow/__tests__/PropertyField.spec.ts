import { describe, it, expect, beforeEach, vi } from 'vitest'
import { config, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PropertyField from '../config/PropertyField.vue'
import type { NodeProperty } from '@/nodes/types'

vi.mock('../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

const treeStub = {
  name: 'Tree',
  props: ['selectionKeys', 'value'],
  emits: ['update:selectionKeys'],
  template: `
    <div data-testid="tree-stub">
      <button
        type="button"
        data-testid="tree-select"
        @click="$emit('update:selectionKeys', value)"
      >
        触发选择
      </button>
    </div>
  `,
}

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

  it('keeps multiple tree selections in default checkbox mode', async () => {
    const wrapper = mount(PropertyField, {
      props: {
        prop: createTreeProp(),
        modelValue: {},
        upstreamFactors: [],
      },
      global: {
        stubs: {
          Tree: treeStub,
        },
      },
    })

    await wrapper.find('[data-testid="tree-select"]').trigger('click')

    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    expect(updates?.[updates.length - 1]?.[0]).toEqual(baseTreeOptions)
  })

  it('keeps only one selected tree node when singleSelect is enabled', async () => {
    const wrapper = mount(PropertyField, {
      props: {
        prop: createTreeProp({ singleSelect: true }),
        modelValue: {},
        upstreamFactors: [],
      },
      global: {
        stubs: {
          Tree: {
            ...treeStub,
            template: `
              <div data-testid="tree-stub">
                <button
                  type="button"
                  data-testid="tree-select-single"
                  @click="$emit('update:selectionKeys', {
                    'node-a': { checked: true, partialChecked: false },
                    'node-b': { checked: true, partialChecked: false },
                  })"
                >
                  触发单选
                </button>
              </div>
            `,
          },
        },
      },
    })

    await wrapper.find('[data-testid="tree-select-single"]').trigger('click')

    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    expect(updates?.[updates.length - 1]?.[0]).toEqual({
      'node-b': { checked: true, partialChecked: false },
    })
  })
})
