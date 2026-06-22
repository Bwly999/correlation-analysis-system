/**
 * 生产环境 Notebook COI（Cross-Origin Isolation）头注入。
 *
 * 与 vite.config.ts 的 `notebookCoiHeaders()`（apply: 'serve'）对位，
 * 覆盖生产侧 Fastify 静态服务（@fastify/static 托管 dist/）。
 *
 * COI 是 SharedArrayBuffer 的前提，进而决定 Pyodide 软中断（SAB）能否工作。
 * 详见 docs/design-doc/notebook-agent/部署与构建.md §3.3、安全模型.md §4.1。
 *
 * 头部策略（与 dev 对齐）：
 *   - 所有响应默认 `Cross-Origin-Resource-Policy: same-origin`
 *     （同源最严格；主站 /api 等加此头无害）
 *   - `/notebook.html`、`/notebook-iframe.html`、`/notebook`、`/notebook?*`
 *     以及 `/src/notebook/*`（生产构建产物里对应的 notebook chunk）
 *     → 额外加 `COOP: same-origin` + `COEP: require-corp`
 *   - `/pyodide/v0.27/*` → CORP 改为 `cross-origin`（允许 notebook 页面在
 *     require-corp 下加载）+ COEP: require-corp
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const PYODIDE_PREFIX = '/pyodide/v0.27/'

const isCoiPage = (pathname: string): boolean => {
  // 兼容 base 子路径部署（如 /workflow/notebook.html）：按路径后缀/包含判定，
  // 不依赖服务端是否感知 Vite base。默认 base='/' 时与原前缀判定等价。
  // pathname 已剥离 query（见 applyCoiHeaders），故不再匹配 '/notebook?'。
  return (
    pathname.endsWith('/notebook.html') ||
    pathname.endsWith('/notebook-iframe.html') ||
    pathname.endsWith('/notebook') ||
    pathname.includes('/notebook/') ||
    // 生产 chunk / source map 等
    pathname.includes('/src/notebook/') ||
    pathname.includes('/assets/notebook')
  )
}

const isPyodideAsset = (pathname: string): boolean => pathname.includes(PYODIDE_PREFIX)

export const applyCoiHeaders = (request: FastifyRequest, reply: FastifyReply): void => {
  // request.url 含 query string；用 pathname 做前缀判断
  const url = request.url
  const pathname = url.split('?')[0] ?? url

  if (isPyodideAsset(pathname)) {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp')
    return
  }

  // 默认 CORP=same-origin（不覆盖已设置的值，避免与 CORS 中间件冲突）
  if (!reply.hasHeader('Cross-Origin-Resource-Policy')) {
    reply.header('Cross-Origin-Resource-Policy', 'same-origin')
  }

  if (isCoiPage(pathname)) {
    reply.header('Cross-Origin-Opener-Policy', 'same-origin')
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp')
  }
}

/**
 * 注册 notebook COI 头 hook 到根实例。
 *
 * 直接 addHook 到传入的 app（不做封装），确保 onSend 覆盖**所有**路由与
 * 静态资源响应——包括先于此调用注册的路由（Fastify 根级 hook 全局生效）。
 *
 * 用 onSend：在响应最终发出前注入，能覆盖 preHandler 阶段设置的头。
 * API（/api/*）路径命中默认 CORP=same-origin 分支，无副作用。
 */
export const registerNotebookHeaders = async (app: FastifyInstance): Promise<void> => {
  app.addHook('onSend', async (request, reply, payload) => {
    applyCoiHeaders(request, reply)
    return payload
  })
}
