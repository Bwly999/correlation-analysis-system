import type { ServerResponse } from 'node:http'
import type { ServerLogContext, ServerLogger } from '../logging/serverLogger.js'

const DEFAULT_SSE_HEARTBEAT_MS = 15_000

interface SseStreamOptions {
  logger?: ServerLogger
  streamLabel?: string
  streamContext?: ServerLogContext & {
    streamLabel?: string
    eventCount?: number
    eventType?: string
    durationMs?: number
    statusCode?: number
    writableEnded?: boolean
    destroyed?: boolean
    heartbeatIntervalMs?: number
  }
  heartbeatIntervalMs?: number
}

export const writeSseEvent = (response: ServerResponse, event: unknown) => {
  try {
    // 单行 data 安全性的关键依赖：JSON.stringify 会把字符串值内的真实换行
    // 转义为字面量 \n，故序列化结果不含真实换行，不会破坏 SSE 帧边界。
    // 若改为手拼字符串（不经 JSON.stringify），必须自行拆分为多行 data。
    response.write(`data: ${JSON.stringify(event)}\n\n`)
  } catch (err) {
    console.error('[sse] write error:', err)
  }
}

export const startSseStream = (
  response: ServerResponse,
  subscribe: (write: (event: unknown) => void) => (() => void) | null | undefined,
  statusCode = 200,
  options: SseStreamOptions = {},
) => {
  const startTime = Date.now()
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_SSE_HEARTBEAT_MS
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('X-Accel-Buffering', 'no')
  response.setHeader('Access-Control-Allow-Origin', '*')

  console.log(`[sse] stream starting at ${new Date().toISOString()}`)

  const logContextBase = {
    ...options.streamContext,
    streamLabel: options.streamLabel ?? options.streamContext?.streamLabel ?? 'sse',
    statusCode,
    heartbeatIntervalMs,
  }
  let eventCount = 0
  const logEvent = (eventType: string) => {
    eventCount += 1
    options.logger?.info('SSE 流已发送事件', {
      ...logContextBase,
      eventType,
      eventCount,
    })
  }

  let cleanedUp = false
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  response.flushHeaders?.()
  writeSseEvent(response, { type: 'stream.ready' })
  logEvent('stream.ready')
  options.logger?.info('SSE 流已建立', logContextBase)

  const unsubscribe = subscribe((event) => {
    writeSseEvent(response, event)
    const eventType =
      typeof event === 'object' && event && 'type' in event && typeof event.type === 'string'
        ? event.type
        : 'unknown'
    logEvent(eventType)
  })

  heartbeatTimer = setInterval(() => {
    if (response.writableEnded || response.destroyed) {
      return
    }
    writeSseEvent(response, { type: 'stream.heartbeat' })
    logEvent('stream.heartbeat')
  }, heartbeatIntervalMs)

  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    const duration = Date.now() - startTime
    console.log(`[sse] stream ended after ${duration}ms, writableEnded=${response.writableEnded}, destroyed=${response.destroyed}`)
    options.logger?.info('SSE 流已结束', {
      ...logContextBase,
      durationMs: duration,
      eventCount,
      writableEnded: response.writableEnded,
      destroyed: response.destroyed,
    })
    unsubscribe?.()
    if (!response.writableEnded && !response.destroyed) {
      response.end()
    }
  }

  if (!unsubscribe) {
    cleanup()
    return cleanup
  }

  response.once('close', () => {
    console.log(`[sse] connection closed after ${Date.now() - startTime}ms`)
    options.logger?.info('SSE 流连接关闭', {
      ...logContextBase,
      durationMs: Date.now() - startTime,
      eventCount,
      writableEnded: response.writableEnded,
      destroyed: response.destroyed,
    })
    cleanup()
  })
  response.once('error', (err) => {
    console.error(`[sse] connection error after ${Date.now() - startTime}ms:`, err.message)
    options.logger?.error('SSE 流连接异常', {
      ...logContextBase,
      durationMs: Date.now() - startTime,
      eventCount,
      writableEnded: response.writableEnded,
      destroyed: response.destroyed,
      error: err,
    })
    cleanup()
  })
  return cleanup
}
