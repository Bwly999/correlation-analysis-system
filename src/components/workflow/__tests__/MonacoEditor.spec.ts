// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const monacoEditorSource = readFileSync(
  path.resolve(__dirname, '../MonacoEditor.vue'),
  'utf-8',
)
const monacoEnvironmentSource = readFileSync(
  path.resolve(__dirname, '../monacoEnvironment.ts'),
  'utf-8',
)

describe('MonacoEditor', () => {
  it('keeps wiring Monaco through the package entry and local environment bootstrap', () => {
    expect(monacoEditorSource).toContain("import * as monaco from 'monaco-editor'")
    expect(monacoEditorSource).toContain("import { ensureMonacoEnvironment } from './monacoEnvironment'")
    expect(monacoEditorSource).toContain('ensureMonacoEnvironment()')
    expect(monacoEditorSource).toContain('loader.config({ monaco })')
  })

  it('keeps routing json and ts-like labels to the expected Monaco workers', () => {
    expect(monacoEnvironmentSource).toContain("import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'")
    expect(monacoEnvironmentSource).toContain("import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'")
    expect(monacoEnvironmentSource).toContain("import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'")
    expect(monacoEnvironmentSource).toContain("if (label === 'json')")
    expect(monacoEnvironmentSource).toContain("if (label === 'typescript' || label === 'javascript')")
    expect(monacoEnvironmentSource).toContain('return new editorWorker()')
  })

  it('keeps the square shell while passing height through the Monaco wrapper', () => {
    expect(monacoEditorSource).toContain('class="monaco-wrapper border border-slate-200 rounded-none bg-white shadow-inner"')
    expect(monacoEditorSource).toContain(":height=\"height || '300px'\"")
    expect(monacoEditorSource).toContain('class-name="monaco-instance"')
  })

  it('stays close to the library demo instead of reintroducing fixed overflow widget tweaks', () => {
    expect(monacoEditorSource).toContain('padding: { top: 12, bottom: 16 }')
    expect(monacoEditorSource).not.toContain('fixedOverflowWidgets')
    expect(monacoEditorSource).not.toContain('overflow-hidden')
  })

  it('keeps injecting declarations into javascriptDefaults for JS 节点提示', () => {
    expect(monacoEditorSource).toContain('const javascriptDefaults = (')
    expect(monacoEditorSource).toContain('javascriptDefaults.addExtraLib(')
    expect(monacoEditorSource).toContain('`ts:js-transform-${btoa(unescape(encodeURIComponent(declarations))).replace(/=+$/g, \'\')}.d.ts`')
  })
})
