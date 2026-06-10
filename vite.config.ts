import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { createReadStream, statSync } from 'node:fs'
import https from 'node:https'

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

/**
 * Notebook Agent COI 头中间件。
 *
 * - /notebook.html、/notebook-iframe.html：注入 COOP+COEP（让页面进入 cross-origin isolated）
 * - 所有同源请求：注入 CORP=same-origin。
 *   COEP=require-corp 模式下，如果不给同源资源加 CORP 头，
 *   连 vite dev 的 /src/* / /@vite/client / Worker 脚本都会被浏览器以 ERR_BLOCKED_BY_RESPONSE 拒收。
 *   主站（/、/api/* 等）也加这个头是无害的（同源、最严格）。
 *
 * 主站 / 不加 COOP/COEP，行为不受影响。
 */
const notebookCoiHeaders = (): Plugin => ({
  name: 'notebook-coi-headers',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? ''

      // 给所有响应都加 CORP=same-origin（除非后续中间件改写）
      // /pyodide/* 由 pyodideStaticProxy 改为 cross-origin
      if (!res.getHeader('Cross-Origin-Resource-Policy')) {
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
      }

      const isCoiPage =
        url.startsWith('/notebook.html') ||
        url.startsWith('/notebook-iframe.html') ||
        url === '/notebook' ||
        url.startsWith('/notebook?')
      if (isCoiPage) {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      }
      next()
    })
  },
})

/**
 * Pyodide 资源代理（dev）。
 * 1) /pyodide/v0.27/<file> 优先从 node_modules/pyodide/ 命中（运行时本体 + stdlib）
 * 2) 未命中（即 wheel 包：pandas/numpy 等）→ 透明代理到 jsdelivr
 *    https://cdn.jsdelivr.net/pyodide/v0.27.7/full/<file>
 *
 * 生产构建时由 ops/pyodide-runtime/ 中预先下载好的产物替代。
 */
const pyodideStaticProxy = (): Plugin => {
  const PYODIDE_VERSION = 'v0.27'
  const CDN_VERSION = 'v0.27.7'
  const localDir = resolve(__dirname, 'node_modules/pyodide')

  const contentTypeOf = (file: string): string => {
    if (file.endsWith('.wasm')) return 'application/wasm'
    if (file.endsWith('.js')) return 'application/javascript'
    if (file.endsWith('.mjs')) return 'application/javascript'
    if (file.endsWith('.json')) return 'application/json'
    if (file.endsWith('.zip')) return 'application/zip'
    if (file.endsWith('.whl')) return 'application/octet-stream'
    return 'application/octet-stream'
  }

  return {
    name: 'pyodide-static-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith(`/pyodide/${PYODIDE_VERSION}/`)) {
          next()
          return
        }

        // 解析文件名（去 query string）
        const fileName = url
          .slice(`/pyodide/${PYODIDE_VERSION}/`.length)
          .split('?')[0]

        if (!fileName || fileName.includes('..')) {
          res.statusCode = 400
          res.end('bad pyodide path')
          return
        }

        const localPath = resolve(localDir, fileName)
        let hitLocal = false
        try {
          const stat = statSync(localPath)
          if (stat.isFile()) {
            hitLocal = true
          }
        } catch {
          hitLocal = false
        }

        // COEP 必须头
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Content-Type', contentTypeOf(fileName))

        if (hitLocal) {
          createReadStream(localPath).pipe(res)
          return
        }

        // 兜底：代理到 jsdelivr（仅 dev）
        const cdnUrl = `https://cdn.jsdelivr.net/pyodide/${CDN_VERSION}/full/${fileName}`
        const upstream = https.get(cdnUrl, (upRes) => {
          const status = upRes.statusCode ?? 502
          if (status !== 200) {
            res.statusCode = status
            res.end(`pyodide cdn upstream ${status}`)
            upRes.resume()
            return
          }
          // 透传 content-length
          const len = upRes.headers['content-length']
          if (len) res.setHeader('Content-Length', len)
          upRes.pipe(res)
        })
        upstream.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.error('[pyodide-proxy] cdn fetch failed', cdnUrl, err)
          res.statusCode = 502
          res.end('pyodide cdn unreachable')
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // worker 输出 classic 格式（iife），而非 module worker。
  // 原因：pyodide 在 worker 中靠 importScripts(pyodide.asm.js) 加载，
  // module worker 没有 importScripts，会触发 fallback await import() 路径，
  // 实际测试 dev 模式下加载会因循环依赖+sourcemap 等问题失败。
  // classic worker + importScripts 是 pyodide 官方推荐路径，最稳。
  worker: {
    format: 'iife',
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        notebook: resolve(__dirname, 'notebook.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('/src/notebook/') || id.includes('\\src\\notebook\\')) {
            return 'vendor-notebook'
          }
          if (id.includes('node_modules/pyodide') || id.includes('\\pyodide\\')) {
            return 'vendor-pyodide'
          }
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
    notebookCoiHeaders(),
    pyodideStaticProxy(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
