import { describe, expect, it, vi } from 'vitest'

const {
  mockFetchKanbanData,
  mockGetKanbanAuthToken,
  mockGetResolvedKanbanAuthToken,
  mockGetFactorTree,
  mockGetSceneTree,
  mockGetSchemeTree,
  mockListAuthorizedProducts,
  mockListMaterialTypes,
  mockListProcessOptions,
  mockListTaskOrderTypes,
} = vi.hoisted(() => ({
  mockFetchKanbanData: vi.fn(),
  mockGetKanbanAuthToken: vi.fn(),
  mockGetResolvedKanbanAuthToken: vi.fn(),
  mockGetFactorTree: vi.fn(),
  mockGetSceneTree: vi.fn(),
  mockGetSchemeTree: vi.fn(),
  mockListAuthorizedProducts: vi.fn(),
  mockListMaterialTypes: vi.fn(),
  mockListProcessOptions: vi.fn(),
  mockListTaskOrderTypes: vi.fn(),
}))

vi.mock('@/services/kanbanIntegration', () => ({
  fetchKanbanData: mockFetchKanbanData,
  getKanbanAuthToken: mockGetKanbanAuthToken,
  getResolvedKanbanAuthToken: mockGetResolvedKanbanAuthToken,
  getFactorTree: mockGetFactorTree,
  getSceneTree: mockGetSceneTree,
  getSchemeTree: mockGetSchemeTree,
  listAuthorizedProducts: mockListAuthorizedProducts,
  listMaterialTypes: mockListMaterialTypes,
  listProcessOptions: mockListProcessOptions,
  listTaskOrderTypes: mockListTaskOrderTypes,
}))

