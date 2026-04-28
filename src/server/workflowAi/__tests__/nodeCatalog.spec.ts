import { describe, expect, it } from 'vitest'
import {
  buildServerWorkflowAiNodeCatalog,
  getServerNodeCatalogItem,
  resolveServerNodePropertyOptions,
} from '../nodeCatalog.js'

describe('buildServerWorkflowAiNodeCatalog', () => {
  it('builds a server-safe node catalog for benchmark and agent planning', () => {
    const catalog = buildServerWorkflowAiNodeCatalog()

    expect(catalog.length).toBeGreaterThan(0)
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'manual-json-import',
          displayName: '手动输入数据',
          category: 'trigger',
        }),
        expect.objectContaining({
          name: 'pearson',
          displayName: 'Pearson 相关系数',
          category: 'terminal',
        }),
        expect.objectContaining({
          name: 'data-dedup',
          displayName: '去重',
          category: 'action',
        }),
        expect.objectContaining({
          name: 'data-merge',
          displayName: '数据合并',
          category: 'action',
          inputMode: 'multiple',
        }),
      ]),
    )
    expect(catalog.some((item) => item.name === 'data-cleaning')).toBe(false)
    expect(catalog.some((item) => item.name === 'data-profiling')).toBe(false)
  })

  it('exposes static property options for server-safe MCP introspection', async () => {
    const result = await resolveServerNodePropertyOptions('file-import', 'format')

    expect(result).toMatchObject({
      found: true,
      propertyName: 'format',
      visible: true,
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'auto', label: '自动识别' }),
        expect.objectContaining({ value: 'csv', label: 'CSV' }),
        expect.objectContaining({ value: 'xlsx', label: 'Excel' }),
      ]),
    })
  })

  it('derives selectable field options from upstream sample rows', async () => {
    const result = await resolveServerNodePropertyOptions(
      'field-selection',
      'fields',
      {},
      {
        kind: 'table',
        payload: [
          { price: 10, sales: 100, channel: 'A' },
          { price: 11, sales: 120, channel: 'B' },
        ],
      },
    )

    expect(result).toMatchObject({
      found: true,
      propertyName: 'fields',
      visible: true,
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'price', label: 'price' }),
        expect.objectContaining({ value: 'sales', label: 'sales' }),
        expect.objectContaining({ value: 'channel', label: 'channel' }),
      ]),
    })
  })

  it('returns a rich catalog item for MCP runtime lookup', () => {
    const item = getServerNodeCatalogItem('file-import')

    expect(item).toMatchObject({
      name: 'file-import',
      displayName: '本地文件导入',
      properties: expect.arrayContaining([
        expect.objectContaining({
          name: 'fileData',
          isRuntimeInput: true,
        }),
        expect.objectContaining({
          name: 'format',
        }),
      ]),
    })
  })

  it('exposes manual range properties for data-missing-outlier', () => {
    const item = getServerNodeCatalogItem('data-missing-outlier')
    expect(item).toBeTruthy()
    expect(item?.properties.some((property) => property.name === 'manualRangeRules')).toBe(true)
    const outlierMethod = item?.properties.find((property) => property.name === 'outlierMethod')
    expect(outlierMethod?.description).toContain('manual_range')
  })
})
