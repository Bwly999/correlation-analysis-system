import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createJsonResult, createReportResult } from '@/nodes/result'
import DataAnalysisModal from '../DataAnalysisModal.vue'

vi.mock('../viewers/registry', () => ({
  workflowViewerRegistry: {
    'json-viewer': {
      props: ['data'],
      template: '<div class="json-viewer-stub">{{ JSON.stringify(data) }}</div>',
    },
    'report-viewer': {
      props: ['data'],
      template: '<div class="report-viewer-stub">{{ JSON.stringify(data) }}</div>',
    },
  },
}))

describe('DataAnalysisModal', () => {
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
})
