import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PropertyFieldTreeInput from '../PropertyFieldTreeInput.vue'
import type { NodeProperty } from '@/nodes/types'

const treeOptions = [
  {
    key: 'group-1',
    label: '工序一',
    children: [
      { key: 'leaf-1', label: '温度', data: { value: 'temperature' } },
      { key: 'leaf-2', label: '压力', data: { value: 'pressure' } },
    ],
  },
  {
    key: 'group-2',
    label: '工序二',
    children: [{ key: 'leaf-3', label: '速度', data: { value: 'speed' } }],
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

const createInputTextStub = {
  props: ['modelValue', 'placeholder', 'class'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :placeholder="placeholder" :class="$attrs.class || $props.class" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

describe('PropertyFieldTreeInput filtered selection', () => {
  it('筛选后勾选仅合并当前可见叶子节点，并保留隐藏已选项', async () => {
    vi.useFakeTimers()

    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {
          selectedKeys: ['leaf-3'],
          values: ['speed'],
        },
        prop: createTreeProp(),
        options: treeOptions,
        isOptionsLoading: false,
        optionsError: '',
      },
      global: {
        stubs: {
          InputText: createInputTextStub,
          ElTreeV2: {
            props: ['data', 'props'],
            emits: ['check', 'node-expand', 'node-collapse'],
            template: `
              <div>
                <div data-testid="tree-data">{{ JSON.stringify(data) }}</div>
                <button
                  type="button"
                  data-testid="emit-filtered-check"
                  @click="$emit('check', null, { checkedKeys: ['group-1', 'leaf-1'], halfCheckedKeys: [] })"
                >
                  触发筛选勾选
                </button>
              </div>
            `,
          },
        },
      },
    })

    await wrapper.get('input').setValue('温')
    vi.advanceTimersByTime(150)
    await nextTick()

    await wrapper.get('[data-testid="emit-filtered-check"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      selectedKeys: ['leaf-1', 'leaf-3'],
      values: ['temperature', 'speed'],
    })

    vi.useRealTimers()
  })
})
