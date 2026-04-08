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
  it('singleSelect 时将非叶子节点标记为不可选', () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp({ singleSelect: true }),
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
              </div>
            `,
          },
        },
      },
    })

    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"key":"group-1","label":"一级分组","children"')
    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"key":"group-1","label":"一级分组","children":[{"key":"group-1-1"')
    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"selectable":false')
    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"key":"leaf-1","label":"目标节点"')
  })

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

  it('singleSelect 且节点提供对象值时，对外输出精简对象包装结构', async () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp({ singleSelect: true }),
        options: [
          {
            key: 'scene:pack',
            label: 'PACK',
            children: [
              {
                key: 'sub-scene:pack-a',
                label: 'PACK-A',
                data: {
                  value: {
                    sceneId: 'scene-pack',
                    sceneLable: 'PACK',
                    subSceneId: 'sub-pack-a',
                    subSceneLable: 'PACK-A',
                  },
                },
              },
            ],
          },
        ],
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
            emits: ['update:selectionKeys'],
            template: `
              <div data-testid="tree-stub">
                <button
                  type="button"
                  data-testid="tree-object-single"
                  @click="$emit('update:selectionKeys', { 'sub-scene:pack-a': { checked: true, partialChecked: false } })"
                >
                  触发对象单选
                </button>
              </div>
            `,
          },
        },
      },
    })

    await wrapper.get('[data-testid="tree-object-single"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      selectedKey: 'sub-scene:pack-a',
      value: {
        sceneId: 'scene-pack',
        sceneLable: 'PACK',
        subSceneId: 'sub-pack-a',
        subSceneLable: 'PACK-A',
      },
    })
  })

  it('singleSelect 时忽略父节点勾选，只保留叶子节点', async () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp({ singleSelect: true }),
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
            emits: ['update:selectionKeys'],
            template: `
              <div data-testid="tree-stub">
                <button
                  type="button"
                  data-testid="tree-parent-single"
                  @click="$emit('update:selectionKeys', {
                    'group-1': { checked: true, partialChecked: false },
                    'group-1-1': { checked: true, partialChecked: false },
                    'leaf-1': { checked: true, partialChecked: false },
                  })"
                >
                  触发父节点单选
                </button>
              </div>
            `,
          },
        },
      },
    })

    await wrapper.get('[data-testid="tree-parent-single"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      'leaf-1': { checked: true, partialChecked: false },
    })
  })

  it('多选树节点提供对象值时，对外输出 values 数组', async () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp(),
        options: [
          {
            key: 'process:涂布',
            label: '涂布',
            children: [
              {
                key: 'factor:F_TEMP',
                label: '温度',
                data: {
                  value: {
                    factorKey: 'F_TEMP',
                    factorName: '温度',
                    materialType: '正极',
                    processName: '涂布',
                    r2Name: 'R2-TEMP',
                  },
                },
              },
              {
                key: 'factor:F_PRESS',
                label: '压力',
                data: {
                  value: {
                    factorKey: 'F_PRESS',
                    factorName: '压力',
                    materialType: '正极',
                    processName: '涂布',
                    r2Name: 'R2-PRESS',
                  },
                },
              },
            ],
          },
        ],
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
            emits: ['update:selectionKeys'],
            template: `
              <div data-testid="tree-stub">
                <button
                  type="button"
                  data-testid="tree-object-multi"
                  @click="$emit('update:selectionKeys', {
                    'factor:F_TEMP': { checked: true, partialChecked: false },
                    'factor:F_PRESS': { checked: true, partialChecked: false },
                  })"
                >
                  触发对象多选
                </button>
              </div>
            `,
          },
        },
      },
    })

    await wrapper.get('[data-testid="tree-object-multi"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      selectedKeys: ['factor:F_TEMP', 'factor:F_PRESS'],
      values: [
        {
          factorKey: 'F_TEMP',
          factorName: '温度',
          materialType: '正极',
          processName: '涂布',
          r2Name: 'R2-TEMP',
        },
        {
          factorKey: 'F_PRESS',
          factorName: '压力',
          materialType: '正极',
          processName: '涂布',
          r2Name: 'R2-PRESS',
        },
      ],
    })
  })
})
