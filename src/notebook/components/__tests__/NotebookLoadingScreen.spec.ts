/**
 * NotebookLoadingScreen 最小测试
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookLoadingScreen from '../NotebookLoadingScreen.vue'

describe('NotebookLoadingScreen', () => {
  it('phase=ready 时不渲染', () => {
    const wrapper = mount(NotebookLoadingScreen, { props: { phase: { kind: 'ready' } } })
    expect(wrapper.html()).toContain('<!--v-if-->')
  })

  it('phase=loading 显示进度与阶段', () => {
    const wrapper = mount(NotebookLoadingScreen, {
      props: {
        phase: {
          kind: 'loading',
          progress: { stage: 'load_packages', percent: 62, detail: 'pandas' },
        },
      },
    })
    expect(wrapper.text()).toContain('准备 Python 环境')
    expect(wrapper.text()).toContain('62%')
    expect(wrapper.text()).toContain('加载科学计算包')
    expect(wrapper.text()).toContain('pandas')
  })

  it('phase=failed 显示错误并支持重试', async () => {
    const wrapper = mount(NotebookLoadingScreen, {
      props: {
        phase: {
          kind: 'failed',
          failure: { reason: '网络错误', detail: '无法加载 wheel' },
        },
      },
    })
    expect(wrapper.text()).toContain('Python 环境加载失败')
    expect(wrapper.text()).toContain('网络错误')

    // 找重试按钮（文案 "重试"）
    const buttons = wrapper.findAll('button')
    const retry = buttons.find((b) => b.text().includes('重试'))
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
  })
})
