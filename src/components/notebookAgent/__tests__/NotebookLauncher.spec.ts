/**
 * NotebookLauncher 组件单测。
 *
 * 验证：
 *   - 渲染按钮
 *   - 点击按钮 → dialog 打开（含"新建分析笔记本"标题）
 *   - 在 dialog 里选中并点"开始分析" → emit start
 *
 * 说明：launcher 内部挂的 NewNotebookDialog 用 PrimeVue 的 Dialog / Button，
 * 测试中以 stub 化简（与 NewNotebookDialog.spec.ts 一致）。
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookLauncher from '../NotebookLauncher.vue'
import type { NotebookDataSource } from '../NewNotebookDialog.vue'
import { nextTick } from 'vue'

const SOURCES: NotebookDataSource[] = [
  { id: 'n1', kind: 'canvas-node', label: '清洗-Q2', rowCount: 100, columnCount: 4 },
]

const mountLauncher = () =>
  mount(NotebookLauncher, {
    props: { available: SOURCES },
    global: {
      stubs: {
        Dialog: {
          props: ['visible'],
          template: '<div v-if="visible" role="dialog"><slot name="header" /><slot /><slot name="footer" /></div>',
        },
        Button: {
          props: ['disabled', 'label'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>',
        },
      },
    },
  })

describe('NotebookLauncher', () => {
  it('渲染按钮', () => {
    const wrapper = mountLauncher()
    const btn = wrapper.find('[data-testid="notebook-launcher-button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('AI分析')
  })

  it('点击按钮 → dialog 打开', async () => {
    const wrapper = mountLauncher()
    expect(wrapper.text()).not.toContain('新建分析笔记本')
    await wrapper.find('[data-testid="notebook-launcher-button"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('新建分析笔记本')
  })

  it('选中数据源并点 "开始分析" → emit start', async () => {
    const wrapper = mountLauncher()
    await wrapper.find('[data-testid="notebook-launcher-button"]').trigger('click')
    await nextTick()
    await wrapper.findAll('button').find((b) => b.text().includes('清洗-Q2'))!.trigger('click')
    const startBtn = wrapper.findAll('button').find((b) => b.text() === '开始分析')!
    await startBtn.trigger('click')
    expect(wrapper.emitted('start')).toBeTruthy()
    expect((wrapper.emitted('start')![0]![0] as NotebookDataSource).id).toBe('n1')
  })
})
