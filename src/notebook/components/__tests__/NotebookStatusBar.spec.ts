/**
 * NotebookStatusBar.vue 最小测试
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookStatusBar from '../NotebookStatusBar.vue'

describe('NotebookStatusBar', () => {
  it('显示内存 / cells / 时长', () => {
    const wrapper = mount(NotebookStatusBar, {
      props: {
        stats: { memoryMb: 234, cellCount: 12, agentSeconds: 313, isRunning: false },
        memoryLimitMb: 4096,
      },
    })
    expect(wrapper.text()).toContain('234 / 4096 MB')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('5m 13s')
  })

  it('isRunning=true 时停止按钮可用', () => {
    const wrapper = mount(NotebookStatusBar, {
      props: { stats: { memoryMb: 100, cellCount: 1, agentSeconds: 5, isRunning: true } },
    })
    const btn = wrapper.find('button[aria-label="停止当前执行"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('isRunning=false 时停止按钮 disabled', () => {
    const wrapper = mount(NotebookStatusBar, {
      props: { stats: { memoryMb: 100, cellCount: 1, agentSeconds: 5, isRunning: false } },
    })
    const btn = wrapper.find('button')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('点击停止按钮 emit stop', async () => {
    const wrapper = mount(NotebookStatusBar, {
      props: { stats: { memoryMb: 100, cellCount: 1, agentSeconds: 5, isRunning: true } },
    })
    await wrapper.find('button[aria-label="停止当前执行"]').trigger('click')
    expect(wrapper.emitted('stop')).toBeTruthy()
  })

  it('recentlyRestarted=true 时显示已重启', () => {
    const wrapper = mount(NotebookStatusBar, {
      props: {
        stats: {
          memoryMb: 0,
          cellCount: 0,
          agentSeconds: 0,
          isRunning: false,
          recentlyRestarted: true,
        },
      },
    })
    expect(wrapper.text()).toContain('已重启')
  })
})