import { manualJsonImportNode } from '../definitions/manualJsonImport'
import { dataAggregationNode } from '../definitions/dataAggregation'
import { dataFilterNode } from '../definitions/dataFilter'
import { dataMergeNode } from '../definitions/dataMerge'
import { jsTransformNode } from '../definitions/jsTransform'
import { dataLimitNode } from '../definitions/dataLimit'
import { xgboostShapNode } from '../definitions/xgboostShap'
import { lassoNode } from '../definitions/lasso'
import { multipleLinearRegressionNode } from '../definitions/multipleLinearRegression'
import { randomForestFeatureImportanceNode } from '../definitions/randomForestFeatureImportance'
import { anovaNode } from '../definitions/anova'
import { pearsonNode } from '../definitions/pearson'
import { fieldSelectionNode } from '../definitions/fieldSelection'
import { sortNode } from '../definitions/sort'
import { spearmanNode } from '../definitions/spearman'
import { kendallNode } from '../definitions/kendall'
import { vifNode } from '../definitions/vif'
import { pcaNode } from '../definitions/pca'
import { dataExportNode } from '../definitions/dataExport'
import { neighborSystemNode } from '../definitions/neighborSystem'
import { createReportResult, createTableResult } from '../result'

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
    expect(result.preview?.viewer).toBe('table-chart-combo-viewer')
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

  it('data-aggregation time window mode should return a standardized summary table', async () => {
    const result = await dataAggregationNode.execute(
      createTableResult([
        { ts: '2026-03-28T10:05:00Z', value: 10, temp: 30 },
        { ts: '2026-03-28T10:40:00Z', value: 20, temp: 40 },
        { ts: '2026-03-28T11:10:00Z', value: 15, temp: 50 },
      ]),
      {
        mode: 'time_window',
        timeField: 'ts',
        timeWindowSize: 1,
        timeWindowUnit: 'hour',
        timeWindowMethods: ['mean', 'sum'],
        targetColumns: ['value', 'temp'],
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([
      {
        window_start: '2026-03-28T10:00:00.000Z',
        window_end: '2026-03-28T11:00:00.000Z',
        row_count: 2,
        value_mean: 15,
        value_sum: 30,
        temp_mean: 35,
        temp_sum: 70,
      },
      {
        window_start: '2026-03-28T11:00:00.000Z',
        window_end: '2026-03-28T12:00:00.000Z',
        row_count: 1,
        value_mean: 15,
        value_sum: 15,
        temp_mean: 50,
        temp_sum: 50,
      },
    ])
    expect(result.meta?.stats).toMatchObject({
      mode: 'time_window',
      originalCount: 3,
      outputCount: 2,
      windowCount: 2,
      timeField: 'ts',
      windowSize: 1,
      windowUnit: 'hour',
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

  it('js-transform should return a standardized table result with transform stats', async () => {
    const result = await jsTransformNode.execute(
      createTableResult([
        { city: '上海', score: 91 },
        { city: '北京', score: 77 },
      ]),
      {
        code: `return rows
          .filter((row) => row.score >= 80)
          .map((row) => ({ 城市: row.city, 得分: row.score }))`,
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([{ 城市: '上海', 得分: 91 }])
    expect(result.meta?.stats).toMatchObject({
      inputCount: 2,
      outputCount: 1,
    })
    expect(result.preview?.viewer).toBe('table-chart-combo-viewer')
  })

  it('field-selection should return a standardized table result with field stats', async () => {
    const result = await fieldSelectionNode.execute(
      createTableResult([
        { id: 1, city: '上海', score: 91 },
        { id: 2, city: '北京', score: 77 },
      ]),
      {
        mode: 'include',
        fields: ['city'],
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([{ city: '上海' }, { city: '北京' }])
    expect(result.meta?.stats).toMatchObject({
      originalFieldCount: 3,
      outputFieldCount: 1,
      mode: 'include',
    })
  })

  it('sort should return a standardized table result with rule stats', async () => {
    const result = await sortNode.execute(
      createTableResult([
        { city: '上海', score: 82 },
        { city: '北京', score: 91 },
        { city: '上海', score: 91 },
      ]),
      {
        sortRules: [
          { field: 'score', direction: 'desc' },
          { field: 'city', direction: 'asc' },
        ],
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([
      { city: '北京', score: 91 },
      { city: '上海', score: 91 },
      { city: '上海', score: 82 },
    ])
    expect(result.meta?.stats).toMatchObject({
      ruleCount: 2,
    })
  })

  it('data-limit should return a standardized table result with row limit stats', async () => {
    const result = await dataLimitNode.execute(
      createTableResult([{ id: 1 }, { id: 2 }, { id: 3 }]),
      {
        mode: 'head',
        limit: 2,
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([{ id: 1 }, { id: 2 }])
    expect(result.meta?.stats).toMatchObject({
      originalCount: 3,
      outputCount: 2,
      mode: 'head',
    })
  })

  it('data-merge join mode should return a standardized table result with union key stats and lineage', async () => {
    const result = await dataMergeNode.execute(
      {
        inputs: [
          {
            sourceNodeId: 'source-a',
            sourceNodeLabel: '来源A',
            result: createTableResult([{ sku: 'A001', city: '上海' }]),
          },
          {
            sourceNodeId: 'source-b',
            sourceNodeLabel: '来源B',
            result: createTableResult([{ code: 'A001', target: 1 }]),
          },
        ],
      },
      {
        mergeMode: 'join',
        unifiedKeyName: '样本编号',
        keyMappings: [
          { sourceNodeId: 'source-a', mergeKey: 'sku' },
          { sourceNodeId: 'source-b', mergeKey: 'code' },
        ],
      } as any,
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([{ 样本编号: 'A001', city: '上海', target: 1 }])
    expect(result.meta?.stats).toMatchObject({
      inputCount: 2,
      unionKeyCount: 1,
      outputRows: 1,
    })
    expect(result.lineage?.fields?.target?.[0]?.sourceNodeId).toBe('source-b')
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
    expect(global.fetch).toHaveBeenCalledWith('/api/analysis/xgboost-shap', expect.any(Object))
  })

  it('lasso should return a real report result from backend payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          summary: {
            targetField: 'target',
            sampleCount: 24,
            featureCount: 2,
            selectedFeatureCount: 1,
            alpha: 0.0312,
            r2: 0.9123,
            mae: 0.2876,
          },
          coefficients: [
            {
              name: 'f1',
              coefficient: 1.23,
              absCoefficient: 1.23,
              selected: true,
              rank: 1,
            },
            {
              name: 'f2',
              coefficient: 0,
              absCoefficient: 0,
              selected: false,
              rank: 2,
            },
          ],
          selectedFeatures: ['f1'],
          path: {
            alphas: [1, 0.1, 0.01],
            series: [
              { feature: 'f1', coefficients: [0, 0.8, 1.23] },
              { feature: 'f2', coefficients: [0, 0.02, 0] },
            ],
          },
        },
      }),
    }) as any

    const result = await lassoNode.execute(
      createTableResult([
        { target: 1, f1: 2, f2: 3 },
        { target: 2, f1: 3, f2: 4 },
      ]),
      { targetField: 'target' },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('Lasso 回归分析')
    expect(result.meta?.metrics).toMatchObject({
      targetField: 'target',
      sampleCount: 24,
      featureCount: 2,
      selectedFeatureCount: 1,
      alpha: 0.0312,
      r2: 0.9123,
    })
    expect(result.payload.sections[0].type).toBe('summary')
    expect(result.payload.sections[1].option.series[0].type).toBe('bar')
    expect(result.payload.sections[2].option.series[0].type).toBe('line')
    expect(global.fetch).toHaveBeenCalledWith('/api/analysis/lasso', expect.any(Object))
  })

  it('multiple-linear-regression should return a standardized report result from backend payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          summary: {
            targetField: 'target',
            sampleCount: 48,
            featureCount: 2,
            r2: 0.9561,
            adjustedR2: 0.9524,
            mae: 0.4182,
            intercept: 0.9321,
          },
          coefficients: [
            { name: 'f1', coefficient: 2.3, absCoefficient: 2.3, pValue: 0.0001, rank: 1 },
            { name: 'f2', coefficient: 0.8, absCoefficient: 0.8, pValue: 0.0215, rank: 2 },
          ],
          predictions: {
            actual: [10, 12, 14],
            predicted: [10.1, 11.9, 13.8],
          },
          residuals: {
            fitted: [10.1, 11.9, 13.8],
            residuals: [-0.1, 0.1, 0.2],
          },
        },
      }),
    }) as any

    const result = await multipleLinearRegressionNode.execute(
      createTableResult([
        { target: 10, f1: 1, f2: 2 },
        { target: 12, f1: 2, f2: 3 },
        { target: 14, f1: 3, f2: 4 },
      ]),
      { targetField: 'target', factorNames: ['f1', 'f2'] },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('多元线性回归分析')
    expect(result.meta?.metrics).toMatchObject({
      targetField: 'target',
      sampleCount: 48,
      featureCount: 2,
      adjustedR2: 0.9524,
      intercept: 0.9321,
    })
    expect(result.payload.sections[0].type).toBe('summary')
    expect(result.payload.sections[1].option.series[0].type).toBe('bar')
    expect(result.payload.sections[2].option.series[0].type).toBe('scatter')
    expect(result.payload.sections[3].option.series[0].type).toBe('scatter')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/analysis/multiple-linear-regression',
      expect.any(Object),
    )
  })

  it('random-forest-feature-importance should return a standardized report result from backend payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          summary: {
            targetField: 'target',
            sampleCount: 60,
            featureCount: 3,
            r2: 0.9321,
            mae: 0.5124,
            nEstimators: 200,
            maxDepth: 8,
          },
          importance: [
            { name: 'f1', value: 0.61, rank: 1 },
            { name: 'f2', value: 0.27, rank: 2 },
            { name: 'f3', value: 0.12, rank: 3 },
          ],
          cumulativeImportance: [
            { name: 'f1', cumulativeValue: 0.61, rank: 1 },
            { name: 'f2', cumulativeValue: 0.88, rank: 2 },
            { name: 'f3', cumulativeValue: 1, rank: 3 },
          ],
          predictions: {
            actual: [10, 12, 14],
            predicted: [10.4, 11.7, 14.2],
          },
          risks: [
            {
              code: 'flat_importance_distribution',
              level: 'medium',
              title: '重要性分布较平',
              message: '多个因子重要性接近，建议结合业务理解进一步筛选。',
            },
          ],
        },
      }),
    }) as any

    const result = await randomForestFeatureImportanceNode.execute(
      createTableResult([
        { target: 10, f1: 1, f2: 2, f3: 3 },
        { target: 12, f1: 2, f2: 3, f3: 4 },
        { target: 14, f1: 3, f2: 4, f3: 5 },
      ]),
      { targetField: 'target', factorNames: ['f1', 'f2', 'f3'] },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('随机森林特征重要性')
    expect(result.meta?.metrics).toMatchObject({
      targetField: 'target',
      sampleCount: 60,
      featureCount: 3,
      nEstimators: 200,
      maxDepth: 8,
    })
    expect(result.payload.sections[0].type).toBe('summary')
    expect(result.payload.sections[1].option.series[0].type).toBe('bar')
    expect(result.payload.sections[2].option.series[0].type).toBe('line')
    expect(result.payload.sections[3].option.series[0].type).toBe('scatter')
    expect(result.payload.sections[4].type).toBe('risk-list')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/analysis/random-forest-feature-importance',
      expect.any(Object),
    )
  })

  it('anova should return a standardized report result with significance metrics and group charts', async () => {
    const result = await anovaNode.execute(
      createTableResult([
        { condition: 'A', target: 10 },
        { condition: 'A', target: 11 },
        { condition: 'A', target: 9 },
        { condition: 'B', target: 20 },
        { condition: 'B', target: 22 },
        { condition: 'B', target: 21 },
        { condition: 'C', target: 30 },
        { condition: 'C', target: 31 },
        { condition: 'C', target: 29 },
      ]),
      { targetField: 'target', groupField: 'condition' },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('单因素方差分析')
    expect(result.meta?.metrics).toMatchObject({
      groupCount: 3,
      targetField: 'target',
      groupField: 'condition',
    })
    expect(result.payload.sections[0].type).toBe('summary')
    expect(result.payload.sections[1].option.series[0].type).toBe('bar')
    expect(result.payload.sections[2].option.series[0].type).toBe('boxplot')
    expect(result.payload.sections[3].type).toBe('risk-list')
    expect(result.preview?.viewer).toBe('report-viewer')
  })

  it('correlation nodes should return standardized report results', async () => {
    const input = createTableResult([
      { target: 1, f1: 1, f2: 10 },
      { target: 2, f1: 2, f2: 8 },
      { target: 3, f1: 3, f2: 6 },
      { target: 4, f1: 4, f2: 4 },
      { target: 5, f1: 5, f2: 2 },
    ])

    const config = { xFields: ['f1', 'f2'], yFields: ['target'], heatmapTopN: 1, rankingTopN: 1 }
    const pearson = await pearsonNode.execute(input, config)
    const spearman = await spearmanNode.execute(input, config)
    const kendall = await kendallNode.execute(input, config)

    expect(pearson.kind).toBe('report')
    expect(pearson.payload.title).toBe('Pearson 相关系数矩阵分析')
    expect(pearson.meta?.metrics?.yFields).toEqual(['target'])
    expect(pearson.meta?.metrics?.minPairSampleSize).toBe(5)
    expect(pearson.payload.sections?.[0]?.type).toBe('summary')
    expect(pearson.payload.sections?.[1]?.option?.xAxis?.data).toEqual(['f1'])
    expect(pearson.payload.sections?.[1]?.controls?.toggle?.modelKey).toBe('showHeatmapLabels')
    expect(pearson.payload.sections?.[2]?.controls?.select?.options).toEqual(['target'])
    expect(pearson.payload.sections?.[2]?.option?.yAxis?.data).toEqual(['f1'])
    expect(pearson.payload.sections?.[2]?.option?.series?.[0]?.data).toEqual([{ value: 1, itemStyle: { color: '#2563eb' } }])
    expect(pearson.payload.sections?.[3]?.title).toBe('结果可信提示')
    expect(pearson.payload.sections?.[3]?.type).toBe('risk-list')
    expect(Array.isArray(pearson.meta?.risks)).toBe(true)

    expect(spearman.kind).toBe('report')
    expect(spearman.payload.sections[1].option.series[0].name).toBe('Spearman ρ')

    expect(kendall.kind).toBe('report')
    expect(kendall.payload.sections[1].option.series[0].name).toBe('Kendall τ')
  })

  it('vif should return a standardized report result with vif metrics and risks', async () => {
    const result = await vifNode.execute(
      createTableResult([
        { f1: 1, f2: 2.01, f3: 10 },
        { f1: 2, f2: 4.02, f3: 8 },
        { f1: 3, f2: 6.01, f3: 6 },
        { f1: 4, f2: 8.03, f3: 4 },
        { f1: 5, f2: 10.05, f3: 2 },
        { f1: 6, f2: 12.04, f3: 1 },
      ]),
      { factorNames: ['f1', 'f2', 'f3'] },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('VIF 共线性检测')
    expect(result.meta?.metrics).toMatchObject({
      featureCount: 3,
    })
    expect(result.payload.sections[0].type).toBe('summary')
    expect(result.payload.sections[1].option.series[0].type).toBe('bar')
    expect(result.payload.sections[2].type).toBe('risk-list')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(Array.isArray(result.meta?.risks)).toBe(true)
  })

  it('pca should return a standardized report result with explained variance and loadings', async () => {
    const result = await pcaNode.execute(
      createTableResult([
        { f1: 1, f2: 2, f3: 3, label: 'A' },
        { f1: 2, f2: 4, f3: 6, label: 'B' },
        { f1: 3, f2: 6, f3: 9, label: 'C' },
        { f1: 4, f2: 8, f3: 12, label: 'D' },
        { f1: 5, f2: 10, f3: 15, label: 'E' },
        { f1: 6, f2: 12, f3: 18, label: 'F' },
      ]),
      { factorNames: ['f1', 'f2', 'f3'], componentCount: 2, standardize: true },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('PCA 主成分分析')
    expect(result.meta?.metrics).toMatchObject({
      featureCount: 3,
      componentCount: 2,
    })
    expect(result.payload.sections[0].type).toBe('summary')
    expect(result.payload.sections[1].option.series[0].type).toBe('bar')
    expect(result.payload.sections[2].option.series[0].type).toBe('heatmap')
    expect(result.preview?.viewer).toBe('report-viewer')
    expect(Array.isArray(result.meta?.loadings)).toBe(true)
  })

  it('neighbor-system should return a table result with upstream metadata in meta', async () => {
    mockGetResolvedKanbanAuthToken.mockReturnValue('token-from-host')
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
      sceneSelection: {
        selectedKey: 'sub-scene:scene-pack::sub-pack-a',
        value: {
          sceneId: 'scene-pack',
          sceneLable: 'PACK',
          subSceneId: 'sub-pack-a',
          subSceneLable: 'PACK-A',
        },
      },
      fetchMode: 'time',
      timeRange: [new Date('2026-03-01'), new Date('2026-03-10')],
      materialType: '正极',
      selectedProcesses: ['涂布'],
      selectedFactors: {
        selectedKeys: ['factor:涂布::F_TEMP', 'factor:涂布::F_PRESS'],
        values: [
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

  it('data-export should support report html exports as standardized file results', async () => {
    const result = await dataExportNode.execute(
      createReportResult({
        title: 'Pearson 相关系数矩阵分析',
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '分析摘要',
            cards: [{ label: '样本行数', value: 128 }],
          },
        ],
      }),
      { format: 'html', filename: '相关性分析报告' },
    )

    expect(result.kind).toBe('file')
    expect(result.payload.filename).toMatch(/^相关性分析报告_\d{8}_\d{6}\.html$/)
    expect(result.payload.format).toBe('html')
    expect(result.payload.contentKind).toBe('report-html')
    expect(result.payload.url).toBeUndefined()
    expect(result.meta?.sourceKind).toBe('report')
    expect(result.preview?.viewer).toBe('file-viewer')
  })
})
