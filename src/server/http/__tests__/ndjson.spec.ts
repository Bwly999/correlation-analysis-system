import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { startNdjsonStream } from '../ndjson.js'

const createResponse = () => {
  const emitter = new EventEmitter()
  const headers = new Map<string, string>()
  let body = ''
  let ended = false

  return Object.assign(emitter, {
    statusCode: 200,
    writableEnded: false,
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
  })
}

describe('startNdjsonStream', () => {
  it('writes ndjson events and cleans up when the response closes', () => {
    const response = createResponse()
    const unsubscribe = vi.fn()

    startNdjsonStream(response as any, (write) => {
      write({ type: 'message', content: 'hello' })
      return unsubscribe
    })

    expect(response.getHeader('Content-Type')).toBe('application/x-ndjson; charset=utf-8')
    expect(response.getHeader('Cache-Control')).toBe('no-cache, no-transform')
    expect(response.getBody()).toBe('{"type":"message","content":"hello"}\n')

    response.emit('close')

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(response.isEnded()).toBe(true)
  })
})
