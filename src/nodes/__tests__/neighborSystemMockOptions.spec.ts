import { beforeEach, describe, expect, it } from 'vitest'
import { neighborSystemNode } from '../definitions/neighborSystem'
import { registerKanbanDataBridge, setKanbanAuthToken } from '@/services/kanbanIntegration'

describe('neighbor-system mock options', () => {
  beforeEach(() => {
    setKanbanAuthToken('')
    registerKanbanDataBridge(null)
  })

  it('provides mock options for node settings without host token', async () => {
    const propertyMap = new Map(
      neighborSystemNode.properties.map((property) => [property.name, property] as const),
    )

    const productOptions = await propertyMap.get('productName')!.resolveOptions?.({
      config: {},
      property: propertyMap.get('productName')!,
    })
    const sceneTree = await propertyMap.get('sceneSelection')!.resolveOptions?.({
      config: { productName: '试制产品 A1' },
      property: propertyMap.get('sceneSelection')!,
    })
    const factorTree = await propertyMap.get('selectedFactors')!.resolveOptions?.({
      config: {
        productName: '试制产品 A1',
        sceneSelection: {
          selectedKey: 'sub-scene:scene-pack::sub-pack-a',
          value: {
            sceneId: 'scene-pack',
            sceneLable: 'PACK',
            subSceneId: 'sub-pack-a',
            subSceneLable: 'PACK-A',
          },
        },
      },
      property: propertyMap.get('selectedFactors')!,
    })
    const materialTypeOptions = await propertyMap.get('materialType')!.resolveOptions?.({
      config: { productName: '试制产品 A1', fetchMode: 'time' },
      property: propertyMap.get('materialType')!,
    })
    const schemeTree = await propertyMap.get('schemeSelection')!.resolveOptions?.({
      config: { productName: '试制产品 A1', fetchMode: 'scheme' },
      property: propertyMap.get('schemeSelection')!,
    })
    const taskOrderTypeOptions = await propertyMap.get('taskOrderType')!.resolveOptions?.({
      config: { productName: '试制产品 A1', fetchMode: 'scheme' },
      property: propertyMap.get('taskOrderType')!,
    })
    const processOptions = await propertyMap.get('selectedProcesses')!.resolveOptions?.({
      config: { productName: '试制产品 A1' },
      property: propertyMap.get('selectedProcesses')!,
    })
    const processOptionsWithoutProduct = await propertyMap.get('selectedProcesses')!.resolveOptions?.({
      config: {},
      property: propertyMap.get('selectedProcesses')!,
    })

    expect(productOptions).toHaveLength(2)
    expect(sceneTree).toHaveLength(1)
    expect(factorTree?.length).toBeGreaterThanOrEqual(8)
    expect(factorTree?.flatMap((process) => process.children || [])).toHaveLength(40)
    expect(factorTree).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'process:涂布',
          label: '涂布',
        }),
        expect.objectContaining({
          key: 'process:化成',
          label: '化成',
        }),
        expect.objectContaining({
          key: 'process:PACK',
          label: 'PACK',
        }),
      ]),
    )
    expect(materialTypeOptions).toHaveLength(3)
    expect(schemeTree).toHaveLength(2)
    expect(taskOrderTypeOptions).toHaveLength(2)
    expect(processOptions?.length).toBeGreaterThanOrEqual(8)
    expect(processOptionsWithoutProduct?.length).toBeGreaterThanOrEqual(8)
  })
})
