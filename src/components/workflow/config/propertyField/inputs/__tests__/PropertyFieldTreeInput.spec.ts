import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
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

const createScrollableTreeV2Stub = () => defineComponent({
  name: 'ScrollableTreeV2Stub',
  props: ['data', 'props'],
  emits: ['check', 'node-expand', 'node-collapse'],
  setup(props) {
    const handleInternalWheel = (event: WheelEvent) => {
      const viewport = event.currentTarget as HTMLElement | null
      if (!viewport) return

      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      viewport.scrollTop = Math.min(Math.max(viewport.scrollTop + event.deltaY, 0), maxScrollTop)
    }

    return () =>
      h('div', { 'data-testid': 'tree-v2-stub' }, [
        h('div', {
          'data-testid': 'tree-scroll-window',
          class: 'el-vl__window',
          onWheel: handleInternalWheel,
        }, JSON.stringify({ data: props.data, treeProps: props.props })),
      ])
  },
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

const setElementScrollMetrics = (
  element: Element,
  metrics: {
    clientHeight: number
    scrollHeight: number
    scrollTop?: number
    clientWidth?: number
    scrollWidth?: number
    scrollLeft?: number
  },
) => {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    scrollTop: {
      configurable: true,
      writable: true,
      value: metrics.scrollTop ?? 0,
    },
    clientWidth: { configurable: true, value: metrics.clientWidth ?? 0 },
    scrollWidth: { configurable: true, value: metrics.scrollWidth ?? 0 },
    scrollLeft: {
      configurable: true,
      writable: true,
      value: metrics.scrollLeft ?? 0,
    },
  })
}

