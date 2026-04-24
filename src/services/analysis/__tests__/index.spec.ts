import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  requestLassoAnalysis,
  requestLogisticRegressionClassificationAnalysis,
} from '../index'

describe('analysis service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces a clear message when fetch rejects before a response is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(
      requestLassoAnalysis({
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      }),
    ).rejects.toThrow('分析服务请求失败，请确认本地 Node 开发服务与 Python 算法服务均已启动')
  })

  it('prefers plain text error responses when the backend does not return json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => '算法执行失败: 输入数据缺少目标字段',
      }),
    )

    await expect(
      requestLassoAnalysis({
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      }),
    ).rejects.toThrow('算法执行失败: 输入数据缺少目标字段')
  })

  it('calls the logistic regression classification endpoint with the common analysis request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: { summary: { ok: true } } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await requestLogisticRegressionClassificationAnalysis({
      data: [{ label: 'A', f1: 2 }],
      target: 'label',
      config: { factorNames: ['f1'] },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/analysis/logistic-regression-classification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{ label: 'A', f1: 2 }],
        target: 'label',
        config: { factorNames: ['f1'] },
      }),
    })
  })
})
