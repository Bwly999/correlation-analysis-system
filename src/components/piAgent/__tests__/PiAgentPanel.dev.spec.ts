import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PiAgentPanel from '../PiAgentPanel.vue'
import { usePiAgentStore } from '@/stores/piAgentStore'

vi.mock('@/utils/devtoolsEnvironment', () => ({
  isAgentObservabilityEnabledInDev: () => true,
}))

describe('PiAgentPanel dev raw toggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('toggles the panel-level raw content display', async () => {
    const store = usePiAgentStore()
    store.messages = [
      {
        id: 'assistant_1',
        role: 'assistant',
        content: '你是一个数据分析助手，帮助用户构建和执行多因子相关性分析工作流。',
        thinking: '',
        status: 'completed',
        toolCalls: [],
        createdAt: Date.now(),
      },
    ]

    const wrapper = mount(PiAgentPanel, {
      global: {
        stubs: {
          PiAgentMessageList: {
            props: ['debugVisible'],
            template: '<div class="message-list-stub" :data-debug-visible="String(debugVisible)"></div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('显示原文')
    expect(wrapper.find('.message-list-stub').attributes('data-debug-visible')).toBe('false')

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('关闭原文')
    expect(wrapper.find('.message-list-stub').attributes('data-debug-visible')).toBe('true')
  })
})
