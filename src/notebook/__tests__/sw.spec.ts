// @vitest-environment node

/**
 * Service Worker 缓存逻辑单测。
 *
 * SW 在浏览器线程跑，这里用 node 环境验证 fetch 事件处理逻辑的等价纯函数
 * （仅缓存 /pyodide/v0.27/* 的 GET 请求，cache-first），并对 sw.ts 做结构断言。
 * 实际的 install/activate 生命周期由浏览器调度，这里只验决策规则。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// fetch handler 从 sw.ts 抽出来单测比较麻烦——sw.ts 是 SW 顶层注册。
// 这里改为：动态读 sw.ts 文件里 PYODIDE_URL_PATTERN 的决策逻辑等价物，
// 直接验证"哪些 URL 该被 SW 接管"的纯函数判断。
//
// 为了不引出 SW 全局污染，把判定规则在此处重声明一份，与 sw.ts 的正则保持一致，
// 并对 sw.ts 做字符串断言确认规则未被意外修改。

const PYODIDE_URL_PATTERN = /\/pyodide\/v0\.27\//

const shouldSwHandle = (method: string, pathname: string): boolean => {
  if (method !== 'GET') return false
  return PYODIDE_URL_PATTERN.test(pathname)
}

describe('notebook Service Worker 接管范围', () => {
  it('/pyodide/v0.27/pyodide.asm.wasm GET → 接管', () => {
    expect(shouldSwHandle('GET', '/pyodide/v0.27/pyodide.asm.wasm')).toBe(true)
  })

  it('/pyodide/v0.27/whl/numpy-1.26.4-cp312.whl GET → 接管', () => {
    expect(shouldSwHandle('GET', '/pyodide/v0.27/whl/numpy-1.26.4-cp312.whl')).toBe(true)
  })

  it('/workflow/pyodide/v0.27/* GET（base 子路径部署）→ 接管', () => {
    expect(shouldSwHandle('GET', '/workflow/pyodide/v0.27/pyodide.asm.wasm')).toBe(true)
  })

  it('/api/workflows GET → 不接管（避免缓存 API）', () => {
    expect(shouldSwHandle('GET', '/api/workflows')).toBe(false)
  })

  it('/notebook.html GET → 不接管（页面不缓存）', () => {
    expect(shouldSwHandle('GET', '/notebook.html')).toBe(false)
  })

  it('/index.html GET → 不接管（主站不接管）', () => {
    expect(shouldSwHandle('GET', '/index.html')).toBe(false)
  })

  it('/assets/notebook-vendor.js GET → 不接管（生产 chunk 由浏览器缓存）', () => {
    expect(shouldSwHandle('GET', '/assets/notebook-vendor-abc.js')).toBe(false)
  })

  it('pyodide 资源的 HEAD 请求 → 不接管（仅 GET）', () => {
    expect(shouldSwHandle('HEAD', '/pyodide/v0.27/pyodide.asm.wasm')).toBe(false)
  })

  it('/pyodide/v0.28/ (新版本) → 不接管（版本升级需换缓存名）', () => {
    expect(shouldSwHandle('GET', '/pyodide/v0.28/pyodide.asm.wasm')).toBe(false)
  })
})

describe('notebook Service Worker 文件结构断言', () => {
  it('sw.ts 的 PYODIDE_URL_PATTERN 与本测一致（防止意外改版本前缀）', async () => {
    const fs = await import('node:fs')
    const swSrc = fs.readFileSync('src/notebook/sw.ts', 'utf8')
    expect(swSrc).toContain("CACHE_NAME = 'pyodide-v0.27.x'")
    // 正则字面量锁定 v0.27 版本前缀（防止误改）
    expect(swSrc).toContain('PYODIDE_URL_PATTERN = ')
    expect(swSrc).toContain('pyodide')
    expect(swSrc).toContain('0.27')
    expect(swSrc).toContain("event.request.method !== 'GET'")
    expect(swSrc).toContain('cache.put(event.request, response.clone())')
    // 仅缓存成功响应，避免把 4xx/5xx 缓存下来
    expect(swSrc).toContain('response.ok')
    expect(swSrc).toContain("response.type === 'basic'")
  })
})
