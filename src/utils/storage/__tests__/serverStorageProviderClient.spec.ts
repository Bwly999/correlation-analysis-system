import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerStorageProvider } from '../serverStorageProvider'

describe('ServerStorageProvider', () => {
  let provider: ServerStorageProvider

  beforeEach(() => {
    provider = new ServerStorageProvider()
    vi.unstubAllGlobals()
  })

  it('should load current user from the server storage endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'server-user-1', name: '服务端用户' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider.getCurrentUser()).resolves.toEqual({
      id: 'server-user-1',
      name: '服务端用户',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/storage\/me$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('should save workflows through the scoped storage endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)

    await provider.saveWorkflow({
      id: 'wf_1',
      name: '测试工作流',
      updatedAt: 1,
      nodes: [],
      edges: [],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/storage\/workflows$/),
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
