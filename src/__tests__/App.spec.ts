import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import App from '../App.vue'

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
          // Stub out complex canvas to avoid deep DOM issues in unit tests
          VueFlow: true,
          NodeSidebar: true,
          LogPanel: true,
          MonacoEditor: true,
          WorkflowManagerModal: true, // Stub out newly created modal
        },
      },
      attachTo: document.getElementById('app') as HTMLElement,
    })
    expect(wrapper.exists()).toBe(true)
  })
})
