// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  disposeAllPiAgentSessionsMock,
  disposeAllJsTransformAgentSessionsMock,
} = vi.hoisted(() => ({
  disposeAllPiAgentSessionsMock: vi.fn(),
  disposeAllJsTransformAgentSessionsMock: vi.fn(),
}))

vi.mock('../piAgent/gateway.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../piAgent/gateway.js')>()
  return {
    ...actual,
    disposeAllPiAgentSessions: disposeAllPiAgentSessionsMock,
  }
})

vi.mock('../piAgent/jsTransformAgentGateway.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../piAgent/jsTransformAgentGateway.js')>()
  return {
    ...actual,
    disposeAllJsTransformAgentSessions: disposeAllJsTransformAgentSessionsMock,
  }
})

import { createServerApp } from '../app.js'

describe('server app lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    disposeAllPiAgentSessionsMock.mockReset()
    disposeAllJsTransformAgentSessionsMock.mockReset()
  })

  it('disposes all agent sessions when the Fastify app closes', async () => {
    const app = createServerApp({
      defaultStorageUser: {
        id: 'lifecycle-user',
        name: '生命周期测试用户',
      },
    })

    await app.close()

    expect(disposeAllPiAgentSessionsMock).toHaveBeenCalledTimes(1)
    expect(disposeAllJsTransformAgentSessionsMock).toHaveBeenCalledTimes(1)
  })
})
