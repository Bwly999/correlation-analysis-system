import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startSseStream } from '../sseStream.js'

const createResponse = () => {
  const emitter = new EventEmitter()
  const headers = new Map<string, string>()
  let body = ''
  let ended = false
  const flushHeaders = vi.fn()

  return Object.assign(emitter, {
    statusCode: 200,
    writableEnded: false,
    flushHeaders,
    setHeader(name: string, value: string) {
      headers.set(name, value)
    },
    write(chunk: string) {
      body += chunk
      return true
    },
    end(chunk?: string) {
      if (chunk) {
        body += chunk
      }
      ended = true
      this.writableEnded = true
    },
    getBody() {
      return body
    },
    getHeader(name: string) {
      return headers.get(name)
    },
    isEnded() {
      return ended
    },
    flushHeadersSpy: flushHeaders,
  })
}

describe('startSseStream', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes sse events and cleans up when the response closes', () => {
    const response = createResponse()
    const unsubscribe = vi.fn()

    startSseStream(response as any, (write) => {
      write({ type: 'message', content: 'hello' })
      return unsubscribe
    })

    expect(response.getHeader('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(response.getHeader('Cache-Control')).toBe('no-cache, no-transform')
    expect(response.getBody()).toBe(
      'data: {"type":"stream.ready"}\n\ndata: {"type":"message","content":"hello"}\n\n',
    )

    response.emit('close')

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(response.isEnded()).toBe(true)
  })

  it('flushes headers immediately after the stream is set up', () => {
    const response = createResponse()

    startSseStream(response as any, () => vi.fn())

    expect(response.flushHeadersSpy).toHaveBeenCalledTimes(1)
  })

  it('writes a ready event immediately when the stream opens', () => {
    const response = createResponse()

    startSseStream(response as any, () => vi.fn())

    expect(response.getBody()).toBe('data: {"type":"stream.ready"}\n\n')
  })

  it('writes heartbeat events while the stream stays idle', () => {
    vi.useFakeTimers()
    const response = createResponse()

    startSseStream(response as any, () => vi.fn())

    vi.advanceTimersByTime(15000)

    expect(response.getBody()).toBe(
      'data: {"type":"stream.ready"}\n\ndata: {"type":"stream.heartbeat"}\n\n',
    )
  })

  it('emits lifecycle diagnostics when a logger is provided', () => {
    vi.useFakeTimers()
    const response = createResponse()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
      getLogFilePath: vi.fn(),
    }

    startSseStream(
      response as any,
      (write) => {
        write({ type: 'message', content: 'hello' })
        return vi.fn()
      },
      200,
      {
        logger: logger as any,
        streamLabel: 'js-transform-agent.events',
        streamContext: { sessionId: 'session_1', requestId: 'req_1' },
      },
    )

    vi.advanceTimersByTime(15000)
    response.emit('close')

    expect(logger.info).toHaveBeenCalledWith(
      'SSE 流已建立',
      expect.objectContaining({
        sessionId: 'session_1',
        requestId: 'req_1',
        streamLabel: 'js-transform-agent.events',
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'SSE 流已发送事件',
      expect.objectContaining({
        eventType: 'stream.ready',
        eventCount: 1,
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'SSE 流已发送事件',
      expect.objectContaining({
        eventType: 'message',
        eventCount: 2,
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'SSE 流已发送事件',
      expect.objectContaining({
        eventType: 'stream.heartbeat',
        eventCount: 3,
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'SSE 流连接关闭',
      expect.objectContaining({
        durationMs: 15000,
        eventCount: 3,
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'SSE 流已结束',
      expect.objectContaining({
        durationMs: 15000,
        eventCount: 3,
      }),
    )
  })
})
