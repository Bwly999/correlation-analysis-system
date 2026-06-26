/**
 * API 调用打点追踪器。
 *
 * 由 Fastify 根级 hook（preHandler + onResponse）在每次 /api/* 请求时调用，
 * 将调用数据写入 MySQL。所有方法均为 fire-and-forget：内部捕获异常并记录日志，
 * 绝不向调用方抛出，确保打点不影响业务请求。
 *
 * 详见 docs/design-doc（本需求）与 src/server/http/apiCallTrackingPlugin.ts。
 */

import { MysqlApiCallTracker } from './mysqlApiCallTracker.js'

export type ApiCallStatus = 'streaming' | 'ok' | 'error'

export interface ApiCallStartRecord {
  requestId: string
  userId: string | null
  method: string
  route: string
  fullPath: string
  paramsJson: Record<string, unknown> | null
  startTimeMs: number
  clientIp: string | null
}

export interface ApiCallTracker {
  recordStart(record: ApiCallStartRecord): void
  recordCompletion(
    requestId: string,
    statusCode: number,
    durationMs: number,
    status: ApiCallStatus,
  ): void
  close(): Promise<void>
}

/** no-op 实现：开关关闭或 MySQL 不可用时使用，所有方法空操作。 */
export const noopApiCallTracker: ApiCallTracker = {
  recordStart: () => undefined,
  recordCompletion: () => undefined,
  close: async () => undefined,
}

const resolveTrackingEnabledFromEnv = (): boolean => {
  const raw = process.env.WORKFLOW_API_TRACKING_ENABLED?.trim().toLowerCase()
  if (raw === '' || raw === undefined) return true
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export interface CreateApiCallTrackerOptions {
  enabled?: boolean
  createMysqlTracker?: () => ApiCallTracker
}

/**
 * 根据环境变量 WORKFLOW_API_TRACKING_ENABLED（默认 true）决定返回 no-op 还是
 * MySQL 实现。MySQL 实现通过惰性 import 创建，避免 no-op 路径触发连接池构造。
 *
 * MySQL 不可用时（如本地开发默认 lowdb 后端）返回 no-op，打点静默关闭。
 */
export const createApiCallTracker = (options: CreateApiCallTrackerOptions = {}): ApiCallTracker => {
  const enabled = options.enabled ?? resolveTrackingEnabledFromEnv()
  if (!enabled) {
    return noopApiCallTracker
  }

  const createMysqlTracker = options.createMysqlTracker ?? (() => new MysqlApiCallTracker())

  try {
    return createMysqlTracker()
  } catch (error) {
    // MySQL 连接池构造失败时降级为 no-op，绝不阻断服务启动。
    // 注：createMysqlStoragePool 只创建池对象（惰性，不实际连库），
    // 真正的连接失败发生在首次写入，由 recordStart/recordCompletion 的 .catch 吞掉。
    console.warn('[apiCallTracking] 初始化失败，打点降级为 no-op：', error)
    return noopApiCallTracker
  }
}
