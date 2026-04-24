import { LocalStorageProvider } from './localStorageProvider'
import { ServerStorageProvider } from './serverStorageProvider'
import type { IStorageProvider } from './types'

/**
 * 存储驱动注册表
 * 后续可轻松扩展 S3, MinIO 等其他实现
 */
const providers: Record<string, new () => IStorageProvider> = {
  local: LocalStorageProvider,
  server: ServerStorageProvider,
}

/**
 * 根据环境变量选择存储策略
 * 测试环境固定走 local，避免单测被开发态 server 配置污染
 * 其他环境优先级: VITE_STORAGE_TYPE > 'local'
 */
const storageType = import.meta.env.MODE === 'test'
  ? 'local'
  : import.meta.env.VITE_STORAGE_TYPE || 'local'
const ProviderClass = providers[storageType] || LocalStorageProvider

/**
 * 导出全局存储提供者实例
 */
export const storageProvider: IStorageProvider = new ProviderClass()

console.log(`[Storage] Initialized with strategy: ${storageType}`)

// 重新导出所有核心类型
export * from './types'
