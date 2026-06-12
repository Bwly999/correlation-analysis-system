/**
 * NotebookView 组件最小测试。
 *
 * 验证基本 contract：
 *   - 三栏渲染（消息流 / 文件树 / 预览）
 *   - 文件树展示 OPFS 中的文件
 *   - 点击文本文件 → 预览面板显示内容
 *   - 点击 markdown 文件 → 预览面板渲染 HTML
 *   - 传入 messages 时正确渲染对话块
 */

import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import NotebookView from '../NotebookView.vue'
import { createMemOpfsRoot } from '../../shared/__tests__/memOpfs'
import { ensureWorkspaceTree, writeFile } from '../../shared/opfsAccess'
import type { NotebookMessage } from '../../types/messageStream'

const buildEnv = async () => {
  const root = createMemOpfsRoot()
  await ensureWorkspaceTree(root)
  await writeFile(root, 'reports/main.md', '# 报告')
  await writeFile(root, 'scripts/explore.py', 'print(1)')
  return root
}

describe('NotebookView', () => {
  it('渲染三栏：消息流 + Workspace + 预览', async () => {
    const root = await buildEnv()
    const wrapper = mount(NotebookView, { props: { opfsRoot: root } })
    await flushPromises()
    expect(wrapper.text()).toContain('准备就绪')
    expect(wrapper.text()).toContain('Workspace')
    expect(wrapper.text()).toContain('预览')
  })

  it('文件树展示 OPFS 中的文件', async () => {
    const root = await buildEnv()
    const wrapper = mount(NotebookView, { props: { opfsRoot: root } })
    await flushPromises()
    expect(wrapper.text()).toContain('main.md')
    expect(wrapper.text()).toContain('explore.py')
  })

  it('点击 .py 文件 → 预览面板显示文本', async () => {
    const root = await buildEnv()
    const wrapper = mount(NotebookView, { props: { opfsRoot: root } })
    await flushPromises()

    const pyRow = wrapper.find('[data-path="scripts/explore.py"]')
    expect(pyRow.exists()).toBe(true)
    await pyRow.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('print(1)')
  })

  it('点击 .md 文件 → 预览面板渲染 HTML', async () => {
    const root = await buildEnv()
    const wrapper = mount(NotebookView, { props: { opfsRoot: root } })
    await flushPromises()

    const mdRow = wrapper.find('[data-path="reports/main.md"]')
    await mdRow.trigger('click')
    await flushPromises()

    // h1 会带上自动生成的 id
    expect(wrapper.html()).toMatch(/<h1[^>]*>\s*报告\s*<\/h1>/)
  })

  it('messages 不为空时渲染消息内容', async () => {
    const root = await buildEnv()
    const messages: NotebookMessage[] = [
      { id: 'm-1', role: 'user', text: '你好', at: 0 },
      {
        id: 'm-2',
        role: 'assistant',
        at: 1,
        blocks: [{ kind: 'text', data: { id: 'b-1', text: '收到，开始分析' } }],
      },
    ]
    const wrapper = mount(NotebookView, {
      props: { opfsRoot: root, messages },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('你好')
    expect(wrapper.text()).toContain('开始分析')
  })
})
