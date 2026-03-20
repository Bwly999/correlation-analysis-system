import { describe, expect, it, vi } from 'vitest'

const {
  mockFetchKanbanData,
  mockGetKanbanAuthToken,
  mockGetFactorTree,
  mockGetSchemeTree,
  mockListAuthorizedProducts,
  mockListMaterialTypes,
  mockListTaskOrderTypes,
} = vi.hoisted(() => ({
  mockFetchKanbanData: vi.fn(),
  mockGetKanbanAuthToken: vi.fn(),
  mockGetFactorTree: vi.fn(),
  mockGetSchemeTree: vi.fn(),
  mockListAuthorizedProducts: vi.fn(),
  mockListMaterialTypes: vi.fn(),
  mockListTaskOrderTypes: vi.fn(),
}))

vi.mock('@/services/kanbanIntegration', () => ({
  fetchKanbanData: mockFetchKanbanData,
  getKanbanAuthToken: mockGetKanbanAuthToken,
  getFactorTree: mockGetFactorTree,
  getSchemeTree: mockGetSchemeTree,
  listAuthorizedProducts: mockListAuthorizedProducts,
  listMaterialTypes: mockListMaterialTypes,
  listTaskOrderTypes: mockListTaskOrderTypes,
}))

import { manualJsonImportNode } from '../definitions/manualJsonImport'
import { dataAggregationNode } from '../definitions/dataAggregation'
import { dataFilterNode } from '../definitions/dataFilter'
import { xgboostShapNode } from '../definitions/xgboostShap'
import { lassoNode } from '../definitions/lasso'
import { pearsonNode } from '../definitions/pearson'
import { spearmanNode } from '../definitions/spearman'
import { kendallNode } from '../definitions/kendall'
import { dataExportNode } from '../definitions/dataExport'
import { neighborSystemNode } from '../definitions/neighborSystem'
import { createTableResult } from '../result'

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

describe('remaining nodes standardized result protocol', () => {
  it('manual-json-import should return a table result for object arrays', async () => {
    const result = await manualJsonImportNode.execute(null, {
      jsonData: JSON.stringify([{ f1: '10', tag: 'A' }]),
      autoClean: true,
    })

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([{ f1: 10, tag: 'A' }])
    expect(result.meta?.sourceType).toBe('manual')
    expect(result.preview?.viewer).toBe('table-preview')
  })

  it('data-aggregation should return a standardized table result', async () => {
    const result = await dataAggregationNode.execute(
      createTableResult([
        { f1: 10, f2: 20, f3: 30 },
        { f1: 5, f2: 5, f3: 5 },
      ]),
      {
        mode: 'row_combine',
        aggregationGroups: [
          {
            targetFactorName: 'total',
            method: 'sum',
            inputColumns: ['f1', 'f2', 'f3'],
          },
        ],
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload[0]?.total).toBe(60)
    expect(result.meta?.stats).toMatchObject({
      mode: 'row_combine',
      outputCount: 2,
    })
  })

  it('data-filter should return a standardized table result with stats', async () => {
    const result = await dataFilterNode.execute(
      createTableResult([
        { city: '上海', score: 91 },
        { city: '北京', score: 77 },
        { city: '上海', score: 82 },
      ]),
      {
        matchMode: 'all',
        conditions: [
          { field: 'city', operator: 'equals', value: '上海' },
          { field: 'score', operator: 'gte', value: 85 },
        ],
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([{ city: '上海', score: 91 }])
    expect(result.meta?.stats).toMatchObject({
      originalCount: 3,
      filteredCount: 1,
    })
  })

  it('xgboost-shap should return a report result with metrics in meta', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          summary: {
            targetField: 'target',
            sampleCount: 2,
            featureCount: 2,
            r2: 0.88,
            mae: 0.12,
          },
          importance: [
            { name: 'f1', value: 0.6, rank: 1 },
            { name: 'f2', value: 0.4, rank: 2 },
          ],
          dependence: [
            { feature: 'f1', x: [1, 2], shap: [0.1, 0.2] },
            { feature: 'f2', x: [2, 3], shap: [0.2, 0.3] },
          ],
          assets: {
            fullReportImage: 'base64_full',
          },
        },
      }),
    }) as any

    const result = await xgboostShapNode.execute(
      createTableResult([
        { target: 1, f1: 2, f2: 3 },
        { target: 2, f1: 3, f2: 4 },
      ]),
      { targetField: 'target' },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toContain('Xgboost + SHAP')
    expect(result.meta?.metrics).toMatchObject({
      targetField: 'target',
      sampleCount: 2,
      featureCount: 2,
    })
    expect(result.preview?.viewer).toBe('report-viewer')
  })

  it('lasso should return a report result', async () => {
    const result = await lassoNode.execute(
      createTableResult([{ target: 1, f1: 2 }]),
      { targetField: 'target' },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('Lasso 回归分析')
    expect(result.meta?.metrics).toMatchObject({
      targetField: 'target',
      rowCount: 1,
    })
  })

  it('correlation nodes should return standardized report results', async () => {
    const input = createTableResult([
      { target: 1, f1: 1, f2: 10 },
      { target: 2, f1: 2, f2: 8 },
      { target: 3, f1: 3, f2: 6 },
      { target: 4, f1: 4, f2: 4 },
      { target: 5, f1: 5, f2: 2 },
    ])

    const pearson = await pearsonNode.execute(input, { targetField: 'target', topN: 5 })
    const spearman = await spearmanNode.execute(input, { targetField: 'target', topN: 5 })
    const kendall = await kendallNode.execute(input, { targetField: 'target', topN: 5 })

    expect(pearson.kind).toBe('report')
    expect(pearson.payload.title).toBe('Pearson 相关系数矩阵分析')
    expect(pearson.meta?.metrics?.targetField).toBe('target')

    expect(spearman.kind).toBe('report')
    expect(spearman.payload.sections[1].option.series[0].name).toBe('Spearman ρ')

    expect(kendall.kind).toBe('report')
    expect(kendall.payload.sections[1].option.series[0].name).toBe('Kendall τ')
  })

  it('neighbor-system should return a table result with upstream metadata in meta', async () => {
    mockGetKanbanAuthToken.mockReturnValue('token-from-host')
    mockFetchKanbanData.mockResolvedValue({
      rows: [
        { sn: 'SN001', F_TEMP: 12.3, F_PRESS: 45.6 },
        { sn: 'SN002', F_TEMP: 22.3, F_PRESS: 55.6 },
      ],
      metadata: {
        totalSn: 2,
      },
    })

    const result = await neighborSystemNode.execute(null, {
      productName: '试制产品 A1',
      fetchMode: 'time',
      timeRange: [new Date('2026-03-01'), new Date('2026-03-10')],
      materialType: '正极',
      selectedFactors: {
        'factor:涂布::F_TEMP': { checked: true },
        'factor:涂布::F_PRESS': { checked: true },
      },
    })

    expect(result.kind).toBe('table')
    expect(result.payload).toHaveLength(2)
    expect(result.meta?.metadata).toMatchObject({
      factors_count: 2,
      product: '试制产品 A1',
      fetch_mode: 'time',
    })
  })

  it('data-export should return a file result', async () => {
    const result = await dataExportNode.execute(
      createTableResult([{ a: 1, b: 2 }]),
      { format: 'csv', filename: 'test_export' },
    )

    expect(result.kind).toBe('file')
    expect(result.payload.filename).toBe('test_export.csv')
    expect(result.payload.url).toBe('blob:mock-url')
    expect(result.preview?.viewer).toBe('file-viewer')
  })
})
