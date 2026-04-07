import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertyFieldTreeInput from '../PropertyFieldTreeInput.vue'
import type { NodeProperty } from '@/nodes/types'

const treeOptions = [
  {
    key: 'group-1',
    label: '一级分组',
    children: [
      {
        key: 'group-1-1',
        label: '二级分组',
        children: [{ key: 'leaf-1', label: '目标节点' }],
      },
    ],
  },
  {
    key: 'group-2',
    label: '其他分组',
    children: [{ key: 'leaf-2', label: '普通节点' }],
  },
]

const createTreeProp = (overrides: Partial<NodeProperty> = {}): NodeProperty => ({
  name: 'treeField',
  displayName: '树形选择',
  type: 'tree',
  filterable: true,
  options: treeOptions,
  ...overrides,
})

const mountTreeInput = () =>
  mount(PropertyFieldTreeInput, {
    props: {
      modelValue: {},
      prop: createTreeProp(),
      options: treeOptions,
      isOptionsLoading: false,
      optionsError: '',
    },
    global: {
      stubs: {
        InputText: {
          props: ['modelValue', 'placeholder', 'class'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" :placeholder="placeholder" :class="$attrs.class || $props.class" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        Tree: {
          props: ['value', 'selectionKeys', 'expandedKeys'],
          template: `
            <div data-testid="tree-stub">
              <div data-testid="tree-value">{{ JSON.stringify(value) }}</div>
              <div data-testid="tree-expanded-keys">{{ JSON.stringify(expandedKeys || {}) }}</div>
            </div>
          `,
        },
      },
    },
  })

describe('PropertyFieldTreeInput', () => {
  it('点击完全展开和完全收起按钮时更新展开状态', async () => {
    const wrapper = mountTreeInput()

    await wrapper.get('[data-testid="tree-expand-all"]').trigger('click')
    expect(wrapper.get('[data-testid="tree-expanded-keys"]').text()).toBe(
      JSON.stringify({
        'group-1': true,
        'group-1-1': true,
        'group-2': true,
      }),
    )

    await wrapper.get('[data-testid="tree-collapse-all"]').trigger('click')
    expect(wrapper.get('[data-testid="tree-expanded-keys"]').text()).toBe('{}')
  })

  it('搜索后自动展开过滤结果中的所有层级', async () => {
    const wrapper = mountTreeInput()

    await wrapper.get('input').setValue('目标')

    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('目标节点')
    expect(wrapper.get('[data-testid="tree-expanded-keys"]').text()).toBe(
      JSON.stringify({
        'group-1': true,
        'group-1-1': true,
      }),
    )
  })
})
