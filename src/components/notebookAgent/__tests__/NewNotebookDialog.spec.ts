/**
 * NewNotebookDialog 组件单测。
 *
 * 验证：
 *   - open=false 时不渲染
 *   - open=true 时显示标题 + 列出画布节点
 *   - 选中节点后 "开始分析" 启用 → emit start(source)
 *   - 选择「空白笔记本」→ emit start(null)（不导入数据直接进入）
 *   - 取消 → emit cancel 与 update:open(false)
 *   - 列表为空 → 空状态文案 + 仍可走空白笔记本
 *
 * 说明：组件用 PrimeVue 的 Dialog / Button，测试中以 stub 化简，
 * stub Dialog 仅在 visible=true 时渲染并暴露 header/body/footer 槽位，
 * stub Button 透传 disabled 与 click。
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NewNotebookDialog from '../NewNotebookDialog.vue'
import type { NotebookDataSource } from '../NewNotebookDialog.vue'

const SOURCES: NotebookDataSource[] = [
  { id: 'n1', kind: 'canvas-node', label: '清洗-Q2', rowCount: 100, columnCount: 4, fields: ['id', 'age'] },
  { id: 'n2', kind: 'canvas-node', label: '筛选-Top10', rowCount: 10, columnCount: 8 },
]

const mountDialog = (props: { open: boolean; available: NotebookDataSource[] }) =>
  mount(NewNotebookDialog, {
    props,
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

const findButton = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text))

describe('NewNotebookDialog', () => {
  it('open=false → 不渲染对话框内容', () => {
    const wrapper = mountDialog({ open: false, available: SOURCES })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('open=true → 显示标题 + 列出画布节点', () => {
    const wrapper = mountDialog({ open: true, available: SOURCES })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('新建分析笔记本')
    expect(wrapper.text()).toContain('清洗-Q2')
    expect(wrapper.text()).toContain('筛选-Top10')
    expect(wrapper.text()).toContain('空白笔记本')
  })

  it('未选中时 "开始分析" 禁用；选中节点后启用并 emit start(source)', async () => {
    const wrapper = mountDialog({ open: true, available: SOURCES })
    const startBtn = findButton(wrapper, '开始分析')!
    expect(startBtn.attributes('disabled')).toBeDefined()

    await findButton(wrapper, '清洗-Q2')!.trigger('click')
    expect(startBtn.attributes('disabled')).toBeUndefined()

    await startBtn.trigger('click')
    const events = wrapper.emitted('start')
    expect(events).toBeTruthy()
    expect((events![0]![0] as NotebookDataSource).id).toBe('n1')
  })

  it('选择「空白笔记本」→ emit start(null)', async () => {
    const wrapper = mountDialog({ open: true, available: SOURCES })
    await findButton(wrapper, '空白笔记本')!.trigger('click')
    await findButton(wrapper, '开始分析')!.trigger('click')
    const events = wrapper.emitted('start')
    expect(events).toBeTruthy()
    expect(events![0]![0]).toBeNull()
  })

  it('点击取消 → emit cancel + update:open(false)', async () => {
    const wrapper = mountDialog({ open: true, available: SOURCES })
    await findButton(wrapper, '取消')!.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('update:open')?.[0]?.[0]).toBe(false)
  })

  it('available 为空 → 空状态文案，且仍可走空白笔记本', async () => {
    const wrapper = mountDialog({ open: true, available: [] })
    expect(wrapper.text()).toContain('当前画布没有可导入数据的节点')
    expect(wrapper.text()).toContain('空白笔记本')

    await findButton(wrapper, '空白笔记本')!.trigger('click')
    await findButton(wrapper, '开始分析')!.trigger('click')
    expect(wrapper.emitted('start')![0]![0]).toBeNull()
  })
})
