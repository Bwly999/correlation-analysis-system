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
  listNotebookSessions,
  renameNotebookSession,
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
})
