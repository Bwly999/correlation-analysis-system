import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PiAgentMessageList from '../PiAgentMessageList.vue'
import { usePiAgentStore } from '@/stores/piAgentStore'

describe('PiAgentMessageList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders assistant markdown content with rich formatting and safe links', async () => {
    const store = usePiAgentStore()
    store.messages = [
      {
        id: 'assistant_1',
        role: 'assistant',
        content: [
          '# 分析结论',
          '',
          '- 因子一',
          '- 因子二',
          '',
          '> 请优先验证价格弹性',
          '',
          '```ts',
          'const score = 42',
          '```',
          '',
          '| 字段 | 值 |',
          '| --- | --- |',
          '| A | 1 |',
          '',
          '[查看详情](https://example.com)',
          '',
          '<script>alert("xss")</script>',
        ].join('\n'),
        thinking: '',
        status: 'completed',
        toolCalls: [],
        createdAt: Date.now(),
      },
    ]

    const wrapper = mount(PiAgentMessageList)

    expect(wrapper.find('h1').text()).toBe('分析结论')
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('blockquote').text()).toContain('请优先验证价格弹性')
    expect(wrapper.find('pre code').text()).toContain('const score = 42')
    expect(wrapper.find('table').exists()).toBe(true)

    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://example.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')

    expect(wrapper.html()).not.toContain('<script>')
    expect(wrapper.text()).not.toContain('alert("xss")')
  })

  it('renders a polished empty state when there are no messages', () => {
    const wrapper = mount(PiAgentMessageList)

    expect(wrapper.text()).toContain('Pi Agent 已就位')
    expect(wrapper.text()).toContain('你可以让它解读当前工作流')
  })

  it('keeps streaming assistant content rendered as markdown instead of raw source', async () => {
    const store = usePiAgentStore()
    store.messages = [
      {
        id: 'assistant_streaming',
        role: 'assistant',
        content: '## 实时结论\n\n- 正在生成',
        thinking: '',
        status: 'streaming',
        toolCalls: [],
        createdAt: Date.now(),
      },
    ]

    const wrapper = mount(PiAgentMessageList)

    expect(wrapper.find('h2').text()).toBe('实时结论')
    expect(wrapper.find('li').text()).toContain('正在生成')
    expect(wrapper.find('.cursor-blink').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('## 实时结论')
  })
})
