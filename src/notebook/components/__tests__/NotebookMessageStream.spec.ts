/**
 * NotebookMessageStream 测试
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookMessageStream from '../NotebookMessageStream.vue'
import type { NotebookMessage } from '../../types/messageStream'

describe('NotebookMessageStream', () => {
  it('空消息时显示空态文案', () => {
    const wrapper = mount(NotebookMessageStream, { props: { messages: [] } })
    expect(wrapper.text()).toContain('准备就绪')
    expect(wrapper.text()).toContain('告诉我你的分析目标')
  })

  it('用户消息：右对齐文本块', () => {
    const messages: NotebookMessage[] = [
      { id: 'u1', role: 'user', text: '你好', at: 0 },
    ]
    const wrapper = mount(NotebookMessageStream, { props: { messages } })
    expect(wrapper.text()).toContain('你好')
  })

  it('Agent 消息：渲染各类工具卡片', () => {
    const messages: NotebookMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        at: 0,
        blocks: [
          { kind: 'thinking', data: { id: 'th', durationMs: 500, text: '思考中…' } },
          {
            kind: 'tool',
            data: {
              id: 't1',
              kind: 'python_exec',
              variant: 'inline',
              status: 'success',
              durationMs: 100,
              code: 'print(1)',
              stdout: '1',
              stderr: '',
            },
          },
          {
            kind: 'tool',
            data: {
              id: 't2',
              kind: 'fs_grep',
              status: 'success',
              durationMs: 5,
              pattern: 'lasso',
              scope: 'scripts/*.py',
              matches: [{ path: 'scripts/a.py', line: 12, text: 'from sklearn import lasso' }],
            },
          },
        ],
      },
    ]
    const wrapper = mount(NotebookMessageStream, { props: { messages } })
    expect(wrapper.text()).toContain('思考')
    expect(wrapper.text()).toContain('python_exec_inline')
    expect(wrapper.text()).toContain('fs_grep')
    // grep 命中放在折叠面板里，校验 html 中存在路径
    expect(wrapper.html()).toContain('scripts/a.py')
  })

  it('ask_user 提交 → 冒泡 askUserSubmit', async () => {
    const messages: NotebookMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        at: 0,
        blocks: [
          {
            kind: 'ask_user',
            data: {
              id: 'q1',
              question: '继续？',
              status: 'pending',
              options: [{ id: 'yes', label: '是' }],
            },
          },
        ],
      },
    ]
    const wrapper = mount(NotebookMessageStream, { props: { messages } })

    // 选项 → 确认
    const optBtn = wrapper.findAll('button').find((b) => b.text().includes('是'))!
    await optBtn.trigger('click')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认'))!
    await confirmBtn.trigger('click')

    expect(wrapper.emitted('askUserSubmit')).toBeTruthy()
    expect(wrapper.emitted('askUserSubmit')![0]![0]).toMatchObject({
      askId: 'q1',
      optionIds: ['yes'],
    })
  })
})
