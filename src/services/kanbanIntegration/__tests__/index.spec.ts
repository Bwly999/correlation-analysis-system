import { beforeEach, describe, expect, it } from 'vitest'

import {
  fetchKanbanData,
  getKanbanAuthToken,
  getFactorTree,
  getSceneTree,
  getSchemeTree,
  initializeKanbanHostBridge,
  listProcessOptions,
  registerKanbanDataBridge,
  setKanbanAuthToken,
} from '../index'

describe('kanban integration bridge', () => {
  beforeEach(() => {
    setKanbanAuthToken('')
    registerKanbanDataBridge({
      async listFactorCatalog() {
        return [
          {
            sceneName: '全场景/全场景',
            processName: '装配',
            factorName: '扭矩',
            factorKey: 'F_TORQUE',
          },
          {
            sceneName: '全场景/全场景',
            processName: '涂布',
            factorName: '温度',
            factorKey: 'F_TEMP',
          },
        ]
      },
      async listScene() {
        return [
          {
            sceneId: 'scene-pack',
            sceneLable: 'PACK',
            subSceneId: 'sub-pack-a',
            subSceneLable: 'PACK-A',
          },
          {
            sceneId: 'scene-pack',
            sceneLable: 'PACK',
            subSceneId: 'sub-pack-b',
            subSceneLable: 'PACK-B',
          },
        ]
      },
      async listSchemeCatalog() {
        return [
          { stageName: 'V4', schemeName: 'C', schemeKey: 'V4::C' },
          { stageName: 'V3', schemeName: 'A', schemeKey: 'V3::A' },
        ]
      },
      async fetchKanbanData(params) {
        return {
          rows: [{ sn: 'SN001', factorCount: params.val.length }],
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

  it('builds factor tree and process options from domain catalog data', async () => {
    setKanbanAuthToken('host-token-003')

    const tree = await getFactorTree(getKanbanAuthToken(), '试制产品 A1')
    const processOptions = await listProcessOptions(getKanbanAuthToken(), '试制产品 A1')

    expect(tree).toEqual([
      {
        key: 'process:涂布',
        label: '涂布',
        data: {
          nodeType: 'process',
          sceneName: '全场景/全场景',
          process: '涂布',
          searchText: '全场景/全场景 / 涂布',
        },
        children: [
          {
            key: 'factor:涂布::F_TEMP',
            label: '温度',
            data: {
              nodeType: 'factor',
              sceneName: '全场景/全场景',
              process: '涂布',
              factorKey: 'F_TEMP',
              value: {
                factorKey: 'F_TEMP',
                factorName: '温度',
                materialType: '',
                processName: '涂布',
                r2Name: '',
              },
              searchText: '全场景/全场景 / 涂布 / 温度',
            },
          },
        ],
      },
      {
        key: 'process:装配',
        label: '装配',
        data: {
          nodeType: 'process',
          sceneName: '全场景/全场景',
          process: '装配',
          searchText: '全场景/全场景 / 装配',
        },
        children: [
          {
            key: 'factor:装配::F_TORQUE',
            label: '扭矩',
            data: {
              nodeType: 'factor',
              sceneName: '全场景/全场景',
              process: '装配',
              factorKey: 'F_TORQUE',
              value: {
                factorKey: 'F_TORQUE',
                factorName: '扭矩',
                materialType: '',
                processName: '装配',
                r2Name: '',
              },
              searchText: '全场景/全场景 / 装配 / 扭矩',
            },
          },
        ],
      },
    ])

    expect(processOptions).toEqual([
      { name: '涂布', value: '涂布' },
      { name: '装配', value: '装配' },
    ])
  })

  it('builds scene tree with frontend compact value objects', async () => {
    setKanbanAuthToken('host-token-005')

    const tree = await getSceneTree(getKanbanAuthToken(), '试制产品 A1')

    expect(tree).toEqual([
      {
        key: 'scene:scene-pack',
        label: 'PACK',
        data: {
          nodeType: 'scene',
          sceneId: 'scene-pack',
          sceneLable: 'PACK',
          searchText: 'PACK',
        },
        children: [
          {
            key: 'sub-scene:scene-pack::sub-pack-a',
            label: 'PACK-A',
            data: {
              nodeType: 'sub-scene',
              sceneId: 'scene-pack',
              sceneLable: 'PACK',
              subSceneId: 'sub-pack-a',
              subSceneLable: 'PACK-A',
              value: {
                sceneId: 'scene-pack',
                sceneLable: 'PACK',
                subSceneId: 'sub-pack-a',
                subSceneLable: 'PACK-A',
              },
              searchText: 'PACK / PACK-A',
            },
          },
          {
            key: 'sub-scene:scene-pack::sub-pack-b',
            label: 'PACK-B',
            data: {
              nodeType: 'sub-scene',
              sceneId: 'scene-pack',
              sceneLable: 'PACK',
              subSceneId: 'sub-pack-b',
              subSceneLable: 'PACK-B',
              value: {
                sceneId: 'scene-pack',
                sceneLable: 'PACK',
                subSceneId: 'sub-pack-b',
                subSceneLable: 'PACK-B',
              },
              searchText: 'PACK / PACK-B',
            },
          },
        ],
      },
    ])
  })

  it('builds scheme tree from domain scheme catalog data', async () => {
    setKanbanAuthToken('host-token-004')

    const tree = await getSchemeTree(getKanbanAuthToken(), '试制产品 A1')

    expect(tree).toEqual([
      {
        key: 'stage:V3',
        label: 'V3',
        data: { nodeType: 'stage', stage: 'V3', searchText: 'V3' },
        children: [
          {
            key: 'scheme:V3::A',
            label: 'A',
            data: {
              nodeType: 'scheme',
              stage: 'V3',
              scheme: 'A',
              schemeKey: 'V3::A',
              searchText: 'V3 / A',
            },
          },
        ],
      },
      {
        key: 'stage:V4',
        label: 'V4',
        data: { nodeType: 'stage', stage: 'V4', searchText: 'V4' },
        children: [
          {
            key: 'scheme:V4::C',
            label: 'C',
            data: {
              nodeType: 'scheme',
              stage: 'V4',
              scheme: 'C',
              schemeKey: 'V4::C',
              searchText: 'V4 / C',
            },
          },
        ],
      },
    ])
  })

  it('fetches data through the registered bridge with token validation', async () => {
    setKanbanAuthToken('host-token-002')

    const result = await fetchKanbanData({
      token: getKanbanAuthToken(),
      productName: '试制产品 A1',
      fetchMode: 'sn',
      val: [
        {
          factorKey: 'F_TEMP',
          factorName: '温度',
          materialType: '正极',
          processName: '涂布',
          r2Name: 'R2-TEMP',
        },
        {
          factorKey: 'F_PRESS',
          factorName: '压力',
          materialType: '正极',
          processName: '涂布',
          r2Name: 'R2-PRESS',
        },
      ],
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
        val: [
          {
            factorKey: 'F_TEMP',
            factorName: '温度',
            materialType: '正极',
            processName: '涂布',
            r2Name: 'R2-TEMP',
          },
        ],
        processList: ['涂布'],
        snList: ['SN001'],
      }),
    ).rejects.toThrow('未接收到宿主系统传入的访问凭证')
  })
})
