import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { createReusableDevApiHandler } from './src/server/dev/reusableDevApiHandler.js'

const devEnv = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')

Object.entries(devEnv).forEach(([key, value]) => {
  if (process.env[key] === undefined) {
    process.env[key] = value
  }
})

const isVueRuntimeModule = (id: string) =>
  id.includes('node_modules/@vue/')
  || id.includes('node_modules/.pnpm/@vue+')
  || id.includes('/vue/dist/')
  || id.includes('\\vue\\dist\\')

const isVueEcosystemModule = (id: string) =>
  isVueRuntimeModule(id)
  || id.includes('pinia')
  || id.includes('vue-router')
  || id.includes('@vueuse/')
  || id.includes('node_modules/.pnpm/@vueuse+')
  || id.includes('vue-draggable-plus')

const isServerSourceFile = (file: string) =>
  file.replaceAll('\\', '/').includes('/src/server/')

const workflowServerDevMiddleware = (): Plugin => {
  return {
    name: 'workflow-server-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      const apiHandler = createReusableDevApiHandler(() =>
        server
          .ssrLoadModule('/src/server/app.ts')
          .then(({ createServerApp }) => createServerApp()),
      )

      server.watcher.on('all', (_event, file) => {
        if (!isServerSourceFile(file)) {
          return
        }

        void apiHandler.dispose()
      })

      server.httpServer?.once('close', () => {
        void apiHandler.dispose()
      })

      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/')) {
          next()
          return
        }

        void apiHandler.handle(request, response)
          .then(() => undefined)
          .catch(next)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
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
          if (id.includes('@primevue/themes')) {
            return 'vendor-primevue-theme'
          }
          if (id.includes('primevue') || id.includes('@primevue')) {
            return 'vendor-primevue'
          }
          if (id.includes('element-plus')) {
            return 'vendor-element-plus'
          }
          if (id.includes('html2canvas')) {
            return 'vendor-export-canvas'
          }
          if (id.includes('jspdf')) {
            return 'vendor-export-jspdf'
          }
          if (id.includes('canvg') || id.includes('svg2pdf') || id.includes('rgbcolor')) {
            return 'vendor-export-svg'
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
          if (isVueEcosystemModule(id)) {
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
    workflowServerDevMiddleware(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
