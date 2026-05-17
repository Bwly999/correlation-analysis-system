import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const {
  renderPiAgentMarkdownMock,
  stripPiAgentToolSummaryMock,
} = vi.hoisted(() => ({
  renderPiAgentMarkdownMock: vi.fn((value: string) => `<p>${value}</p>`),
  stripPiAgentToolSummaryMock: vi.fn((value: string) => `filtered:${value}`),
}))

vi.mock('../piAgentMarkdown', () => ({
  renderPiAgentMarkdown: renderPiAgentMarkdownMock,
}))

vi.mock('../piAgentContentFilter', () => ({
  stripPiAgentToolSummary: stripPiAgentToolSummaryMock,
}))

import PiAgentMarkdownRenderer from '../PiAgentMarkdownRenderer.vue'

describe('PiAgentMarkdownRenderer', () => {
  it('renders structured assistant content directly instead of passing it through the legacy filter', () => {
    const wrapper = mount(PiAgentMarkdownRenderer, {
      props: {
        content: '建议先读取分析上下文，再判断价格因子。',
      },
    })

    expect(stripPiAgentToolSummaryMock).not.toHaveBeenCalled()
    expect(renderPiAgentMarkdownMock).toHaveBeenCalledWith('建议先读取分析上下文，再判断价格因子。')
    expect(wrapper.html()).toContain('建议先读取分析上下文，再判断价格因子。')
  })
})
