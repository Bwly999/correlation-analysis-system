/**
 * 全局 vitest setup。
 *
 * httpClient 在模块加载时用相对 baseURL '/api'（来自 .env）固化到 axios 实例。
 * axios 1.16 的 fetch adapter 在 Node 21+ 下会用 new URL(path, baseURL) 解析请求，
 * 相对 baseURL 在 jsdom 环境会被判为 ERR_INVALID_URL，且这发生在调用 global.fetch
 * 之前——导致测试里 global.fetch = vi.fn() 的 mock 永远接不到请求。
 *
 * 这里在所有测试启动前把 baseURL 改成绝对地址，让 fetch adapter 能正常派发，
 * 测试里的 global.fetch mock 即可接管。
 */
import { httpClient } from '@/services/httpClient'

httpClient.defaults.baseURL = 'http://localhost/api'
