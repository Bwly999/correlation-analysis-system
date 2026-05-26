import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  requestLassoAnalysis,
  requestLogisticRegressionClassificationAnalysis,
} from '../index'

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

describe('analysis service', () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestStreamMock.mockReset()
    vi.unstubAllGlobals()
    delete (globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__
  })

  it('surfaces a clear message when the shared client rejects before a response is returned', async () => {
    requestMock.mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      requestLassoAnalysis({
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      }),
    ).rejects.toThrow('分析服务请求失败，请确认本地 Node 开发服务与 Python 算法服务均已启动')
  })

  it('prefers plain text error responses when the backend does not return json', async () => {
    requestMock.mockResolvedValue({
      status: 500,
      data: '算法执行失败: 输入数据缺少目标字段',
    })

    await expect(
      requestLassoAnalysis({
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      }),
    ).rejects.toThrow('算法执行失败: 输入数据缺少目标字段')
  })

  it('prefers json detail error responses from the backend', async () => {
    requestMock.mockResolvedValue({
      status: 422,
      data: {
        detail: '算法服务返回了结构化错误',
      },
    })

    await expect(
      requestLassoAnalysis({
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      }),
    ).rejects.toThrow('算法服务返回了结构化错误')
  })

  it('falls back to a readable default message when the backend returns an empty error body', async () => {
    requestMock.mockResolvedValue({
      status: 500,
      data: '',
    })

    await expect(
      requestLassoAnalysis({
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      }),
    ).rejects.toThrow('后端服务响应异常')
  })

  it('calls the logistic regression classification endpoint with the common analysis request shape', async () => {
    requestMock.mockResolvedValue({
      status: 200,
      data: { results: { summary: { ok: true } } },
    })

    await requestLogisticRegressionClassificationAnalysis({
      data: [{ label: 'A', f1: 2 }],
      target: 'label',
      config: { factorNames: ['f1'] },
    })

    expect(requestMock).toHaveBeenCalledWith({
      url: '/analysis/logistic-regression-classification',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        data: [{ label: 'A', f1: 2 }],
        target: 'label',
        config: { factorNames: ['f1'] },
      },
    })
  })
})
