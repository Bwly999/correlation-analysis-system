import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamPiAgentEvents } from '../piAgentClient'

const { requestMock, requestStreamMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  requestStreamMock: vi.fn(),
}))

vi.mock('@/services/httpClient', () => ({
  httpClient: {
    request: requestMock,
  },
  requestStream: requestStreamMock,
}))

describe('piAgentClient streams', () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestStreamMock.mockReset()
  })

  it('parses NDJSON events through the unified stream request helper', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"message","content":"第一条"}\n'))
        controller.enqueue(new TextEncoder().encode('{"type":"done","content":"第二条"}\n'))
        controller.close()
      },
    })
    const events: Array<Record<string, unknown>> = []

    requestStreamMock.mockResolvedValue({
      status: 200,
      data: stream,
      headers: {},
    })

    await streamPiAgentEvents('pi_session_1', {
      onEvent: (event) => events.push(event as Record<string, unknown>),
    })

    expect(requestStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/pi-agent/sessions/pi_session_1/events',
      }),
    )
    expect(events).toEqual([
      { type: 'message', content: '第一条' },
      { type: 'done', content: '第二条' },
    ])
  })

  it('passes through an abort signal for stream cancellation', async () => {
    const controller = new AbortController()
    requestStreamMock.mockResolvedValue({
      status: 200,
      data: new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.close()
        },
      }),
      headers: {},
    })

    await streamPiAgentEvents('pi_session_1', {
      signal: controller.signal,
    })

    expect(requestStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    )
  })
})
