import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { createReadStream, statSync } from 'node:fs'

import { defineConfig, loadEnv, build } from 'vite'
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
 * Notebook Agent COI 头中间件�?
 *
 * - /notebook.html�?notebook-iframe.html：注�?COOP+COEP（让页面进入 cross-origin isolated�?
 * - 所有同源请求：注入 CORP=same-origin�?
 *   COEP=require-corp 模式下，如果不给同源资源�?CORP 头，
 *   �?vite dev �?/src/* / /@vite/client / Worker 脚本都会被浏览器�?ERR_BLOCKED_BY_RESPONSE 拒收�?
 *   主站�?�?api/* 等）也加这个头是无害的（同源、最严格）�?
 *
 * 主站 / 不加 COOP/COEP，行为不受影响�?
 */
const notebookCoiHeaders = (): Plugin => ({
  name: 'notebook-coi-headers',
  apply: 'serve',
  configureServer(server) {
    // 直接在 configureServer 里 use 的中间件跑在 Vite baseMiddleware 之前，
    // 此时 req.url 仍带 base 前缀（如 /workflow/notebook.html）。先按 server.config.base
    // 归一化，再做 notebook 路径判断，使 base 子路径部署下 COI 头仍能正确注入。
    const base = server.config.base
    server.middlewares.use((req, res, next) => {
      const raw = req.url ?? ''
      const url = base !== '/' && raw.startsWith(base) ? '/' + raw.slice(base.length) : raw

      // 给所有响应都�?CORP=same-origin（除非后续中间件改写�?
      // /pyodide/* �?pyodideStaticProxy 改为 cross-origin
      if (!res.getHeader('Cross-Origin-Resource-Policy')) {
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
      }

      const isCoiPage =
        url.startsWith('/notebook.html') ||
        url.startsWith('/notebook-iframe.html') ||
        url === '/notebook' ||
        url.startsWith('/notebook?')
      const isNotebookWorkerModule = url.startsWith('/src/notebook/')
      if (isCoiPage || isNotebookWorkerModule) {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      }
      next()
    })
  },
})

/**
 * Pyodide 资源代理（dev）�?
 * 1) /pyodide/v0.27/<file> 优先�?ops/pyodide-runtime/v0.27.x 命中（完整自托管运行时）
 * 2) �?ops 目录尚未准备，则退�?node_modules/pyodide/（仅运行时本�?+ lockfile + stdlib�?
 * 3) 若两者都未命中，直接返回明确错误，提示先执行 setup 脚本准备 wheel 资源�?
 *
 * 生产构建时由 ops/pyodide-runtime/ 中预先下载好的产物替代�?
 */
/**
 * 生产构建：把 src/notebook/sw.ts 编译为 dist/notebook-sw.js（IIFE 单文件）。
 *
 * Vite 默认不会为非入口 ts 文件生成独立 bundle；这里用 lib 模式单独 build。
 * 注册由 src/notebook/main.ts 在 import.meta.env.PROD 下完成。
 * 详见 docs/design-doc/notebook-agent/部署与构建.md §5.4。
 */
const buildNotebookSw = (): Plugin => ({
  name: 'build-notebook-sw',
  apply: 'build',
  closeBundle: async () => {
    await build({
      configFile: false,
      build: {
        lib: {
          entry: resolve(__dirname, 'src/notebook/sw.ts'),
          formats: ['iife'],
          fileName: () => 'notebook-sw.js',
        },
        outDir: resolve(__dirname, 'dist'),
        emptyOutDir: false,
      },
    })
    console.log('[notebook-sw] built -> dist/notebook-sw.js')
  },
})

const pyodideStaticProxy = (): Plugin => {
  const PYODIDE_VERSION = 'v0.27'
  const runtimeDir = resolve(__dirname, 'ops', 'pyodide-runtime', 'v0.27.x')
  const fallbackDir = resolve(__dirname, 'node_modules/pyodide')

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
      // 与 notebookCoiHeaders 同理：此中间件先于 baseMiddleware，req.url 仍带 base 前缀。
      // 先按 server.config.base 归一化，使 base 子路径部署下 /workflow/pyodide/... 仍能命中代理。
      const base = server.config.base
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? ''
        const url = base !== '/' && raw.startsWith(base) ? '/' + raw.slice(base.length) : raw
        if (!url.startsWith(`/pyodide/${PYODIDE_VERSION}/`)) {
          next()
          return
        }

        // 解析文件名（�?query string�?
        const fileName = url
          .slice(`/pyodide/${PYODIDE_VERSION}/`.length)
          .split('?')[0]

        if (!fileName || fileName.includes('..')) {
          res.statusCode = 400
          res.end('bad pyodide path')
          return
        }

        const candidatePaths = [
          resolve(runtimeDir, fileName),
          resolve(fallbackDir, fileName),
        ]

        let localPath: string | null = null
        for (const candidate of candidatePaths) {
          try {
            const stat = statSync(candidate)
            if (stat.isFile()) {
              localPath = candidate
              break
            }
          } catch {
            // ignore
          }
        }

        // COEP 必须�?
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Content-Type', contentTypeOf(fileName))

        if (localPath) {
          createReadStream(localPath).pipe(res)
          return
        }

        res.statusCode = 404
        res.end(
          `pyodide asset missing: ${fileName}. 请先运行 node scripts/setup-pyodide-runtime.mjs 准备 ops/pyodide-runtime/v0.27.x`,
        )
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Notebook Worker 通过 vite ?worker import 加载，dev 下实际跑的是 module worker�?
  // Pyodide 启动时会先尝�?importScripts(pyodide.asm.js)，module worker 中此 API 不可用，
  // 所以在 src/notebook/worker/pyodideBoot.ts 内把 importScripts shim �?throw TypeError�?
  // �?pyodide �?await import('pyodide.mjs') 这条 fallback�?
  // 此处保留 format: 'iife' 主要是控制生�?build 产物的形态；
  // 真正的加载机制由 pyodideBoot.ts 内的 shim + dynamic import 决定�?
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
  publicDir: 'public',
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
      buildNotebookSw(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
