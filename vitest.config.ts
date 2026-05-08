import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@opencode-ai/sdk/v2': fileURLToPath(new URL('./test/mocks/opencodeSdkV2.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
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
