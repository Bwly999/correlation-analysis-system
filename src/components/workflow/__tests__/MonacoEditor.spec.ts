import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MonacoEditor from '../MonacoEditor.vue'

vi.mock('@guolao/vue-monaco-editor', () => ({
  loader: {
    config: vi.fn(),
  },
  VueMonacoEditor: {
    name: 'VueMonacoEditor',
    props: ['value', 'language', 'options', 'height', 'className'],
    template:
      '<div class="vue-monaco-editor-mock" :class="className" :data-language="language" :data-height="height" :data-top-padding="options.padding?.top" :data-bottom-padding="options.padding?.bottom"><slot /></div>',
  },
}))

vi.mock('monaco-editor', () => ({
  languages: {
    typescript: {
      javascriptDefaults: {
        addExtraLib: vi.fn(() => ({
          dispose: vi.fn(),
        })),
      },
    },
  },
}))

describe('MonacoEditor', () => {
  it('keeps the square shell while passing the configured height through the Monaco wrapper', () => {
    const wrapper = mount(MonacoEditor, {
      props: {
        modelValue: 'return rows',
        language: 'javascript',
        height: '560px',
      },
    })

    const shell = wrapper.get('.monaco-wrapper')
    const editor = wrapper.get('.vue-monaco-editor-mock')

    expect(shell.classes()).not.toContain('rounded-xl')
    expect(shell.attributes('style')).toBeUndefined()
    expect(editor.attributes('data-height')).toBe('560px')
    expect(editor.attributes('data-top-padding')).toBe('12')
    expect(editor.attributes('data-bottom-padding')).toBe('16')
  })

  it('stays close to the library demo instead of adding custom find-widget positioning', () => {
    const wrapper = mount(MonacoEditor, {
      props: {
        modelValue: '{\n  "city": "上海"\n}',
      },
    })

    const shell = wrapper.get('.monaco-wrapper')
    const editor = wrapper.get('.vue-monaco-editor-mock')

    expect(shell.classes()).not.toContain('overflow-hidden')
    expect(shell.attributes('style')).toBeUndefined()
    expect(editor.classes()).toContain('monaco-instance')
  })
})
