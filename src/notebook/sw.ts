/**
 * Notebook Service Worker。
 *
 * 职责（极简）：缓存 Pyodide 自托管运行时（~100MB），让笔记本第二次进入时
 * 热启动 ≤5s（验收与基线.md §2.1 Gate 17）。
 *
 * 范围（决策见 部署与构建.md §5.1）：
 *   - scope：与 notebook.html 同级（注册时指定）
 *   - 仅缓存 `/pyodide/v0.27/*` 资源
 *   - 不接管 /api/、/index.html、主站任何资源（fetch 事件直接 return）
 *
 * 缓存策略：cache-first（Pyodide 版本锁定，资源不可变）。
 * 版本升级通过换路径前缀（v0.27 → v0.28）+ CACHE_NAME 变更 + activate 清旧缓存完成。
 */

/// <reference lib="webworker" />

const CACHE_NAME = 'pyodide-v0.27.x'
const PYODIDE_URL_PATTERN = /\/pyodide\/v0\.27\//

declare const self: ServiceWorkerGlobalScope

self.addEventListener('install', () => {
  // 新 SW 立即生效，不等旧 SW 退出
  void self.skipWaiting()
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      // 清理非当前版本的 pyodide-* 缓存
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n.startsWith('pyodide-'))
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  // 只接管 pyodide 资源；其他请求（页面、API、主站 chunk）一律放行
  if (!PYODIDE_URL_PATTERN.test(url.pathname)) return
  // 只缓存 GET（wheel 范围请求等也走 GET；其他方法不缓存）
  if (event.request.method !== 'GET') return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(event.request)
      if (cached) return cached

      const response = await fetch(event.request)
      // 只缓存成功响应（避免把 4xx/5xx 错误页缓存下来）
      if (response.ok && response.type === 'basic') {
        cache.put(event.request, response.clone())
      }
      return response
    })(),
  )
})
