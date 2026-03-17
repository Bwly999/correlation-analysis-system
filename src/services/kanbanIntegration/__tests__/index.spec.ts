import { beforeEach, describe, expect, it } from 'vitest'

import {
  fetchKanbanData,
  getKanbanAuthToken,
  initializeKanbanHostBridge,
  registerKanbanDataBridge,
  setKanbanAuthToken,
} from '../index'

describe('kanban integration bridge', () => {
  beforeEach(() => {
    setKanbanAuthToken('')
    registerKanbanDataBridge({
      async fetchKanbanData(params) {
        return {
          rows: [{ sn: 'SN001', factorCount: params.factorKeys.length }],
          metadata: { from: 'test' },
        }
      },
    })
  })

  it('stores token from host message events', () => {
    initializeKanbanHostBridge(window)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'KANBAN_HOST_AUTH_TOKEN',
          token: 'host-token-001',
        },
      }),
    )

    expect(getKanbanAuthToken()).toBe('host-token-001')
  })

  it('fetches data through the registered bridge with token validation', async () => {
    setKanbanAuthToken('host-token-002')

    const result = await fetchKanbanData({
      token: getKanbanAuthToken(),
      productName: '试制产品 A1',
      fetchMode: 'sn',
      factorKeys: ['F_TEMP', 'F_PRESS'],
      processList: ['涂布'],
      snList: ['SN001'],
    })

    expect(result.rows).toEqual([{ sn: 'SN001', factorCount: 2 }])
    expect(result.metadata).toEqual({ from: 'test' })
  })

  it('throws when token is missing', async () => {
    await expect(
      fetchKanbanData({
        token: '',
        productName: '试制产品 A1',
        fetchMode: 'sn',
        factorKeys: ['F_TEMP'],
        processList: ['涂布'],
        snList: ['SN001'],
      }),
    ).rejects.toThrow('未接收到宿主系统传入的访问凭证')
  })
})
