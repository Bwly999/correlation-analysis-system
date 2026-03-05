import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import App from '../App.vue'

// Mock ResizeObserver for Vue Flow
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}))

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = '<div id="app" style="width: 1000px; height: 1000px;"></div>'
  })

  it('mounts renders properly', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [PrimeVue],
        directives: {
          'tooltip': Tooltip
        },
        stubs: {
          // Stub out complex canvas to avoid deep DOM issues in unit tests
          VueFlow: true,
          NodeSidebar: true,
          LogPanel: true
        }
      },
      attachTo: document.getElementById('app') as HTMLElement
    })
    expect(wrapper.exists()).toBe(true)
  })
})
