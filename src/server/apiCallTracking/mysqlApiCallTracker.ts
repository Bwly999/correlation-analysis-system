/**
 * API 调用打点的 MySQL 实现。
 *
 * 与 workflow storage 共用 WORKFLOW_STORAGE_MYSQL_* 配置，但建独立连接池，
 * 避免打点的突发写入抢占业务池的连接配额。所有写操作 fire-and-forget：
 * 内部捕获异常并记服务端日志，绝不向上抛出。
 *
 * 参考实现：src/server/mysqlStorageRepository.ts（独立连接池 + drizzle 模式）。
 */

import { eq } from 'drizzle-orm'
import { apiCallLogsTable } from '../storageDb/mysql/schema.js'
import {
  createMysqlStorageDb,
  createMysqlStoragePool,
  readMysqlStorageConfigFromEnv,
  type MysqlStorageConfig,
  type MysqlStorageDb,
  type MysqlStoragePool,
} from '../storageDb/mysql/client.js'
import { createServerLogger } from '../logging/serverLogger.js'
import type { ApiCallStartRecord, ApiCallStatus, ApiCallTracker } from './apiCallTracker.js'

const logger = createServerLogger({ module: 'apiCallTracking' })

export class MysqlApiCallTracker implements ApiCallTracker {
  private readonly pool: MysqlStoragePool

  private readonly db: MysqlStorageDb

  constructor(config: MysqlStorageConfig = readMysqlStorageConfigFromEnv()) {
    this.pool = createMysqlStoragePool(config)
    this.db = createMysqlStorageDb(this.pool)
  }

  recordStart(record: ApiCallStartRecord): void {
    void this.db
      .insert(apiCallLogsTable)
      .values({
        requestId: record.requestId,
        userId: record.userId,
        method: record.method,
        route: record.route,
        fullPath: record.fullPath,
        paramsJson: record.paramsJson,
        status: 'streaming',
        statusCode: null,
        durationMs: null,
        startTimeMs: record.startTimeMs,
        clientIp: record.clientIp,
      })
      .catch((error) => {
        logger.error('记录 API 调用开始失败', { requestId: record.requestId, error })
      })
  }

  recordCompletion(
    requestId: string,
    statusCode: number,
    durationMs: number,
    status: ApiCallStatus,
  ): void {
    void this.db
      .update(apiCallLogsTable)
      .set({
        statusCode,
        durationMs,
        status,
      })
      .where(eq(apiCallLogsTable.requestId, requestId))
      .catch((error) => {
        logger.error('记录 API 调用完成失败', { requestId, error })
      })
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
