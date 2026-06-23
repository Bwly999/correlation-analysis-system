// @vitest-environment node

import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from 'vite'
import { parseConfigFileTextToJson } from 'typescript'

vi.mock('vite-plugin-monaco-editor', () => ({
  default: {
    default: () => ({
      name: 'mock-monaco-editor-plugin',
    }),
  },
}))

type MiddlewareHandler = (
  request: { url?: string },
  response: EventEmitter,
  next: (error?: unknown) => void,
) => void

const parseTsConfigPaths = (relativePath: string) => {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url))
  const parsed = parseConfigFileTextToJson(filePath, readFileSync(filePath, 'utf8'))

  return parsed.config?.compilerOptions?.paths ?? {}
}

describe('server dev middleware', () => {
  it('loads non-VITE env vars from .env into process.env for the dev server middleware', async () => {
    const previousBackend = process.env.WORKFLOW_STORAGE_BACKEND
    const previousStorageDir = process.env.WORKFLOW_STORAGE_DATA_DIR
    const resolvedEnv = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')

    delete process.env.WORKFLOW_STORAGE_BACKEND
    delete process.env.WORKFLOW_STORAGE_DATA_DIR

    vi.resetModules()

    await import('../../vite.config.ts')

    expect(process.env.WORKFLOW_STORAGE_BACKEND).toBe(resolvedEnv.WORKFLOW_STORAGE_BACKEND)
    expect(process.env.WORKFLOW_STORAGE_DATA_DIR).toBe(resolvedEnv.WORKFLOW_STORAGE_DATA_DIR)

    if (previousBackend === undefined) {
      delete process.env.WORKFLOW_STORAGE_BACKEND
    } else {
      process.env.WORKFLOW_STORAGE_BACKEND = previousBackend
    }

    if (previousStorageDir === undefined) {
      delete process.env.WORKFLOW_STORAGE_DATA_DIR
    } else {
      process.env.WORKFLOW_STORAGE_DATA_DIR = previousStorageDir
    }
  }, 15000)

  it('loads the server handler through vite ssrLoadModule for api requests', async () => {
    vi.resetModules()
    const { default: viteConfig } = await import('../../vite.config.ts')
    const plugin = viteConfig.plugins?.find(
      (candidate) => candidate && typeof candidate === 'object' && 'name' in candidate && candidate.name === 'workflow-server-dev-middleware',
    ) as { configureServer?: (server: any) => void } | undefined

    expect(plugin).toBeTruthy()
    expect(plugin).toHaveProperty('configureServer')

    let middleware: MiddlewareHandler | null = null
    const ready = vi.fn(async () => undefined)
    const emit = vi.fn()
    const ssrLoadModule = vi.fn(async () => ({
      createServerApp: () => ({
        ready,
        close: vi.fn(async () => undefined),
        server: { emit },
      }),
    }))
    const next = vi.fn()

    plugin?.configureServer?.({
      middlewares: {
        use(handler: MiddlewareHandler) {
          middleware = handler
        },
      },
      ssrLoadModule,
    } as any)

    expect(middleware).toBeTypeOf('function')

    middleware!({ url: '/api/pi-agent/model-profiles' }, new EventEmitter(), next)

    await vi.waitFor(() => {
      expect(ssrLoadModule).toHaveBeenCalledWith('/src/server/app.ts')
      expect(ready).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledTimes(1)
      expect(next).not.toHaveBeenCalled()
    })
  })

  it('reloads the server handler for later api requests so new routes can take effect without restarting vite', async () => {
    vi.resetModules()
    const { default: viteConfig } = await import('../../vite.config.ts')
    const plugin = viteConfig.plugins?.find(
      (candidate) => candidate && typeof candidate === 'object' && 'name' in candidate && candidate.name === 'workflow-server-dev-middleware',
    ) as { configureServer?: (server: any) => void } | undefined

    expect(plugin).toBeTruthy()

    let middleware: MiddlewareHandler | null = null
    const firstReady = vi.fn(async () => undefined)
    const secondReady = vi.fn(async () => undefined)
    const firstEmit = vi.fn()
    const secondEmit = vi.fn()
    const ssrLoadModule = vi
      .fn()
      .mockResolvedValueOnce({
        createServerApp: () => ({
          ready: firstReady,
          close: vi.fn(async () => undefined),
          server: { emit: firstEmit },
        }),
      })
      .mockResolvedValueOnce({
        createServerApp: () => ({
          ready: secondReady,
          close: vi.fn(async () => undefined),
          server: { emit: secondEmit },
        }),
      })
    const next = vi.fn()
    // watcher：复用 dev server 的文件监听契约。apiHandler 只在 dispose 后才重新 ssrLoadModule，
    // 而 dispose 由 watcher 检测到 server 源码变更触发。这里提供一个 watcher，
    // 在两次请求之间 emit 一次 server 文件变更，模拟「源码改了」以触发重载。
    const watcher = new EventEmitter()

    plugin?.configureServer?.({
      middlewares: {
        use(handler: MiddlewareHandler) {
          middleware = handler
        },
      },
      ssrLoadModule,
      watcher,
    } as any)

    expect(middleware).toBeTypeOf('function')

    middleware!({ url: '/api/analysis/lasso' }, new EventEmitter(), next)
    await Promise.resolve()
    await Promise.resolve()

    // 触发一次 server 源码变更 → apiHandler.dispose() → 下次请求重新 ssrLoadModule。
    // dispose 是异步的（内部 await appTask 后才置 appTask=null 并 close），
    // 用 setTimeout(0) 确保整个 dispose 异步链跑完，否则第二次 handle 会复用未释放的 appTask。
    watcher.emit('all', 'change', '/src/server/modules/analysisRoutes.ts')
    await new Promise((resolve) => setTimeout(resolve, 0))

    middleware!({ url: '/api/analysis/logistic-regression-classification' }, new EventEmitter(), next)
    await Promise.resolve()
    await Promise.resolve()

    await vi.waitFor(() => {
      expect(ssrLoadModule).toHaveBeenCalledTimes(2)
      expect(firstReady).toHaveBeenCalledTimes(1)
      expect(secondReady).toHaveBeenCalledTimes(1)
      expect(firstEmit).toHaveBeenCalledTimes(1)
      expect(secondEmit).toHaveBeenCalledTimes(1)
      expect(next).not.toHaveBeenCalled()
    })
  })

  it('does not pin primevue core resolution to a versioned pnpm store path', async () => {
    vi.resetModules()

    const { default: viteConfig } = await import('../../vite.config.ts')
    const { default: vitestConfig } = await import('../../vitest.config.ts')

    const viteAliases = viteConfig.resolve?.alias ?? {}
    const vitestAliases = vitestConfig.resolve?.alias ?? {}
    const tsconfigPaths = parseTsConfigPaths('../../tsconfig.json')
    const tsconfigAppPaths = parseTsConfigPaths('../../tsconfig.app.json')

    expect(viteAliases).not.toHaveProperty('@primevue/core')
    expect(vitestAliases).not.toHaveProperty('@primevue/core')
    expect(tsconfigPaths['@primevue/core']).toBeUndefined()
    expect(tsconfigPaths['@primevue/core/*']).toBeUndefined()
    expect(tsconfigAppPaths['@primevue/core']).toBeUndefined()
    expect(tsconfigAppPaths['@primevue/core/*']).toBeUndefined()
  })
})
