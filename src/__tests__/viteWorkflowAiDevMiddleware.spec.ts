// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

vi.mock('vite-plugin-monaco-editor', () => ({
  default: {
    default: () => ({
      name: 'mock-monaco-editor-plugin',
    }),
  },
}))

type MiddlewareHandler = (
  request: { url?: string },
  response: Record<string, never>,
  next: (error?: unknown) => void,
) => void

describe('workflow ai dev middleware', () => {
  it('loads the server handler through vite ssrLoadModule for api requests', async () => {
    const { default: viteConfig } = await import('../../vite.config.ts')
    const plugin = viteConfig.plugins?.find(
      (candidate) => candidate && typeof candidate === 'object' && 'name' in candidate && candidate.name === 'workflow-ai-dev-middleware',
    ) as { configureServer?: (server: any) => void } | undefined

    expect(plugin).toBeTruthy()
    expect(plugin).toHaveProperty('configureServer')

    let middleware: MiddlewareHandler | null = null
    const ssrLoadModule = vi.fn(async () => ({
      createServerHandler: () => vi.fn(async () => undefined),
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

    middleware!({ url: '/api/workflow-ai/model-profiles' }, {}, next)
    await Promise.resolve()
    await Promise.resolve()

    expect(ssrLoadModule).toHaveBeenCalledWith('/src/server/app.ts')
    expect(next).not.toHaveBeenCalled()
  })
})
