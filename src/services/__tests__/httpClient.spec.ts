import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('httpClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    delete (globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__
  })

  it('uses VITE_API_BASE_URL and injects workflow headers through the shared axios interceptor', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/custom-api')
    vi.stubEnv('VITE_WORKFLOW_USER_ID', 'user_http')
    vi.stubEnv('VITE_WORKFLOW_USER_NAME', '统一请求用户')
    ;(globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__ =
      'jwt-from-host'

    const { httpClient, resolveApiBaseUrl } = await import('../httpClient')
    let capturedConfig: {
      baseURL?: string
      headers?: { toJSON?: () => Record<string, string> } | Record<string, string>
    } | undefined

    await httpClient.request({
      url: '/pi-agent/debug/health',
      method: 'GET',
      adapter: async (config) => {
        capturedConfig = config as NonNullable<typeof capturedConfig>
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      },
    })

    const headers =
      (capturedConfig?.headers as { toJSON?: () => Record<string, string> } | undefined)?.toJSON?.()
      ?? (capturedConfig?.headers as Record<string, string> | undefined)

    expect(resolveApiBaseUrl()).toBe('https://api.example.com/custom-api')
    expect(httpClient.defaults.baseURL).toBe('https://api.example.com/custom-api')
    expect(capturedConfig?.baseURL).toBe('https://api.example.com/custom-api')
    expect(headers).toMatchObject({
      Authorization: 'Bearer jwt-from-host',
      'x-workflow-user-id': 'user_http',
      'x-workflow-user-name': encodeURIComponent('统一请求用户'),
    })
  })

  it('falls back to /api when VITE_API_BASE_URL is not configured', async () => {
    const { httpClient, resolveApiBaseUrl } = await import('../httpClient')

    expect(resolveApiBaseUrl()).toBe('/api')
    expect(httpClient.defaults.baseURL).toBe('/api')
  })
})
