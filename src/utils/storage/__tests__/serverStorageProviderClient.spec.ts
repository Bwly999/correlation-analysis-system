import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerStorageProvider } from '../serverStorageProvider'

describe('ServerStorageProvider', () => {
  let provider: ServerStorageProvider

  beforeEach(() => {
    provider = new ServerStorageProvider()
    vi.unstubAllGlobals()
    delete (globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__
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
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
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

  it('should keep workflow identity headers browser-safe when the user name contains Chinese characters', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      new Request(new URL(String(input), 'http://localhost'), init)
      return Promise.resolve({
        ok: true,
        text: async () => '',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider.saveWorkflow({
      id: 'wf_chinese_user',
      name: '测试工作流',
      updatedAt: 1,
      nodes: [],
      edges: [],
    })).resolves.toBeUndefined()
  })

  it('should keep all server workflow storage endpoints compatible with browser Request headers', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      new Request(new URL(String(input), 'http://localhost'), init)
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify([]),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await provider.getCurrentUser()
    await provider.getWorkflows()
    await provider.getWorkflow('wf_1')
    await provider.saveWorkflow({ id: 'wf_1', name: '测试工作流', updatedAt: 1, nodes: [], edges: [] })
    await provider.deleteWorkflow('wf_1')
    await provider.getWorkflowVersions('wf_1')
    await provider.getWorkflowVersion('wf_1', 'ver_1')
    await provider.rollbackWorkflowVersion('wf_1', 'ver_1')
    await provider.saveHistory({
      id: 'run_1',
      workflowId: 'wf_1',
      workflowName: '测试工作流',
      startTime: 1,
      duration: 1,
      status: 'success',
      nodes: [],
      edges: [],
    })
    await provider.getAllHistory()
    await provider.clearAllHistory()

    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>
      expect(headers['x-workflow-user-name']).not.toBe('默认用户')
      expect(headers['x-workflow-user-name']).toBe(encodeURIComponent('默认用户'))
    }
  })

  it('should attach a bearer token when the auth resolver provides one', async () => {
    ;(globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__ =
      'jwt-from-host'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'server-user-1', name: '服务端用户' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await provider.getCurrentUser()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/storage\/me$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-from-host',
          'x-workflow-user-id': expect.any(String),
        }),
      }),
    )
  })

  it('should surface server-provided json error messages for storage requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: '服务端存储校验失败',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(provider.saveWorkflow({
      id: 'wf_1',
      name: '测试工作流',
      updatedAt: 1,
      nodes: [],
      edges: [],
    })).rejects.toThrow('服务端存储校验失败')
  })

  it('should fall back to a readable chinese message when the storage response is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', {
      status: 502,
      statusText: 'Bad Gateway',
    })))

    await expect(provider.getWorkflows()).rejects.toThrow('工作流存储请求失败，请稍后重试')
  })

  it('should load workflow versions, version detail and rollback through dedicated endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              id: 'ver_2',
              workflowId: 'wf_1',
              workflowName: '测试工作流',
              createdAt: 200,
              workflowUpdatedAt: 180,
              source: 'save',
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 'ver_2',
            workflowId: 'wf_1',
            workflowName: '测试工作流',
            createdAt: 200,
            workflowUpdatedAt: 180,
            source: 'save',
            workflow: {
              id: 'wf_1',
              name: '测试工作流',
              updatedAt: 180,
              nodes: [],
              edges: [],
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            workflow: {
              id: 'wf_1',
              name: '测试工作流',
              updatedAt: 220,
              nodes: [],
              edges: [],
            },
            version: {
              id: 'ver_3',
              workflowId: 'wf_1',
              workflowName: '测试工作流',
              createdAt: 220,
              workflowUpdatedAt: 220,
              source: 'rollback',
            },
          }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider.getWorkflowVersions('wf_1')).resolves.toEqual([
      expect.objectContaining({
        id: 'ver_2',
        workflowId: 'wf_1',
      }),
    ])
    await expect(provider.getWorkflowVersion('wf_1', 'ver_2')).resolves.toEqual(
      expect.objectContaining({
        id: 'ver_2',
        workflow: expect.objectContaining({
          id: 'wf_1',
        }),
      }),
    )
    await expect(provider.rollbackWorkflowVersion('wf_1', 'ver_2')).resolves.toEqual(
      expect.objectContaining({
        workflow: expect.objectContaining({
          id: 'wf_1',
        }),
        version: expect.objectContaining({
          id: 'ver_3',
          source: 'rollback',
        }),
      }),
    )

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/storage\/workflows\/wf_1\/versions$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/storage\/workflows\/wf_1\/versions\/ver_2$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/\/storage\/workflows\/wf_1\/versions\/ver_2\/rollback$/),
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
