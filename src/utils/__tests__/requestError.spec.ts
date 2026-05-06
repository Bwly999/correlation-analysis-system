import { describe, expect, it } from 'vitest'

import {
  RequestError,
  buildRequestErrorFromResponse,
  getErrorMessage,
} from '../requestError'

describe('requestError utilities', () => {
  it('prefers detail from json payloads', async () => {
    const response = new Response(JSON.stringify({ detail: '后端返回的详细错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

    const error = await buildRequestErrorFromResponse(response, {
      fallbackMessage: '默认错误',
    })

    expect(error).toBeInstanceOf(RequestError)
    expect(error.message).toBe('后端返回的详细错误')
    expect(error.statusCode).toBe(400)
  })

  it('falls back to plain text when json parsing is not available', async () => {
    const response = new Response('纯文本错误', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })

    const error = await buildRequestErrorFromResponse(response, {
      fallbackMessage: '默认错误',
    })

    expect(error.message).toBe('纯文本错误')
  })

  it('falls back to the provided fallback message when the response body is empty', async () => {
    const response = new Response('', {
      status: 502,
      statusText: 'Bad Gateway',
    })

    const error = await buildRequestErrorFromResponse(response, {
      fallbackMessage: '统一兜底文案',
    })

    expect(error.message).toBe('统一兜底文案')
  })

  it('extracts the message from Error instances and otherwise uses the fallback', () => {
    expect(getErrorMessage(new Error('显式错误'), '兜底文案')).toBe('显式错误')
    expect(getErrorMessage('unexpected', '兜底文案')).toBe('兜底文案')
  })
})
