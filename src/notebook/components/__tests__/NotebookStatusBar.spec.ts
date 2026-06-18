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

  it('isRunning=true 时渲染运行中状态点', () => {
    const wrapper = mount(NotebookStatusBar, {
      props: { stats: { memoryMb: 100, cellCount: 1, agentSeconds: 5, isRunning: true } },
    })
    expect(wrapper.text()).toContain('运行中')
  })

  it('不再渲染 STOP 停止按钮', () => {
    const wrapper = mount(NotebookStatusBar, {
      props: { stats: { memoryMb: 100, cellCount: 1, agentSeconds: 5, isRunning: true } },
    })
    expect(wrapper.find('button').exists()).toBe(false)
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
