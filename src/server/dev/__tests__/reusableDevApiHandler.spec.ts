import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createReusableDevApiHandler } from '../reusableDevApiHandler.js'

const createRequest = (url = '/api/pi-agent/sessions') => ({
  url,
})

const createResponse = () => {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {})
}

describe('createReusableDevApiHandler', () => {
  it('reuses one app instance across multiple requests', async () => {
    const emit = vi.fn()
    const ready = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)
    const loadApp = vi.fn(async () => ({
      ready,
      close,
      server: { emit },
    }))

    const handler = createReusableDevApiHandler(loadApp)

    await handler.handle(createRequest('/api/pi-agent/sessions') as never, createResponse() as never)
    await handler.handle(createRequest('/api/pi-agent/sessions/test/events') as never, createResponse() as never)

    expect(loadApp).toHaveBeenCalledTimes(1)
    expect(ready).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(close).not.toHaveBeenCalled()
  })

  it('closes the cached app only when disposed', async () => {
    const close = vi.fn(async () => undefined)
    const loadApp = vi.fn(async () => ({
      ready: vi.fn(async () => undefined),
      close,
      server: { emit: vi.fn() },
    }))

    const handler = createReusableDevApiHandler(loadApp)

    await handler.handle(createRequest() as never, createResponse() as never)
    await handler.dispose()

    expect(close).toHaveBeenCalledTimes(1)
  })
})
