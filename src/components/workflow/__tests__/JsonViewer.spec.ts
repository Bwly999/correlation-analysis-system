import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createJsonResult } from '@/nodes/result'
import JsonViewer from '../viewers/JsonViewer.vue'

describe('JsonViewer', () => {
  it('renders a truncated preview for oversized payloads', () => {
    const data = createJsonResult({
      rows: Array.from({ length: 30 }, (_, index) => ({
        id: index,
        payload: 'y'.repeat(400),
      })),
    })

    const wrapper = mount(JsonViewer, {
      props: { data },
    })

    const previewText = wrapper.get('pre').text()

    expect(previewText).toContain('__truncated')
    expect(previewText).toContain('__omittedItems')
    expect(previewText).not.toContain('y'.repeat(260))
  })
})
