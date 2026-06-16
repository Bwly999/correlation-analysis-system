// @vitest-environment node

/**
 * notebookHeadersPlugin 单测。
 *
 * 验证生产 COI 头注入逻辑（与 vite.config.ts 的 notebookCoiHeaders dev 中间件对位）：
 *   - /notebook.html / /notebook / /src/notebook/* / /assets/notebook* → COOP + COEP
 *   - /pyodide/v0.27/* → CORP=cross-origin + COEP
 *   - 其他响应 → CORP=same-origin（默认）
 *   - query string 不影响前缀判断
 */

import { describe, it, expect } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { registerNotebookHeaders } from '../notebookHeadersPlugin.js'

const buildApp = async () => {
  const app: FastifyInstance = Fastify({ logger: false })
  // 根级 addHook 全局生效，与路由注册顺序无关；先挂再注路由符合 app.ts 实际用法
  await registerNotebookHeaders(app)
  app.get('/*', async (_req, reply) => {
    reply.header('Content-Type', 'text/plain')
    return 'ok'
  })
  await app.ready()
  return app
}

const headersOf = async (app: FastifyInstance, url: string) => {
  const res = await app.inject({ method: 'GET', url })
  return res.headers
}

describe('registerNotebookHeaders', () => {
  it('/notebook.html 注入 COOP + COEP', async () => {
    const app = await buildApp()
    const h = await headersOf(app, '/notebook.html')
    expect(h['cross-origin-opener-policy']).toBe('same-origin')
    expect(h['cross-origin-embedder-policy']).toBe('require-corp')
    expect(h['cross-origin-resource-policy']).toBe('same-origin')
    await app.close()
  })

  it('/notebook?session=x 带 query 仍命中 COI 页面', async () => {
    const app = await buildApp()
    const h = await headersOf(app, '/notebook?session=abc')
    expect(h['cross-origin-opener-policy']).toBe('same-origin')
    expect(h['cross-origin-embedder-policy']).toBe('require-corp')
    await app.close()
  })

  it('/src/notebook/worker/worker.ts 注入 COOP + COEP', async () => {
    const app = await buildApp()
    const h = await headersOf(app, '/src/notebook/worker/worker.ts')
    expect(h['cross-origin-opener-policy']).toBe('same-origin')
    expect(h['cross-origin-embedder-policy']).toBe('require-corp')
    await app.close()
  })

  it('/assets/notebook-vendor.js 命中 COI 页面（生产 chunk）', async () => {
    const app = await buildApp()
    const h = await headersOf(app, '/assets/notebook-vendor-abc.js')
    expect(h['cross-origin-opener-policy']).toBe('same-origin')
    expect(h['cross-origin-embedder-policy']).toBe('require-corp')
    await app.close()
  })

  it('/pyodide/v0.27/pyodide.asm.wasm 注入 CORP=cross-origin + COEP', async () => {
    const app = await buildApp()
    const h = await headersOf(app, '/pyodide/v0.27/pyodide.asm.wasm')
    expect(h['cross-origin-resource-policy']).toBe('cross-origin')
    expect(h['cross-origin-embedder-policy']).toBe('require-corp')
    // pyodide 资源不设 COOP（COOP 是顶层文档导航策略）
    expect(h['cross-origin-opener-policy']).toBeUndefined()
    await app.close()
  })

  it('/api/workflows 默认 CORP=same-origin，无 COOP/COEP', async () => {
    const app = await buildApp()
    const h = await headersOf(app, '/api/workflows')
    expect(h['cross-origin-resource-policy']).toBe('same-origin')
    expect(h['cross-origin-opener-policy']).toBeUndefined()
    expect(h['cross-origin-embedder-policy']).toBeUndefined()
    await app.close()
  })

  it('/ （主站）默认 CORP=same-origin', async () => {
    const app = await buildApp()
    const h = await headersOf(app, '/')
    expect(h['cross-origin-resource-policy']).toBe('same-origin')
    expect(h['cross-origin-opener-policy']).toBeUndefined()
    await app.close()
  })
})
