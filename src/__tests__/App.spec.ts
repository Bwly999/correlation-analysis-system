import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

vi.mock('../components/workflow/WorkflowCanvas.vue', () => ({
  default: {
    template: '<div class="workflow-canvas-stub" />',
  },
}))

import App from '../App.vue'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn(),
  }),
}))

// Mock ResizeObserver for Vue Flow
global.ResizeObserver = class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
} as any

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Mock document.queryCommandSupported for Monaco Editor internal checks if needed
    document.queryCommandSupported = vi.fn(() => true)
    document.body.innerHTML = '<div id="app" style="width: 1000px; height: 1000px;"></div>'
  })

  it('mounts renders properly', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [PrimeVue],
        directives: {
          tooltip: Tooltip,
        },
      },
      attachTo: document.getElementById('app') as HTMLElement,
    })
    expect(wrapper.exists()).toBe(true)
  })
})
