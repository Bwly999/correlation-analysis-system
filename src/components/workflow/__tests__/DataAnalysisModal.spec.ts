import { defineAsyncComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createJsonResult, createReportResult } from '@/nodes/result'
import DataAnalysisModal from '../DataAnalysisModal.vue'

let resolveReportViewer: (() => void) | null = null

vi.mock('../viewers/registry', () => ({
  workflowViewerRegistry: {
    'json-viewer': {
      props: ['data'],
      template: '<div class="json-viewer-stub">{{ JSON.stringify(data) }}</div>',
    },
    'report-viewer': defineAsyncComponent(
      () =>
        new Promise<any>((resolve) => {
          resolveReportViewer = () =>
            resolve({
              props: ['data'],
              template: '<div class="report-viewer-stub">{{ JSON.stringify(data) }}</div>',
            })
        }),
    ),
  },
}))

describe('DataAnalysisModal', () => {
  it('shows a loading state while the async viewer is still resolving', async () => {
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

    expect(wrapper.get('[data-test="result-viewer-loading"]').text()).toContain('正在加载结果视图')
    expect(wrapper.find('.report-viewer-stub').exists()).toBe(false)

    resolveReportViewer?.()
    await flushPromises()

    expect(wrapper.find('[data-test="result-viewer-loading"]').exists()).toBe(false)
    expect(wrapper.get('.report-viewer-stub').text()).toContain('延迟报告')
  })

  it('shows truncated json preview instead of full oversized payload', () => {
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

    const previewText = wrapper.get('pre').text()
    expect(previewText).toContain('__truncated')
    expect(previewText).toContain('__omittedItems')
    expect(previewText).not.toContain('z'.repeat(260))
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

    const previewText = wrapper.get('pre').text()
    expect(previewText).toContain('sectionCount')
    expect(previewText).toContain('itemCount')
    expect(previewText).toContain('sampleCount')
    expect(previewText).not.toContain('values')
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

    const previewText = wrapper.get('pre').text()
    expect(previewText).toContain('budgetExceeded')
    expect(previewText).toContain('__previewTruncated')
    expect(previewText).not.toContain('field_4999')
  })

  it('does not dump oversized report meta blocks into the preview text', () => {
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

    const previewText = wrapper.get('pre').text()
    expect(previewText).toContain('budgetExceeded')
    expect(previewText).not.toContain('f399-target')
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
})
