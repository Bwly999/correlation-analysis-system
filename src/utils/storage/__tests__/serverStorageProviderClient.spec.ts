import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerStorageProvider } from '../serverStorageProvider'

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

describe('ServerStorageProvider', () => {
  let provider: ServerStorageProvider

  beforeEach(() => {
    provider = new ServerStorageProvider()
    requestMock.mockReset()
    requestStreamMock.mockReset()
    vi.unstubAllGlobals()
    delete (globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__
  })

  it('should load current user from the server storage endpoint', async () => {
    requestMock.mockResolvedValue({
      status: 200,
      data: { id: 'server-user-1', name: '服务端用户' },
    })

    await expect(provider.getCurrentUser()).resolves.toEqual({
      id: 'server-user-1',
      name: '服务端用户',
    })
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/storage/me',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('should save workflows through the scoped storage endpoint', async () => {
    requestMock.mockResolvedValue({
      status: 200,
      data: '',
    })

    await provider.saveWorkflow({
      id: 'wf_1',
      name: '测试工作流',
      updatedAt: 1,
      nodes: [],
      edges: [],
    })

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/storage/workflows',
        method: 'POST',
      }),
    )
  })

  it('should keep all server workflow storage endpoints on relative paths so the shared client can apply baseURL once', async () => {
    requestMock.mockResolvedValue({
      status: 200,
      data: [],
    })

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
    await provider.getHistorySummaries()
    await provider.getHistoryRecord('run_1')
    await provider.clearAllHistory()

    const requestedUrls = requestMock.mock.calls.map(([config]) => config.url)
    expect(requestedUrls).toEqual([
      '/storage/me',
      '/storage/workflows',
      '/storage/workflows/wf_1',
      '/storage/workflows',
      '/storage/workflows/wf_1',
      '/storage/workflows/wf_1/versions',
      '/storage/workflows/wf_1/versions/ver_1',
      '/storage/workflows/wf_1/versions/ver_1/rollback',
      '/storage/history',
      '/storage/history/summaries',
      '/storage/history/run_1',
      '/storage/history',
    ])
  })

  it('should load history summaries and a single history record through dedicated endpoints', async () => {
    requestMock
      .mockResolvedValueOnce({
        status: 200,
        data: [
          {
            id: 'run_1',
            workflowId: 'wf_1',
            workflowName: '测试工作流',
            startTime: 1,
            duration: 2,
            status: 'success',
          },
        ],
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          id: 'run_1',
          workflowId: 'wf_1',
          workflowName: '测试工作流',
          startTime: 1,
          duration: 2,
          status: 'success',
          nodes: [],
          edges: [],
        },
      })

    await expect(provider.getHistorySummaries()).resolves.toEqual([
      {
        id: 'run_1',
        workflowId: 'wf_1',
        workflowName: '测试工作流',
        startTime: 1,
        duration: 2,
        status: 'success',
      },
    ])
    await expect(provider.getHistoryRecord('run_1')).resolves.toEqual({
      id: 'run_1',
      workflowId: 'wf_1',
      workflowName: '测试工作流',
      startTime: 1,
      duration: 2,
      status: 'success',
      nodes: [],
      edges: [],
      })

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: '/storage/history/summaries',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: '/storage/history/run_1',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('should surface server-provided json error messages for storage requests', async () => {
    requestMock.mockResolvedValue({
      status: 400,
      data: {
        detail: '服务端存储校验失败',
      },
    })

    await expect(provider.saveWorkflow({
      id: 'wf_1',
      name: '测试工作流',
      updatedAt: 1,
      nodes: [],
      edges: [],
    })).rejects.toThrow('服务端存储校验失败')
  })

  it('should fall back to a readable chinese message when the storage response is empty', async () => {
    requestMock.mockResolvedValue({
      status: 502,
      data: '',
    })

    await expect(provider.getWorkflows()).rejects.toThrow('工作流存储请求失败，请稍后重试')
  })

  it('should load workflow versions, version detail and rollback through dedicated endpoints', async () => {
    requestMock
      .mockResolvedValueOnce({
        status: 200,
        data: [
          {
            id: 'ver_2',
            workflowId: 'wf_1',
            workflowName: '测试工作流',
            createdAt: 200,
            workflowUpdatedAt: 180,
            source: 'save',
          },
        ],
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
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
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
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
        },
      })

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

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: '/storage/workflows/wf_1/versions',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: '/storage/workflows/wf_1/versions/ver_2',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        url: '/storage/workflows/wf_1/versions/ver_2/rollback',
        method: 'POST',
      }),
    )
  })
})
