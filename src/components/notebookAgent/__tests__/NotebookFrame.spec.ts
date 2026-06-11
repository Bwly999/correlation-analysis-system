/**
 * NotebookFrame.vue 组件最小测试。
 *
 * 仅验证组件挂载与最外层契约：
 *   - iframe 出现在 DOM 中，src 正确
 *   - 顶栏关闭按钮存在
 *   - 状态徽标默认显示 "准备 Python 环境…"
 *
 * 业务流程在 useNotebookSession 单测里覆盖；这里不重复。
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookFrame from '../NotebookFrame.vue'

describe('NotebookFrame', () => {
  const initialData = {
    buffer: new TextEncoder().encode('a,b\n1,2').buffer as ArrayBuffer,
    meta: {
      sourceKind: 'canvas-node' as const,
      sourceLabel: 'cleanup',
      rowCount: 1,
      columnCount: 2,
    },
  }

  it('挂载后渲染 iframe，src 携带 sessionId', () => {
    const wrapper = mount(NotebookFrame, {
      props: { sessionId: 'sess-x', initialData, origin: 'http://localhost:5173' },
    })
    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('src')).toBe('/notebook.html?session=sess-x')
  })

  it('挂载后渲染关闭按钮 + 默认状态徽标', () => {
    const wrapper = mount(NotebookFrame, {
      props: { sessionId: 's', initialData, origin: 'http://localhost' },
    })
    const closeBtn = wrapper.find('button[aria-label="关闭笔记本"]')
    expect(closeBtn.exists()).toBe(true)
    expect(wrapper.text()).toContain('准备 Python 环境')
  })

  it('点击关闭按钮 → emit close', async () => {
    const wrapper = mount(NotebookFrame, {
      props: { sessionId: 's', initialData, origin: 'http://localhost' },
    })
    const closeBtn = wrapper.find('button[aria-label="关闭笔记本"]')
    await closeBtn.trigger('click')
    // 关闭流程是异步的（requestClose 走 bridge），等待 microtasks
    await new Promise((r) => setTimeout(r, 50))
    // dispose 之后应当 emit close
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
