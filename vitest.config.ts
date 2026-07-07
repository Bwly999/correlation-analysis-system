import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@opencode-ai/sdk/v2': fileURLToPath(new URL('./test/mocks/opencodeSdkV2.ts', import.meta.url)),
      'monaco-editor': fileURLToPath(new URL('./test/mocks/monacoEditor.ts', import.meta.url)),
      'monaco-editor/esm/vs/editor/editor.worker': fileURLToPath(
        new URL('./test/mocks/monacoEditorWorker.ts', import.meta.url),
      ),
      'monaco-editor/esm/vs/language/json/json.worker': fileURLToPath(
        new URL('./test/mocks/monacoJsonWorker.ts', import.meta.url),
      ),
      'monaco-editor/esm/vs/language/typescript/ts.worker': fileURLToPath(
        new URL('./test/mocks/monacoTsWorker.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      'ref/**',
      '.worktrees/**',
      'worktrees/**',
      'dist-server/**',
    ],
    root: fileURLToPath(new URL('./', import.meta.url)),
  },
})
