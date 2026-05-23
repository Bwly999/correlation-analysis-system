import { describe, expect, it } from 'vitest'
import {
  buildServerWorkflowAiNodeCatalog,
  buildServerWorkflowAiValidationCatalog,
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
          name: 'correlation-analysis',
          displayName: '单调性分析',
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
    expect(catalog.some((item) => item.name === 'pearson')).toBe(false)
    expect(catalog.some((item) => item.name === 'spearman')).toBe(false)
    expect(catalog.some((item) => item.name === 'kendall')).toBe(false)
    expect(catalog.some((item) => item.name === 'chart-display')).toBe(false)
    expect(catalog.some((item) => item.name === 'data-export')).toBe(false)
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
    expect(outlierMethod?.description).toContain('IQR')
  })

  it('exposes decimal number metadata in server-safe node catalogs', () => {
    const catalog = buildServerWorkflowAiNodeCatalog()
    const dataMissingOutlier = catalog.find((item) => item.name === 'data-missing-outlier')
    const correlationAnalysis = catalog.find((item) => item.name === 'correlation-analysis')
    const iqrK = dataMissingOutlier?.properties.find((property) => property.name === 'iqrK')
    const percentile = dataMissingOutlier?.properties.find((property) => property.name === 'percentile')
    const heatmapTopN = correlationAnalysis?.properties.find((property) => property.name === 'heatmapTopN')

    expect(iqrK).toMatchObject({
      type: 'number',
      numberMode: 'decimal',
    })
    expect(percentile).toMatchObject({
      type: 'number',
      numberMode: 'decimal',
    })
    expect(heatmapTopN).toMatchObject({
      type: 'number',
    })
    expect(heatmapTopN).not.toHaveProperty('numberMode')
  })

  it('builds a validation catalog that can still recognize legacy compatibility nodes', () => {
    const catalog = buildServerWorkflowAiValidationCatalog(['pearson', 'data-export'])

    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'correlation-analysis' }),
        expect.objectContaining({ name: 'pearson', displayName: 'Pearson 相关系数' }),
        expect.objectContaining({ name: 'data-export', displayName: '数据导出' }),
      ]),
    )
  })
})
