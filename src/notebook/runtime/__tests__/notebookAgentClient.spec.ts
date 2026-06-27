import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import {
  checkWorkspaceSnapshot,
  downloadWorkspaceSnapshot,
  listNotebookSessions,
  renameNotebookSession,
  uploadWorkspaceSnapshot,
} from '../notebookAgentClient'

describe('notebookAgentClient', () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestStreamMock.mockReset()
  })

  it('读取最近会话列表', async () => {
    requestMock.mockResolvedValueOnce({
      status: 200,
      data: {
        sessions: [
          {
            sessionId: 'sess-1',
            title: '销量分析',
            updatedAt: 1,
            messageCount: 2,
          },
        ],
      },
    })

    const result = await listNotebookSessions()
    expect(result.sessions[0]?.title).toBe('销量分析')
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/notebook-agent/sessions',
        method: 'GET',
      }),
    )
  })

  it('更新会话标题', async () => {
    requestMock.mockResolvedValueOnce({
      status: 200,
      data: { ok: true },
    })

    const result = await renameNotebookSession('sess-1', '销量分析')
    expect(result.ok).toBe(true)
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/notebook-agent/sessions/sess-1/title',
        method: 'POST',
        data: { title: '销量分析' },
      }),
    )
  })

  it('workspace 快照 HEAD 超时后返回 false，并透传 abort signal', async () => {
    vi.useFakeTimers()
    try {
      let receivedSignal: AbortSignal | undefined
      requestMock.mockImplementationOnce((config: { signal?: AbortSignal }) => {
        receivedSignal = config.signal
        return new Promise((_resolve, reject) => {
          config.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })

      const pending = checkWorkspaceSnapshot('sess-timeout')
      const assertion = expect(pending).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(5_000)

      await assertion
      expect(receivedSignal).toBeInstanceOf(AbortSignal)
      expect(receivedSignal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('workspace 快照 GET 超时后返回 null', async () => {
    vi.useFakeTimers()
    try {
      requestMock.mockImplementationOnce((config: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          config.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
      )

      const pending = downloadWorkspaceSnapshot('sess-timeout')
      const assertion = expect(pending).resolves.toBeNull()
      await vi.advanceTimersByTimeAsync(5_000)

      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('workspace 快照 PUT 超时后返回 false', async () => {
    vi.useFakeTimers()
    try {
      requestMock.mockImplementationOnce((config: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          config.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
      )

      const pending = uploadWorkspaceSnapshot('sess-timeout', new Uint8Array([1, 2, 3]))
      const assertion = expect(pending).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(5_000)

      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
