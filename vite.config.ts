import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'
import AutoImport from 'unplugin-auto-import/vite'
import { createServerHandler } from './src/server/app.js'

const workflowAiServerTarget = process.env.WORKFLOW_AI_SERVER_TARGET || 'http://127.0.0.1:8787'

const workflowAiDevMiddleware = (): Plugin => {
  const handler = createServerHandler()

  return {
    name: 'workflow-ai-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/')) {
          next()
          return
        }

        void handler(request, response)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api/workflow-ai': {
        target: workflowAiServerTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor') || id.includes('@guolao/vue-monaco-editor')) {
            return 'vendor-monaco'
          }
          if (id.includes('echarts') || id.includes('vue-echarts')) {
            return 'vendor-charts'
          }
          if (id.includes('primevue') || id.includes('@primevue')) {
            return 'vendor-primevue'
          }
          if (id.includes('html2canvas')) {
            return 'vendor-export-canvas'
          }
          if (id.includes('html2pdf.js')) {
            return 'vendor-export-pdf'
          }
          if (
            id.includes('lucide-vue-next') ||
            id.includes('radix-vue') ||
            id.includes('shadcn-vue') ||
            id.includes('clsx') ||
            id.includes('tailwind-merge')
          ) {
            return 'vendor-ui'
          }
          if (id.includes('/vue/') || id.includes('\\vue\\') || id.includes('pinia')) {
            return 'vendor-vue'
          }
          if (id.includes('@vue-flow')) {
            return 'vendor-vue-flow'
          }
          if (id.includes('xlsx') || id.includes('papaparse')) {
            return 'vendor-data'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
      eslintrc: {
        enabled: true,
      },
    }),
    (monacoEditorPlugin as any).default({
      languageWorkers: ['json', 'typescript', 'editorWorkerService'],
    }),
    workflowAiDevMiddleware(),
  ],
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
})
