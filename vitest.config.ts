import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@primevue/core': fileURLToPath(
        new URL(
          './node_modules/.pnpm/@primevue+core@4.5.4_vue@3.5.29_typescript@5.9.3_/node_modules/@primevue/core',
          import.meta.url,
        ),
      ),
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
