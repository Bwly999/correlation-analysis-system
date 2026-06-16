/**
 * NotebookFrame.vue 组件最小测试。
 *
 * 仅验证组件挂载与最外层契约：
 *   - iframe 出现在 DOM 中，src 正确
 *
 * 关闭 / 状态展示均已下沉到 iframe 内的 NotebookTopBar，
 * 通过 parentBridge 与本组件的 onClose 交互；
 * 业务流程在 useNotebookSession 单测里覆盖，这里不重复。
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
      attachTo: document.body,
      props: { sessionId: 'sess-x', initialData, origin: 'http://localhost:5173' },
    })
    // iframe 经 Teleport 挂到 body，从真实 document 取
    const iframe = document.body.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe('/notebook.html?session=sess-x')
    wrapper.unmount()
  })
})
