import { describe, expect, it } from 'vitest'

import type { NodeProperty } from '@/nodes/types'
import { applyDependencyReset } from '../configDependencies'

describe('applyDependencyReset', () => {
  const properties: NodeProperty[] = [
    {
      name: 'productName',
      displayName: '产品名称',
      type: 'options',
      default: '',
    },
    {
      name: 'selectedFactors',
      displayName: '因子全集',
      type: 'tree',
      default: {},
      dependencies: ['productName'],
    },
    {
      name: 'selectedProcesses',
      displayName: '工序',
      type: 'multi-options',
      default: [],
      dependencies: ['productName'],
    },
    {
      name: 'schemeSelection',
      displayName: '阶段方案',
      type: 'tree',
      default: {},
      dependencies: ['productName'],
    },
    {
      name: 'taskOrderType',
      displayName: '任务令类型',
      type: 'options',
      default: '',
      dependencies: ['productName'],
    },
    {
      name: 'materialType',
      displayName: '物料类型',
      type: 'options',
      default: '',
      dependencies: ['productName'],
    },
    {
      name: 'snList',
      displayName: 'SN 列表',
      type: 'textarea',
      default: '',
    },
  ]

  it('resets dependency-bound fields when the driving field changes', () => {
    const nextConfig = applyDependencyReset({
      properties,
      previousConfig: {
        productName: '旧产品',
        selectedFactors: { 'factor:涂布::F_TEMP': { checked: true } },
        selectedProcesses: ['涂布'],
        schemeSelection: { 'scheme:V3::A': { checked: true } },
        taskOrderType: '试制任务令',
        materialType: '正极',
        snList: 'SN001',
      },
      propName: 'productName',
      value: '新产品',
    })

    expect(nextConfig).toEqual({
      productName: '新产品',
      selectedFactors: {},
      selectedProcesses: [],
      schemeSelection: {},
      taskOrderType: '',
      materialType: '',
      snList: 'SN001',
    })
  })

  it('does not reset dependency-bound fields when the value stays the same', () => {
    const nextConfig = applyDependencyReset({
      properties,
      previousConfig: {
        productName: '同一产品',
        selectedProcesses: ['涂布'],
      },
      propName: 'productName',
      value: '同一产品',
    })

    expect(nextConfig).toEqual({
      productName: '同一产品',
      selectedProcesses: ['涂布'],
    })
  })

  it('syncs neighbor-system processes from selected factors when factor selection changes', () => {
    const nextConfig = applyDependencyReset({
      properties: [
        ...properties.map((property) =>
          property.name === 'selectedProcesses'
            ? { ...property, dependencies: ['productName', 'selectedFactors'] }
            : property,
        ),
      ],
      previousConfig: {
        productName: '试制产品 A1',
        selectedFactors: {
          selectedKeys: ['factor:涂布::F_TEMP'],
          values: [
            {
              factorKey: 'F_TEMP',
              factorName: '温度',
              processName: '涂布',
            },
          ],
        },
        selectedProcesses: ['手动工序'],
      },
      propName: 'selectedFactors',
      value: {
        selectedKeys: ['factor:涂布::F_TEMP', 'factor:装配::F_PRESS'],
        values: [
          {
            factorKey: 'F_TEMP',
            factorName: '温度',
            processName: '涂布',
          },
          {
            factorKey: 'F_PRESS',
            factorName: '压力',
            processName: '装配',
          },
        ],
      },
      nodeType: 'neighbor-system',
    })

    expect(nextConfig.selectedProcesses).toEqual(['涂布', '装配'])
  })

  it('clears neighbor-system processes when factor selection becomes empty', () => {
    const nextConfig = applyDependencyReset({
      properties: [
        ...properties.map((property) =>
          property.name === 'selectedProcesses'
            ? { ...property, dependencies: ['productName', 'selectedFactors'] }
            : property,
        ),
      ],
      previousConfig: {
        productName: '试制产品 A1',
        selectedFactors: {
          selectedKeys: ['factor:涂布::F_TEMP'],
        },
        selectedProcesses: ['涂布'],
      },
      propName: 'selectedFactors',
      value: {},
      nodeType: 'neighbor-system',
    })

    expect(nextConfig.selectedProcesses).toEqual([])
  })

  it('does not apply factor-driven process sync to other node types', () => {
    const nextConfig = applyDependencyReset({
      properties,
      previousConfig: {
        productName: '试制产品 A1',
        selectedFactors: {
          selectedKeys: ['factor:涂布::F_TEMP'],
        },
        selectedProcesses: ['保留工序'],
      },
      propName: 'selectedFactors',
      value: {
        selectedKeys: ['factor:装配::F_PRESS'],
      },
      nodeType: 'custom-node',
    })

    expect(nextConfig.selectedProcesses).toEqual(['保留工序'])
  })
})
