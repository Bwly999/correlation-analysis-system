import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import App from '../App.vue'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn(),
  }),
}))

// Mock Monaco Editor
vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(() => ({
      dispose: vi.fn(),
      getValue: vi.fn(),
      setValue: vi.fn(),
      onDidChangeModelContent: vi.fn(),
    })),
  },
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
        stubs: {
          WorkflowCanvas: { template: '<div class="workflow-canvas-stub" />' },
        },
      },
      attachTo: document.getElementById('app') as HTMLElement,
    })
    expect(wrapper.exists()).toBe(true)
  })
})
