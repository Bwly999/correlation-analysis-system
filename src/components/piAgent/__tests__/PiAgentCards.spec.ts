import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PiAgentThinkingBlock from '../PiAgentThinkingBlock.vue'
import PiAgentToolCallCard from '../PiAgentToolCallCard.vue'

describe('PiAgent auxiliary cards', () => {
  it('toggles the thinking block content', async () => {
    const wrapper = mount(PiAgentThinkingBlock, {
      props: {
        thinking: '先检查上下文，再执行工作流。',
      },
    })

    expect(wrapper.text()).toContain('推理摘要')
    expect(wrapper.text()).not.toContain('先检查上下文')

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('先检查上下文，再执行工作流。')
  })

  it('toggles tool call details and exposes status styling hooks', async () => {
    const wrapper = mount(PiAgentToolCallCard, {
      props: {
        toolCall: {
          id: 'tool_1',
          toolName: 'wf_executeWorkflow',
          displayName: '执行工作流',
          args: { scope: 'workflow' },
          status: 'failed',
          result: '执行失败：缺少输入',
          isError: true,
        },
      },
    })

    expect(wrapper.classes()).toContain('status-failed')
    expect(wrapper.text()).toContain('执行工作流')
    expect(wrapper.text()).not.toContain('缺少输入')

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('参数')
    expect(wrapper.text()).toContain('结果')
    expect(wrapper.text()).toContain('执行失败：缺少输入')
  })
})
