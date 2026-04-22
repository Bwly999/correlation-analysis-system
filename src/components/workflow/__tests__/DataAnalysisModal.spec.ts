import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createJsonResult, createReportResult } from '@/nodes/result'
import DataAnalysisModal from '../DataAnalysisModal.vue'

vi.mock('../viewers/registry', () => ({
  workflowViewerRegistry: {
    'json-viewer': {
      props: ['data'],
      template: '<div class="json-viewer-stub">json-viewer</div>',
    },
    'report-viewer': {
      props: ['data'],
      template: '<div class="report-viewer-stub">{{ JSON.stringify(data) }}</div>',
    },
  },
}))

const dialogStub = defineComponent({
  name: 'DialogStub',
  props: ['visible', 'appendTo'],
  emits: ['update:visible'],
  template: '<div class="dialog-stub"><slot name="header" /><slot /></div>',
})

const inputNumberStub = defineComponent({
  name: 'InputNumberStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        class: 'input-number-stub',
        type: 'number',
        value: props.modelValue,
        onInput: (event: Event) =>
          emit('update:modelValue', Number((event.target as HTMLInputElement).value)),
      })
  },
})

const createWrapper = (props: any) =>
  mount(DataAnalysisModal, {
    props,
    global: {
      stubs: {
        Dialog: dialogStub,
        InputNumber: inputNumberStub,
        DataChart: true,
      },
    },
  })