const mountTreeInputInScrollContainer = (treeStub = createScrollableTreeV2Stub()) => {
  const wrapper = mount(defineComponent({
    components: {
      PropertyFieldTreeInput,
    },
    setup() {
      return {
        options: treeOptions,
        prop: createTreeProp(),
      }
    },
    template: `
      <div data-testid="scroll-container">
        <PropertyFieldTreeInput
          :model-value="{}"
          :prop="prop"
          :options="options"
          :is-options-loading="false"
          :options-error="''"
        />
      </div>
    `,
  }), {
    attachTo: document.body,
    global: {
      stubs: {
        InputText: createInputTextStub,
        ElTreeV2: treeStub,
      },
    },
  })

  return {
    wrapper,
    scrollContainer: wrapper.get('[data-testid="scroll-container"]').element as HTMLElement,
  }
}

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

  it('点击图标后开启正则搜索，并按正则过滤树节点', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp(),
        options: [
          {
            key: 'group-1',
            label: '工序一',
            children: [
              { key: 'leaf-1', label: '温度-01' },
              { key: 'leaf-2', label: '压力-01' },
            ],
          },
        ],
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

    await wrapper.get('[data-testid="tree-regex-toggle"]').trigger('click')
    await wrapper.get('input').setValue('^温度-\\d+$')
    vi.advanceTimersByTime(150)
    await nextTick()

    expect(wrapper.get('[data-testid="tree-regex-toggle"]').attributes('title')).toBe('已开启正则搜索')
    expect(wrapper.get('[data-testid="tree-value"]').text()).toContain('"label":"温度-01"')
    expect(wrapper.get('[data-testid="tree-value"]').text()).not.toContain('"label":"压力-01"')

    vi.useRealTimers()
  })

  it('正则表达式无效时显示错误提示且树结果为空', async () => {
    vi.useFakeTimers()
    const wrapper = mountTreeInput()

    await wrapper.get('[data-testid="tree-regex-toggle"]').trigger('click')
    await wrapper.get('input').setValue('[')
    vi.advanceTimersByTime(150)
    await nextTick()

    expect(wrapper.text()).toContain('正则表达式无效，请检查输入格式')
    expect(wrapper.text()).toContain('暂无数据')

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

  it('存在已选叶子节点时，在组件下方显示 已选数/总叶子数', () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {
          selectedKeys: ['leaf-1', 'leaf-2'],
          values: [undefined, undefined],
        },
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

    expect(wrapper.text()).toContain('2 / 2')
  })

  it('未选择叶子节点时，不显示数量 tips', () => {
    const wrapper = mountTreeInput()

    expect(wrapper.text()).not.toContain('0 / 2')
    expect(wrapper.text()).not.toContain('/ 2')
  })

  it('收起节点时不重复回写 checkedKeys，避免已选子节点阻止父级折叠', async () => {
    const setCheckedKeys = vi.fn()
    const setExpandedKeys = vi.fn()

    const TreeV2ExposeStub = defineComponent({
      name: 'TreeV2ExposeStub',
      props: ['data', 'props'],
      emits: ['check', 'node-expand', 'node-collapse'],
      setup(_, { emit, expose }) {
        expose({
          setCheckedKeys,
          setExpandedKeys,
        })

        return () =>
          h('button', {
            'data-testid': 'tree-collapse-node',
            type: 'button',
            onClick: () => emit('node-collapse', { key: 'group-1' }),
          })
      },
    })

    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {
          selectedKeys: ['leaf-1'],
          values: [undefined],
        },
        prop: createTreeProp(),
        options: treeOptions,
        isOptionsLoading: false,
        optionsError: '',
      },
      global: {
        stubs: {
          InputText: createInputTextStub,
          ElTreeV2: TreeV2ExposeStub,
        },
      },
    })

    await nextTick()
    setCheckedKeys.mockClear()
    setExpandedKeys.mockClear()

    await wrapper.get('[data-testid="tree-collapse-node"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(setCheckedKeys).not.toHaveBeenCalled()
    expect(setExpandedKeys).toHaveBeenCalled()
  })

  it('收起父节点时会同步清理后代 expanded keys，避免被 TreeV2 自动重新展开', async () => {
    const setExpandedKeys = vi.fn()

    const TreeV2ExposeStub = defineComponent({
      name: 'TreeV2ExposeStub',
      props: ['data', 'props'],
      emits: ['check', 'node-expand', 'node-collapse'],
      setup(_, { emit, expose }) {
        expose({
          setCheckedKeys: vi.fn(),
          setExpandedKeys,
        })

        return () =>
          h('div', [
            h('button', {
              'data-testid': 'tree-expand-parent',
              type: 'button',
              onClick: () =>
                emit('node-expand', {
                  key: 'group-1',
                  children: [{ key: 'group-1-1', children: [{ key: 'leaf-1' }] }],
                }),
            }),
            h('button', {
              'data-testid': 'tree-expand-child',
              type: 'button',
              onClick: () =>
                emit('node-expand', {
                  key: 'group-1-1',
                  children: [{ key: 'leaf-1' }],
                }),
            }),
            h('button', {
              'data-testid': 'tree-collapse-parent',
              type: 'button',
              onClick: () =>
                emit('node-collapse', {
                  key: 'group-1',
                  children: [{ key: 'group-1-1', children: [{ key: 'leaf-1' }] }],
                }),
            }),
          ])
      },
    })

    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {
          selectedKeys: ['leaf-1'],
          values: [undefined],
        },
        prop: createTreeProp(),
        options: treeOptions,
        isOptionsLoading: false,
        optionsError: '',
      },
      global: {
        stubs: {
          InputText: createInputTextStub,
          ElTreeV2: TreeV2ExposeStub,
        },
      },
    })

    await nextTick()
    setExpandedKeys.mockClear()

    await wrapper.get('[data-testid="tree-expand-parent"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="tree-expand-child"]').trigger('click')
    await nextTick()

    setExpandedKeys.mockClear()

    await wrapper.get('[data-testid="tree-collapse-parent"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(setExpandedKeys).toHaveBeenLastCalledWith([])
  })

  it('treeViewport 为 sm 时使用更紧凑的树高度', () => {
    const wrapper = mount(PropertyFieldTreeInput, {
      props: {
        modelValue: {},
        prop: createTreeProp({ treeViewport: 'sm' }),
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

    expect(wrapper.get('[data-testid="tree-v2-stub"]').classes()).toContain('max-h-[220px]')
    expect(wrapper.get('[data-testid="tree-v2-stub"]').classes()).not.toContain('max-h-[360px]')
  })

  it('tree 可滚动且未到边界时，滚轮只驱动 tree 自身滚动', async () => {
    const { wrapper, scrollContainer } = mountTreeInputInScrollContainer()
    setElementScrollMetrics(scrollContainer, {
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 120,
    })

    const treeViewport = wrapper.get('[data-testid="tree-scroll-window"]').element
    setElementScrollMetrics(treeViewport, {
      clientHeight: 180,
      scrollHeight: 540,
      scrollTop: 40,
    })

    treeViewport.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 60,
      bubbles: true,
      cancelable: true,
    }))

    expect((treeViewport as HTMLElement).scrollTop).toBe(100)
    expect(scrollContainer.scrollTop).toBe(120)

    wrapper.unmount()
  })

  it('tree 滚动到边界后，需要鼠标移动一次才释放父级滚动链路', async () => {
    const { wrapper } = mountTreeInputInScrollContainer()

    const treeViewport = wrapper.get('[data-testid="tree-scroll-window"]').element
    setElementScrollMetrics(treeViewport, {
      clientHeight: 180,
      scrollHeight: 540,
      scrollTop: 360,
    })

    const wheelEvent = new WheelEvent('wheel', {
      deltaY: 60,
      bubbles: true,
      cancelable: true,
    })

    const wasCanceled = treeViewport.dispatchEvent(wheelEvent)

    expect(wasCanceled).toBe(false)
    expect(wheelEvent.defaultPrevented).toBe(true)

    treeViewport.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
    }))

    const releasedWheelEvent = new WheelEvent('wheel', {
      deltaY: 60,
      bubbles: true,
      cancelable: true,
    })

    const wasReleased = treeViewport.dispatchEvent(releasedWheelEvent)

    expect(wasReleased).toBe(true)
    expect(releasedWheelEvent.defaultPrevented).toBe(false)

    wrapper.unmount()
  })

  it('tree 没有可滚动内容时直接释放父级滚动链路', async () => {
    const { wrapper } = mountTreeInputInScrollContainer()

    const treeViewport = wrapper.get('[data-testid="tree-scroll-window"]').element
    setElementScrollMetrics(treeViewport, {
      clientHeight: 180,
      scrollHeight: 180,
      scrollTop: 0,
    })

    const wheelEvent = new WheelEvent('wheel', {
      deltaY: 60,
      bubbles: true,
      cancelable: true,
    })

    const wasReleased = treeViewport.dispatchEvent(wheelEvent)

    expect(wasReleased).toBe(true)
    expect(wheelEvent.defaultPrevented).toBe(false)

    wrapper.unmount()
  })

})
