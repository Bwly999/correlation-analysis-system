/**
 * NewNotebookDialog 组件单测。
 *
 * 验证：
 *   - open=false 时不渲染
 *   - open=true 时显示标题 + 取消 + 开始分析按钮
 *   - 列出 available 项，按 kind 切换 Tab
 *   - 选中后 "开始分析" 可点击 → emit start 携带选中项
 *   - 取消 → emit cancel 与 update:open(false)
 *   - 列表为空 → "没有可用项"
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NewNotebookDialog from '../NewNotebookDialog.vue'
import type { NotebookDataSource } from '../NewNotebookDialog.vue'

const SOURCES: NotebookDataSource[] = [
  { id: 'n1', kind: 'canvas-node', label: '清洗-Q2', rowCount: 100, columnCount: 4, fields: ['id', 'age'] },
  { id: 'n2', kind: 'canvas-node', label: '筛选-Top10', rowCount: 10, columnCount: 8 },
  { id: 'd1', kind: 'data-source', label: 'CSV 上传', rowCount: 500, columnCount: 12 },
]

describe('NewNotebookDialog', () => {
  it('open=false → 不渲染对话框内容', () => {
    const wrapper = mount(NewNotebookDialog, {
      props: { open: false, available: SOURCES },
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('open=true → 显示标题 + 列出画布节点（默认 tab）', () => {
    const wrapper = mount(NewNotebookDialog, {
      props: { open: true, available: SOURCES },
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('新建分析笔记本')
    expect(wrapper.text()).toContain('清洗-Q2')
    expect(wrapper.text()).toContain('筛选-Top10')
    // 默认 tab 不显示数据源
    expect(wrapper.text()).not.toContain('CSV 上传')
  })

  it('Tab 切换 → 显示数据源', async () => {
    const wrapper = mount(NewNotebookDialog, {
      props: { open: true, available: SOURCES },
    })
    const buttons = wrapper.findAll('button').filter((b) => b.text().includes('全局数据源'))
    await buttons[0]!.trigger('click')
    expect(wrapper.text()).toContain('CSV 上传')
    expect(wrapper.text()).not.toContain('清洗-Q2')
  })

  it('选中后 "开始分析" 启用 → emit start', async () => {
    const wrapper = mount(NewNotebookDialog, {
      props: { open: true, available: SOURCES },
    })
    const startBtn = wrapper.findAll('button').find((b) => b.text() === '开始分析')!
    expect(startBtn.attributes('disabled')).toBeDefined()

    const firstRadio = wrapper.find('input[type="radio"]')
    await firstRadio.setValue(true)
    expect(startBtn.attributes('disabled')).toBeUndefined()

    await startBtn.trigger('click')
    const events = wrapper.emitted('start')
    expect(events).toBeTruthy()
    expect((events![0]![0] as NotebookDataSource).id).toBe('n1')
  })

  it('点击取消 → emit cancel + update:open(false)', async () => {
    const wrapper = mount(NewNotebookDialog, {
      props: { open: true, available: SOURCES },
    })
    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === '取消')!
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('update:open')?.[0]?.[0]).toBe(false)
  })

  it('available 为空 tab → "没有可用项"', () => {
    const wrapper = mount(NewNotebookDialog, {
      props: { open: true, available: [] },
    })
    expect(wrapper.text()).toContain('没有可用项')
  })
})