describe('DataAnalysisModal', () => {
  it('renders the matched viewer immediately without async loading fallback', () => {
    const data = createReportResult({
      title: '延迟报告',
      sections: [
        {
          type: 'text',
          content: '报告内容',
        },
      ],
    })

    const wrapper = mount(DataAnalysisModal, {
      props: {
        visible: true,
        title: '报告结果',
        data,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: '<div class="dialog-stub"><slot name="header" /><slot /></div>',
          },
          InputNumber: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input class="input-number-stub" :value="modelValue" />',
          },
          DataChart: true,
        },
      },
    })

    expect(wrapper.find('[data-test="result-viewer-loading"]').exists()).toBe(false)
    expect(wrapper.get('.report-viewer-stub').text()).toContain('延迟报告')
  })

  it('shows truncated json preview instead of full oversized payload', async () => {
    const data = createJsonResult({
      rows: Array.from({ length: 25 }, (_, index) => ({
        id: index,
        detail: 'z'.repeat(300),
      })),
    })

    const wrapper = mount(DataAnalysisModal, {
      props: {
        visible: true,
        title: 'JSON 结果',
        data,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: '<div class="dialog-stub"><slot name="header" /><slot /></div>',
          },
          InputNumber: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input class="input-number-stub" :value="modelValue" />',
          },
          DataChart: true,
        },
      },
    })

    const sidebarText = wrapper.get('.structured-preview').text()
    expect(wrapper.get('[data-test="analysis-preview-summary"]').text()).toContain('JSON 数据')
    expect(sidebarText).not.toContain('z'.repeat(260))

    await wrapper.get('[data-test="analysis-preview-toggle-text"]').trigger('click')

    const previewText = wrapper.get('[data-test="analysis-preview-text"]').text()
    expect(previewText).toContain('__truncatedString')
    expect(previewText).toContain('已截断')
  })

  it('shows report summary preview instead of the full report items', () => {
    const data = createReportResult({
      title: '超大报告',
      sections: [
        {
          type: 'details',
          title: '完整明细',
          items: Array.from({ length: 20 }, (_, index) => ({
            feature: `f${index}`,
            values: Array.from({ length: 10 }, (_, valueIndex) => valueIndex),
          })),
        },
      ],
      metadata: {
        sampleCount: 1024,
      },
    })

    const wrapper = mount(DataAnalysisModal, {
      props: {
        visible: true,
        title: '报告结果',
        data,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: '<div class="dialog-stub"><slot name="header" /><slot /></div>',
          },
          InputNumber: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input class="input-number-stub" :value="modelValue" />',
          },
          DataChart: true,
        },
      },
    })

    const sidebarText = wrapper.get('.structured-preview').text()
    expect(wrapper.get('[data-test="analysis-preview-summary"]').text()).toContain('分析报告')
    expect(sidebarText).toContain('分节数')
    expect(sidebarText).not.toContain('values')
  })

  it('shows a guarded fallback preview for oversized plain json objects', () => {
    const data = Object.fromEntries(
      Array.from({ length: 5000 }, (_, index) => [
        `field_${index}`,
        {
          nested: index,
          payload: 'y'.repeat(120),
        },
      ]),
    )

    const wrapper = mount(DataAnalysisModal, {
      props: {
        visible: true,
        title: '超大对象',
        data,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: '<div class="dialog-stub"><slot name="header" /><slot /></div>',
          },
          InputNumber: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input class="input-number-stub" :value="modelValue" />',
          },
          DataChart: true,
        },
      },
    })

    const sidebarText = wrapper.get('.structured-preview').text()
    expect(wrapper.get('[data-test="analysis-preview-summary"]').text()).toContain('JSON 数据')
    expect(sidebarText).toContain('已截断')
    expect(sidebarText).not.toContain('field_4999')
  })

  it('renders a structured sidebar preview for wide tables without dumping tail columns', () => {
    const rows = Array.from({ length: 8 }, (_, rowIndex) =>
      Object.fromEntries(
        Array.from({ length: 18 }, (_, colIndex) => [
          `field_${colIndex}`,
          colIndex === 0 ? `row-${rowIndex}` : `value-${rowIndex}-${colIndex}-${'x'.repeat(30)}`,
        ]),
      ),
    )

    const wrapper = mount(DataAnalysisModal, {
      props: {
        visible: true,
        title: '宽表结果',
        data: createJsonResult(rows),
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: '<div class="dialog-stub"><slot name="header" /><slot /></div>',
          },
          InputNumber: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input class="input-number-stub" :value="modelValue" />',
          },
          DataChart: true,
        },
      },
    })

    expect(wrapper.get('[data-test="analysis-preview-summary"]').text()).toContain('表格数据')
    expect(wrapper.get('[data-test="analysis-preview-omitted-columns"]').text()).toContain('已省略')
    expect(wrapper.find('[data-test="analysis-preview-text"]').exists()).toBe(false)
    const sidebarText = wrapper.get('.structured-preview').text()
    expect(sidebarText).not.toContain('field_17')
    expect(sidebarText).not.toContain('x'.repeat(20))
    expect(wrapper.find('pre').exists()).toBe(false)
  })

  it('does not dump oversized report meta blocks into the preview text', async () => {
    const data = createReportResult(
      {
        title: 'Pearson 结果',
        sections: [
          {
            type: 'text',
            content: '报告摘要',
          },
        ],
      },
      {
        meta: {
          sourceData: Array.from({ length: 200 }, (_, index) => ({ id: index, feature: `f${index}` })),
          pairDetails: Array.from({ length: 400 }, (_, index) => ({
            pair: `f${index}-target`,
            value: index / 100,
          })),
          matrixData: Array.from({ length: 80 }, (_, rowIndex) =>
            Array.from({ length: 80 }, (_, colIndex) => rowIndex + colIndex),
          ),
        },
      },
    )

    const wrapper = mount(DataAnalysisModal, {
      props: {
        visible: true,
        title: 'Pearson 节点',
        data,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible'],
            template: '<div class="dialog-stub"><slot name="header" /><slot /></div>',
          },
          InputNumber: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input class="input-number-stub" :value="modelValue" />',
          },
          DataChart: true,
        },
      },
    })

    const sidebarText = wrapper.get('.structured-preview').text()
    expect(wrapper.get('[data-test="analysis-preview-summary"]').text()).toContain('分析报告')
    expect(sidebarText).not.toContain('f399-target')

    await wrapper.get('[data-test="analysis-preview-toggle-text"]').trigger('click')
    const previewText = wrapper.get('[data-test="analysis-preview-text"]').text()
    expect(previewText).toContain('已截断')
  })

  it('passes appendTo through to the underlying dialog', () => {
    const host = document.createElement('div')

    const wrapper = mount(DataAnalysisModal, {
      props: {
        visible: true,
        title: '挂载宿主测试',
        data: { ok: true },
        appendTo: host,
      },
      global: {
        stubs: {
          Dialog: {
            props: ['visible', 'appendTo'],
            template:
              '<div class="dialog-stub" :data-append-to-type="appendTo && typeof appendTo === \'object\' ? \'element\' : String(appendTo ?? \'\')"><slot name="header" /><slot /></div>',
          },
          InputNumber: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input class="input-number-stub" :value="modelValue" />',
          },
          DataChart: true,
        },
      },
    })

    expect(wrapper.get('.dialog-stub').attributes('data-append-to-type')).toBe('element')
  })

  it('persists sidebar state and preview limit per node storage scope', async () => {
    localStorage.clear()

    const wrapper = createWrapper({
      visible: true,
      title: '宽表结果',
      storageScopeKey: 'node-a',
      data: [
        { id: 1, score: 10 },
        { id: 2, score: 20 },
      ],
    })

    await wrapper.get('.input-number-stub').setValue('2')
    await wrapper.get('button[title="收起预览面板"]').trigger('click')
    await wrapper.unmount()

    const remounted = createWrapper({
      visible: true,
      title: '宽表结果',
      storageScopeKey: 'node-a',
      data: [
        { id: 1, score: 10 },
        { id: 2, score: 20 },
      ],
    })

    expect(remounted.find('button[title="展开预览面板"]').exists()).toBe(true)

    await remounted.get('button[title="展开预览面板"]').trigger('click')
    expect((remounted.get('.input-number-stub').element as HTMLInputElement).value).toBe('2')

    const otherNode = createWrapper({
      visible: true,
      title: '宽表结果',
      storageScopeKey: 'node-b',
      data: [
        { id: 1, score: 10 },
        { id: 2, score: 20 },
      ],
    })

    expect(otherNode.find('button[title="收起预览面板"]').exists()).toBe(true)
    expect((otherNode.get('.input-number-stub').element as HTMLInputElement).value).toBe('3')
  })
})
