import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
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

const createInputTextStub = {
  props: ['modelValue', 'placeholder', 'class'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :placeholder="placeholder" :class="$attrs.class || $props.class" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

const createTreeV2Stub = (
  template = '<div data-testid="tree-value">{{ JSON.stringify({ data, treeProps: props }) }}</div>',
) => ({
  props: ['data', 'props'],
  emits: ['check', 'node-expand', 'node-collapse'],
  template: `<div data-testid="tree-v2-stub">${template}</div>`,
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
        InputText: createInputTextStub,
        ElTreeV2: createTreeV2Stub(),
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
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(),
        },
      },
    })

    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"selectable":false')
    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"key":"leaf-1","label":"目标节点"')
  })

  it('渲染 TreeV2 并保留展开按钮文案', async () => {
    const wrapper = mountTreeInput()

    expect(wrapper.find('[data-testid="tree-v2-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"value":"key"')
    expect(wrapper.get('[data-testid="tree-expand-all"]').attributes('title')).toBe('安全展开')
    expect(wrapper.get('[data-testid="tree-expand-all"]').attributes('aria-label')).toBe('安全展开')

    await wrapper.get('[data-testid="tree-expand-all"]').trigger('click')
    await wrapper.get('[data-testid="tree-collapse-all"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('组件默认关闭搜索保护，不显示分组摘要提示', async () => {
    vi.useFakeTimers()
    const largeTreeOptions = [
      {
        key: 'group-1',
        label: '一级分组',
        children: Array.from({ length: 40 }, (_, index) => ({
          key: `sub-group-${index + 1}`,
          label: `二级分组${index + 1}`,
          children: Array.from({ length: 20 }, (_, leafIndex) => ({
            key: `leaf-${index + 1}-${leafIndex + 1}`,
            label: `温度指标-${index + 1}-${leafIndex + 1}`,
          })),
        })),
      },
    ]

    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp(),
        options: largeTreeOptions,
        isOptionsLoading: false,
        optionsError: '',
      },
      global: {
        stubs: {
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(),
        },
      },
    })

    await wrapper.get('input').setValue('温度指标')
    vi.advanceTimersByTime(150)
    await nextTick()

    expect(wrapper.text()).not.toContain('结果过多，已按分组摘要显示')
    expect(wrapper.get('[data-testid="tree-value"]').text()).not.toContain('__search-summary__')

    vi.useRealTimers()
  })

  it('关闭搜索保护时不过滤为摘要节点', async () => {
    vi.useFakeTimers()
    const largeTreeOptions = [
      {
        key: 'group-1',
        label: '一级分组',
        children: Array.from({ length: 12 }, (_, index) => ({
          key: `sub-group-${index + 1}`,
          label: `二级分组${index + 1}`,
          children: Array.from({ length: 10 }, (_, leafIndex) => ({
            key: `leaf-${index + 1}-${leafIndex + 1}`,
            label: `温度指标-${index + 1}-${leafIndex + 1}`,
          })),
        })),
      },
    ]

    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp(),
        options: largeTreeOptions,
        isOptionsLoading: false,
        optionsError: '',
      },
      global: {
        stubs: {
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(),
        },
      },
    })

    await wrapper.get('input').setValue('温度指标')
    vi.advanceTimersByTime(150)
    await nextTick()

    expect(wrapper.get('[data-testid="tree-value"]').text()).not.toContain('__search-summary__')

    vi.useRealTimers()
  })

  it('singleSelect 且节点提供对象值时，仍输出统一的 selectedKeys 和 values 结构', async () => {
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
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(`
            <button
              type="button"
              data-testid="tree-object-single"
              @click="$emit('check', null, { checkedKeys: ['sub-scene:pack-a'], halfCheckedKeys: [] })"
            >
              触发对象单选
            </button>
          `),
        },
      },
    })

    await wrapper.get('[data-testid="tree-object-single"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      selectedKeys: ['sub-scene:pack-a'],
      values: [
        {
          sceneId: 'scene-pack',
          sceneLable: 'PACK',
          subSceneId: 'sub-pack-a',
          subSceneLable: 'PACK-A',
        },
      ],
    })
  })

  it('singleSelect 时忽略父节点勾选，只保留一个叶子节点并输出统一结构', async () => {
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
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(`
            <button
              type="button"
              data-testid="tree-parent-single"
              @click="$emit('check', null, {
                checkedKeys: ['group-1', 'group-1-1', 'leaf-1'],
                halfCheckedKeys: [],
              })"
            >
              触发父节点单选
            </button>
          `),
        },
      },
    })

    await wrapper.get('[data-testid="tree-parent-single"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      selectedKeys: ['leaf-1'],
      values: [undefined],
    })
  })

  it('多选树节点提供对象值时，对外输出统一的 selectedKeys 和 values 结构', async () => {
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
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(`
            <button
              type="button"
              data-testid="tree-object-multi"
              @click="$emit('check', null, {
                checkedKeys: ['factor:F_TEMP', 'factor:F_PRESS'],
                halfCheckedKeys: [],
              })"
            >
              触发对象多选
            </button>
          `),
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

  it('多选树节点未提供对象值时，也输出统一的 selectedKeys 和 values 结构', async () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp(),
        options: treeOptions,
        isOptionsLoading: false,
        optionsError: '',
      },
      global: {
        stubs: {
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(`
            <button
              type="button"
              data-testid="tree-plain-multi"
              @click="$emit('check', null, {
                checkedKeys: ['leaf-1', 'leaf-2'],
                halfCheckedKeys: [],
              })"
            >
              触发普通多选
            </button>
          `),
        },
      },
    })

    await wrapper.get('[data-testid="tree-plain-multi"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      selectedKeys: ['leaf-1', 'leaf-2'],
      values: [undefined, undefined],
    })
  })

  it('多选树节点勾选状态包含父节点时，对外仍只保留叶子节点', async () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp(),
        options: treeOptions,
        isOptionsLoading: false,
        optionsError: '',
      },
      global: {
        stubs: {
          InputText: createInputTextStub,
          ElTreeV2: createTreeV2Stub(`
            <button
              type="button"
              data-testid="tree-parent-multi"
              @click="$emit('check', null, {
                checkedKeys: ['group-1', 'group-1-1', 'leaf-1', 'group-2', 'leaf-2'],
                halfCheckedKeys: [],
              })"
            >
              触发父节点多选
            </button>
          `),
        },
      },
    })

    await wrapper.get('[data-testid="tree-parent-multi"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
      selectedKeys: ['leaf-1', 'leaf-2'],
      values: [undefined, undefined],
    })
  })
})
