/**
 * NotebookLauncher 组件单测。
 *
 * 验证：
 *   - 渲染按钮
 *   - 点击按钮 → dialog 打开（含"新建分析笔记本"标题）
 *   - 在 dialog 里选中并点"开始分析" → emit start
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookLauncher from '../NotebookLauncher.vue'
import type { NotebookDataSource } from '../NewNotebookDialog.vue'
import { nextTick } from 'vue'

const SOURCES: NotebookDataSource[] = [
  { id: 'n1', kind: 'canvas-node', label: '清洗-Q2', rowCount: 100, columnCount: 4 },
]

describe('NotebookLauncher', () => {
  it('渲染按钮', () => {
    const wrapper = mount(NotebookLauncher, { props: { available: SOURCES } })
    const btn = wrapper.find('[data-testid="notebook-launcher-button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('AI分析')
  })

  it('点击按钮 → dialog 打开', async () => {
    const wrapper = mount(NotebookLauncher, { props: { available: SOURCES } })
    expect(wrapper.text()).not.toContain('新建分析笔记本')
    await wrapper.find('[data-testid="notebook-launcher-button"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('新建分析笔记本')
  })

  it('选中数据源并点 "开始分析" → emit start', async () => {
    const wrapper = mount(NotebookLauncher, { props: { available: SOURCES } })
    await wrapper.find('[data-testid="notebook-launcher-button"]').trigger('click')
    await nextTick()
    await wrapper.find('input[type="radio"]').setValue(true)
    const startBtn = wrapper.findAll('button').find((b) => b.text() === '开始分析')!
    await startBtn.trigger('click')
    expect(wrapper.emitted('start')).toBeTruthy()
    expect((wrapper.emitted('start')![0]![0] as NotebookDataSource).id).toBe('n1')
  })
})
