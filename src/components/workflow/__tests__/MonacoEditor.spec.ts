import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MonacoEditor from '../MonacoEditor.vue'

const {
  addExtraLibMock,
  loaderConfigMock,
  editorWorkerCtor,
  jsonWorkerCtor,
  tsWorkerCtor,
} = vi.hoisted(() => {
  const createWorkerCtor = (kind: string) =>
    vi.fn().mockImplementation(function MockWorker(this: { kind: string }) {
      this.kind = kind
    })

  return {
    addExtraLibMock: vi.fn(() => ({
      dispose: vi.fn(),
    })),
    loaderConfigMock: vi.fn(),
    editorWorkerCtor: createWorkerCtor('editor'),
    jsonWorkerCtor: createWorkerCtor('json'),
    tsWorkerCtor: createWorkerCtor('ts'),
  }
})

vi.mock('@guolao/vue-monaco-editor', () => ({
  loader: {
    config: loaderConfigMock,
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
        addExtraLib: addExtraLibMock,
      },
    },
  },
}))

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({
  default: editorWorkerCtor,
}))

vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({
  default: jsonWorkerCtor,
}))

vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({
  default: tsWorkerCtor,
}))

describe('MonacoEditor', () => {
  const readWorkerKind = (worker: unknown) => (worker as { kind?: string } | undefined)?.kind

  it('registers a MonacoEnvironment worker factory for subpath-safe worker loading', () => {
    mount(MonacoEditor, {
      props: {
        modelValue: 'return rows',
        language: 'javascript',
      },
    })

    const monacoEnvironment = (
      globalThis as typeof globalThis & {
        MonacoEnvironment?: {
          getWorker?: (workerId: string, label: string) => { kind: string }
        }
      }
    ).MonacoEnvironment

    expect(monacoEnvironment?.getWorker).toBeTypeOf('function')
  })

  it('routes javascript/typescript/json workers through the expected Vite worker constructors', () => {
    mount(MonacoEditor, {
      props: {
        modelValue: 'return rows',
        language: 'javascript',
      },
    })

    const monacoEnvironment = (
      globalThis as typeof globalThis & {
        MonacoEnvironment?: {
          getWorker?: (workerId: string, label: string) => { kind: string }
        }
      }
    ).MonacoEnvironment

    const jsWorker = monacoEnvironment?.getWorker?.('', 'javascript')
    const tsWorker = monacoEnvironment?.getWorker?.('', 'typescript')
    const jsonWorker = monacoEnvironment?.getWorker?.('', 'json')
    const fallbackWorker = monacoEnvironment?.getWorker?.('', 'css')

    expect(readWorkerKind(jsWorker)).toBe('ts')
    expect(readWorkerKind(tsWorker)).toBe('ts')
    expect(readWorkerKind(jsonWorker)).toBe('json')
    expect(readWorkerKind(fallbackWorker)).toBe('editor')
  })

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

  it('keeps injecting declarations into javascriptDefaults for JS 节点提示', () => {
    mount(MonacoEditor, {
      props: {
        modelValue: 'return rows.map((row) => row)',
        language: 'javascript',
        declarations: 'declare const rows: Array<Record<string, unknown>>',
      },
    })

    expect(addExtraLibMock).toHaveBeenCalledTimes(1)
    expect(addExtraLibMock).toHaveBeenCalledWith(
      'declare const rows: Array<Record<string, unknown>>',
      expect.stringMatching(/^ts:js-transform-/),
    )
  })
})
