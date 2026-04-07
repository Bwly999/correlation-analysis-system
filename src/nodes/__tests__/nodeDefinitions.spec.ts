import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const {
  mockFetchKanbanData,
  mockGetKanbanAuthToken,
  mockGetResolvedKanbanAuthToken,
  mockGetFactorTree,
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
  getSchemeTree: mockGetSchemeTree,
  listAuthorizedProducts: mockListAuthorizedProducts,
  listMaterialTypes: mockListMaterialTypes,
  listProcessOptions: mockListProcessOptions,
  listTaskOrderTypes: mockListTaskOrderTypes,
}))

import { fileImportNode } from '../definitions/fileImport'
import { dataCleaningNode } from '../definitions/dataCleaning'
import { dataProfilingNode } from '../definitions/dataProfiling'
import { dataAggregationNode } from '../definitions/dataAggregation'
import { dataFilterNode } from '../definitions/dataFilter'
import { jsTransformNode } from '../definitions/jsTransform'
import { dataLimitNode } from '../definitions/dataLimit'
import { xgboostShapNode } from '../definitions/xgboostShap'
import { neighborSystemNode } from '../definitions/neighborSystem'
import { chartDisplayNode } from '../definitions/chartDisplay'
import { dataExportNode } from '../definitions/dataExport'
import { fieldSelectionNode } from '../definitions/fieldSelection'
import { lassoNode } from '../definitions/lasso'
import { multipleLinearRegressionNode } from '../definitions/multipleLinearRegression'
import { pcaNode } from '../definitions/pca'
import { randomForestFeatureImportanceNode } from '../definitions/randomForestFeatureImportance'
import { pearsonNode } from '../definitions/pearson'
import { sortNode } from '../definitions/sort'
import { spearmanNode } from '../definitions/spearman'
import { kendallNode } from '../definitions/kendall'
import { vifNode } from '../definitions/vif'
import { nodeDefinitions } from '../registry'
import {
  createTableCollectionResult,
  createReportResult,
  createTableResult,
  isPlainObject,
  normalizeNodeResult,
  type NodeResult,
} from '../result'

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

const asLegacy = (result: unknown): any => {
  const normalized = normalizeNodeResult(result as NodeResult)

  if (normalized.kind === 'table') {
    return {
      ...normalized,
      data: normalized.payload,
      stats: normalized.meta?.stats,
      diagnostics: normalized.meta?.diagnostics,
      metadata: normalized.meta?.metadata,
      type: normalized.meta?.sourceType,
    }
  }

  if (normalized.kind === 'tableCollection') {
    return {
      ...normalized,
      data: normalized.payload,
      stats: normalized.meta?.stats,
      diagnostics: normalized.meta?.diagnostics,
      chartOption: normalized.meta?.chartOption,
    }
  }

  if (normalized.kind === 'report') {
    return {
      ...normalized,
      viewType: 'report',
      report: normalized.payload,
      metrics: normalized.meta?.metrics,
      profile: normalized.meta?.profile,
      data: normalized.meta?.sourceData ?? null,
    }
  }

  if (normalized.kind === 'chart') {
    return {
      ...normalized,
      viewType: 'chart',
      chartOption: normalized.payload,
    }
  }

  if (normalized.kind === 'file') {
    return {
      ...normalized,
      viewType: 'export',
      exportInfo: normalized.payload,
    }
  }

  if (normalized.kind === 'json' && isPlainObject(normalized.payload)) {
    return {
      ...normalized,
      ...normalized.payload,
    }
  }

  return normalized
}

describe('Node Definitions Execution Logic', () => {
  it('should provide the minimum help metadata for every node definition', () => {
    for (const definition of nodeDefinitions) {
      expect(definition.help?.summary).toBeTruthy()
      expect(definition.help?.whenToUse?.length).toBeGreaterThan(0)
      expect(definition.help?.inputGuide?.length).toBeGreaterThan(0)
      expect(definition.help?.outputGuide?.length).toBeGreaterThan(0)
      expect(definition.libraryGroup).toBeTruthy()
      expect(definition.libraryAliases?.length).toBeGreaterThan(0)
      expect(definition.libraryKeywords?.length).toBeGreaterThan(0)
    }
  })

  it('should expose readable Chinese labels for the board integration node', () => {
    expect(neighborSystemNode.displayName).toBe('看板数据对接')
    expect(
      neighborSystemNode.properties.find((property) => property.name === 'productName')
        ?.displayName,
    ).toBe('产品名称')
    expect(
      neighborSystemNode.properties.find((property) => property.name === 'selectedFactors')
        ?.displayName,
    ).toBe('因子全集')
    expect(
      neighborSystemNode.properties.find((property) => property.name === 'selectedProcesses')
        ?.displayName,
    ).toBe('工序')

    const runtimePropertyNames = neighborSystemNode.properties
      .filter((property) => property.isRuntimeInput)
      .map((property) => property.name)

    expect(runtimePropertyNames[runtimePropertyNames.length - 1]).toBe('selectedProcesses')
  })

  it('should use multi-options for analysis factorNames fields', () => {
    const analysisNodes = [
      multipleLinearRegressionNode,
      pcaNode,
      randomForestFeatureImportanceNode,
      vifNode,
      xgboostShapNode,
    ]

    analysisNodes.forEach((definition) => {
      const factorNamesProperty = definition.properties.find((property) => property.name === 'factorNames')

      expect(factorNamesProperty).toMatchObject({
        type: 'multi-options',
        useUpstreamFactors: true,
        editable: true,
        forceInput: true,
      })
    })
  })

  it('should expose a configurable dependence plot limit for xgboost-shap', () => {
    const dependenceLimitProperty = xgboostShapNode.properties.find(
      (property) => property.name === 'maxDependencePlots',
    )

    expect(dependenceLimitProperty).toMatchObject({
      type: 'number',
      displayName: '依赖图数量上限',
      default: 8,
    })
  })

  describe('file-import', () => {
    it('should parse a CSV file correctly', async () => {
      const csvPath = path.resolve(__dirname, '../../../test/resource/test_data.csv')
      const csvBuffer = fs.readFileSync(csvPath)
      const file = new File([csvBuffer], 'test_data.csv', { type: 'text/csv' })

      const config = { fileData: file, format: 'auto' }
      const result = await fileImportNode.execute(null, config)

      const legacy = asLegacy(result)

      expect(legacy.data).toBeDefined()
      expect(legacy.data.length).toBeGreaterThan(0)
      expect(legacy.type).toBe('csv')
    })

    it('should parse an XLSX file correctly', async () => {
      const xlsxPath = path.resolve(__dirname, '../../../test/resource/test_data.xlsx')
      const xlsxBuffer = fs.readFileSync(xlsxPath)
      const file = new File([xlsxBuffer], 'test_data.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const config = { fileData: file, format: 'auto' }
      const result = await fileImportNode.execute(null, config)

      const legacy = asLegacy(result)

      expect(legacy.data).toBeDefined()
      expect(legacy.data.length).toBeGreaterThan(0)
      expect(legacy.type).toBe('excel')
    })
  })

  describe('data-cleaning', () => {
    it('should handle missing values and record stats', async () => {
      const input = createTableResult([{ a: 1 }, { a: null }, { a: 2 }])
      const config = { missingValueStrategy: 'mean', outlierMethod: 'none' }

      const result = await dataCleaningNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.data).toBeDefined()
      expect(legacy.stats.originalCount).toBe(3)
      expect(legacy.stats.missingFilled).toBe(1)
      expect(legacy.data[1].a).toBe(1.5)
    })

    it('should perform min-max scaling', async () => {
      const input = createTableResult([{ a: 0 }, { a: 5 }, { a: 10 }])
      const config = { scaling: 'minmax', targetColumns: ['a'] }

      const result = await dataCleaningNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.data[0].a).toBe(0)
      expect(legacy.data[1].a).toBe(0.5)
      expect(legacy.data[2].a).toBe(1)
    })

    it('should perform label encoding for string fields', async () => {
      const input = createTableResult([
        { category: 'A', value: 10 },
        { category: 'B', value: 20 },
        { category: 'A', value: 30 },
      ])
      const config = { encoding: 'label', targetColumns: ['category'] }

      const result = await dataCleaningNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(typeof legacy.data[0].category).toBe('number')
      expect(legacy.data[0].category).toBe(legacy.data[2].category)
      expect(legacy.data[0].category).not.toBe(legacy.data[1].category)
    })

    it('should remove duplicate full rows and keep the first occurrence', async () => {
      const input = createTableResult([
        { id: 'A1', batch: 'B1', score: 10 },
        { id: 'A1', batch: 'B1', score: 10 },
        { id: 'A2', batch: 'B2', score: 20 },
      ])

      const result = await dataCleaningNode.execute(input, {
        deduplicationMode: 'full_row',
        deduplicationKeep: 'first',
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([
        { id: 'A1', batch: 'B1', score: 10 },
        { id: 'A2', batch: 'B2', score: 20 },
      ])
      expect(legacy.stats.duplicatesRemoved).toBe(1)
      expect(legacy.stats.deduplicationMode).toBe('full_row')
      expect(legacy.stats.deduplicationKeep).toBe('first')
    })

    it('should deduplicate by selected fields and keep the last occurrence', async () => {
      const input = createTableResult([
        { batch: 'B1', step: '涂布', score: 10, version: 1 },
        { batch: 'B1', step: '涂布', score: 12, version: 2 },
        { batch: 'B2', step: '辊压', score: 8, version: 1 },
      ])

      const result = await dataCleaningNode.execute(input, {
        deduplicationMode: 'by_fields',
        deduplicationFields: ['batch', 'step'],
        deduplicationKeep: 'last',
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([
        { batch: 'B1', step: '涂布', score: 12, version: 2 },
        { batch: 'B2', step: '辊压', score: 8, version: 1 },
      ])
      expect(legacy.stats.duplicatesRemoved).toBe(1)
      expect(legacy.stats.deduplicationMode).toBe('by_fields')
      expect(legacy.stats.deduplicationKeep).toBe('last')
    })
  })

  describe('data-profiling', () => {
    it('should build a profiling report and keep upstream data', async () => {
      const input = createTableResult([
        { id: 'A001', target: 10, sensor_a: 1, sensor_b: null, ts: '2026-03-15T10:00:00Z' },
        { id: 'A002', target: 12, sensor_a: 2, sensor_b: null, ts: '2026-03-15T11:00:00Z' },
        { id: 'A003', target: 14, sensor_a: 3, sensor_b: 0, ts: '2026-03-15T12:00:00Z' },
      ])

      const result = await dataProfilingNode.execute(input, {
        targetField: 'target',
        topFields: 6,
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.data).toHaveLength(3)
      expect(legacy.metrics.fieldCount).toBe(5)
      expect(legacy.metrics.numericFieldCount).toBeGreaterThanOrEqual(3)
      expect(legacy.metrics.riskFieldCount).toBeGreaterThanOrEqual(1)
      expect(legacy.report.title).toBe('数据体检与字段画像')
      expect(legacy.report.sections[1].option.series[0].type).toBe('bar')
      expect(legacy.report.sections[2].option.series[0].type).toBe('pie')
      expect(legacy.report.sections[3].content).toContain('字段')
    })

    it('should report target usability, duplicate ratio, outlier ratio and risk level', async () => {
      const input = createTableResult([
        { target: 'A', sensor_a: 1, sensor_b: 10, batch_id: 'B1' },
        { target: 'A', sensor_a: 1, sensor_b: 10, batch_id: 'B1' },
        { target: 'B', sensor_a: 2, sensor_b: 11, batch_id: 'B2' },
        { target: 'C', sensor_a: 3, sensor_b: 12, batch_id: 'B3' },
        { target: 'D', sensor_a: 4, sensor_b: 200, batch_id: 'B4' },
      ])

      const result = await dataProfilingNode.execute(input, {
        targetField: 'target',
        topFields: 10,
      })

      const legacy = asLegacy(result)

      expect(legacy.metrics.duplicateRowCount).toBe(1)
      expect(legacy.metrics.duplicateRowRate).toBeCloseTo(0.2)
      expect(legacy.metrics.targetFieldUsability).toBe('classification')
      expect(legacy.report.sections[0].content).toContain('target')
      expect(legacy.report.sections[0].content).toContain('1')
      expect(legacy.report.sections[3].content).toContain('字段')
      expect(legacy.report.sections[3].content).toContain('20.0%')
      expect(legacy.report.sections[3].content).toContain('sensor_b')

      const sensorProfile = legacy.profile.find((item: any) => item.field === 'sensor_b')
      expect(sensorProfile.outlierRate).toBeCloseTo(0.2)
      expect(sensorProfile.riskLevel).toBe('high')
    })
  })

  describe('data-aggregation', () => {
    it('should aggregate multiple columns into one using the new nested schema', async () => {
      const input = createTableResult([
        { f1: 10, f2: 20, f3: 30 },
        { f1: 5, f2: 5, f3: 5 },
      ])
      const config = {
        mode: 'row_combine',
        aggregationGroups: [
          {
            targetFactorName: 'total',
            method: 'sum',
            inputColumns: ['f1', 'f2', 'f3'],
          },
        ],
      }

      const result = await dataAggregationNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.data[0].total).toBe(60)
      expect(legacy.data[1].total).toBe(15)
    })

    it('should aggregate rows into fixed time windows and output a new summary table', async () => {
      const input = createTableResult([
        { ts: '2026-03-28T10:05:00Z', value: 10, temp: 30 },
        { ts: '2026-03-28T10:40:00Z', value: 20, temp: 40 },
        { ts: '2026-03-28T11:10:00Z', value: 15, temp: 50 },
      ])

      const result = await dataAggregationNode.execute(input, {
        mode: 'time_window',
        timeField: 'ts',
        timeWindowSize: 1,
        timeWindowUnit: 'hour',
        timeWindowMethods: ['mean', 'sum'],
        targetColumns: ['value', 'temp'],
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([
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
      expect(legacy.stats.mode).toBe('time_window')
      expect(legacy.stats.windowCount).toBe(2)
      expect(legacy.stats.timeField).toBe('ts')
    })
  })

  describe('data-merge', () => {
    it('should append multiple datasets with union field alignment and source tags', async () => {
      const mergeNode = nodeDefinitions.find((definition) => definition.name === 'data-merge')

      const result = await mergeNode!.execute(
        {
          inputs: [
            {
              sourceNodeId: 'n1',
              sourceNodeLabel: 'Source A',
              result: createTableResult([{ id: 1, city: '上海' }]),
            },
            {
              sourceNodeId: 'n2',
              sourceNodeLabel: 'Source B',
              result: createTableResult([{ id: 2, score: 95 }]),
            },
          ],
        },
        {
          mergeMode: 'append',
          alignFieldsMode: 'union',
          fillMissingValue: 'null',
          addSourceTag: true,
          sourceTagName: '__source',
        },
      )

      const legacy = asLegacy(result)

      expect(mergeNode).toBeDefined()
      expect(legacy.data).toHaveLength(2)
      expect(legacy.data[0]).toEqual({ id: 1, city: '上海', score: null, __source: 'Source A' })
      expect(legacy.data[1]).toEqual({ id: 2, city: null, score: 95, __source: 'Source B' })
      expect(legacy.stats.inputCount).toBe(2)
      expect(legacy.stats.outputRows).toBe(2)
      expect(legacy.lineage.fields.score[0].sourceNodeId).toBe('n2')
    })

    it('should merge multiple inputs by configured source keys in join mode', async () => {
      const mergeNode = nodeDefinitions.find((definition) => definition.name === 'data-merge')

      const result = await mergeNode!.execute(
        {
          inputs: [
            {
              sourceNodeId: 'source-a',
              sourceNodeLabel: '来源A',
              result: createTableResult([
                { sku: 'A001', city: '上海', score: 91 },
                { sku: 'A002', city: '北京', score: 77 },
              ]),
            },
            {
              sourceNodeId: 'source-b',
              sourceNodeLabel: '来源B',
              result: createTableResult([
                { code: 'A001', target: 1 },
                { code: 'A003', target: 0 },
              ]),
            },
            {
              sourceNodeId: 'source-c',
              sourceNodeLabel: '来源C',
              result: createTableResult([
                { batchNo: 'A002', level: '高' },
                { batchNo: 'A004', level: '低' },
              ]),
            },
          ],
        },
        {
          mergeMode: 'join',
          unifiedKeyName: '样本编号',
          keyMappings: [
            { sourceNodeId: 'source-a', mergeKey: 'sku' },
            { sourceNodeId: 'source-b', mergeKey: 'code' },
            { sourceNodeId: 'source-c', mergeKey: 'batchNo' },
          ],
        } as any,
      )

      const legacy = asLegacy(result)

      expect(mergeNode).toBeDefined()
      expect(legacy.data).toEqual([
        { 样本编号: 'A001', city: '上海', score: 91, target: 1, level: null },
        { 样本编号: 'A002', city: '北京', score: 77, target: null, level: '高' },
        { 样本编号: 'A003', city: null, score: null, target: 0, level: null },
        { 样本编号: 'A004', city: null, score: null, target: null, level: '低' },
      ])
      expect(legacy.stats.inputCount).toBe(3)
      expect(legacy.stats.outputRows).toBe(4)
      expect(legacy.stats.unionKeyCount).toBe(4)
      expect(legacy.lineage.fields.target[0].sourceNodeId).toBe('source-b')
    })

    it('should suffix conflicting non-key fields from later inputs in join mode', async () => {
      const mergeNode = nodeDefinitions.find((definition) => definition.name === 'data-merge')

      const result = await mergeNode!.execute(
        {
          inputs: [
            {
              sourceNodeId: 'source-a',
              sourceNodeLabel: '来源A',
              result: createTableResult([{ id: 'A001', value: 1 }]),
            },
            {
              sourceNodeId: 'source-b',
              sourceNodeLabel: '来源B',
              result: createTableResult([{ code: 'A001', value: 2 }]),
            },
          ],
        },
        {
          mergeMode: 'join',
          unifiedKeyName: '统一编号',
          keyMappings: [
            { sourceNodeId: 'source-a', mergeKey: 'id' },
            { sourceNodeId: 'source-b', mergeKey: 'code' },
          ],
        } as any,
      )

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([{ 统一编号: 'A001', value: 1, value_来源B: 2 }])
      expect(legacy.stats.conflictFieldCount).toBe(1)
      expect(legacy.diagnostics.conflicts).toEqual(['value'])
    })

    it('should package multiple datasets into a collection for parallel analysis', async () => {
      const mergeNode = nodeDefinitions.find((definition) => definition.name === 'data-merge')

      const result = await mergeNode!.execute(
        {
          inputs: [
            {
              sourceNodeId: 'n1',
              sourceNodeLabel: 'Group A',
              result: createTableResult([{ val: 10 }]),
            },
            {
              sourceNodeId: 'n2',
              sourceNodeLabel: 'Group B',
              result: createTableResult([{ val: 20 }, { val: 30 }]),
            },
          ],
        },
        {
          mergeMode: 'collection',
        },
      )

      const legacy = asLegacy(result)

      expect(legacy.data).toHaveLength(2)
      expect(legacy.data[0]).toEqual({ name: 'Group A', data: [{ val: 10 }] })
      expect(legacy.data[1]).toEqual({ name: 'Group B', data: [{ val: 20 }, { val: 30 }] })
      expect(legacy.stats.groupCount).toBe(2)
      expect(legacy.stats.totalRows).toBe(3)
      expect(legacy.chartOption).not.toBeNull()
      expect(legacy.chartOption.xAxis.data).toEqual(['Group A', 'Group B'])
    })
  })

  describe('data-filter', () => {
    it('should filter rows by multiple conditions with all-match mode', async () => {
      const input = createTableResult([
        { city: '上海', score: 91, tag: 'A-1' },
        { city: '北京', score: 77, tag: 'B-2' },
        { city: '上海', score: 82, tag: 'A-2' },
        { city: '深圳', score: 95, tag: 'C-1' },
      ])

      const result = await dataFilterNode.execute(input, {
        matchMode: 'all',
        conditions: [
          { field: 'city', operator: 'equals', value: '上海' },
          { field: 'score', operator: 'gte', value: 85 },
        ],
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toHaveLength(1)
      expect(legacy.data[0]).toEqual({ city: '上海', score: 91, tag: 'A-1' })
      expect(legacy.stats.originalCount).toBe(4)
      expect(legacy.stats.filteredCount).toBe(1)
    })

    it('should filter rows by any-match mode with contains operator', async () => {
      const input = createTableResult([
        { city: '上海', score: 91, tag: 'A-1' },
        { city: '北京', score: 77, tag: 'B-2' },
        { city: '上海', score: 82, tag: 'A-2' },
        { city: '深圳', score: 95, tag: 'C-1' },
      ])

      const result = await dataFilterNode.execute(input, {
        matchMode: 'any',
        conditions: [
          { field: 'tag', operator: 'contains', value: 'B-' },
          { field: 'score', operator: 'gte', value: 95 },
        ],
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toHaveLength(2)
      expect(legacy.data.map((row: any) => row.city)).toEqual(['北京', '深圳'])
    })
  })

  describe('js-transform', () => {
    it('should expose the JS transform node with Chinese labels and code defaults', () => {
      expect(jsTransformNode.displayName).toBe('JS代码执行')
      expect(jsTransformNode.category).toBe('action')
      expect(jsTransformNode.properties.find((property) => property.name === 'code')?.type).toBe(
        'json',
      )
      expect(
        jsTransformNode.properties.find((property) => property.name === 'code')?.editorLanguage,
      ).toBe('javascript')
      expect(
        jsTransformNode.properties.find((property) => property.name === 'code')?.editorDeclarations,
      ).toContain('declare const rows')
    })

    it('should transform table rows and keep standardized table output', async () => {
      const result = await jsTransformNode.execute(
        createTableResult([
          { city: '上海', score: 91 },
          { city: '北京', score: 77 },
        ]),
        {
          code: `return rows.map((row) => ({
            城市: row.city,
            得分: row.score,
            是否达标: row.score >= 80,
          }))`,
        },
      )

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([
        { 城市: '上海', 得分: 91, 是否达标: true },
        { 城市: '北京', 得分: 77, 是否达标: false },
      ])
      expect(legacy.stats.inputCount).toBe(2)
      expect(legacy.stats.outputCount).toBe(2)
      expect(legacy.lineage.transform).toBe('js-transform')
    })

    it('should reject non-array return values with readable Chinese errors', async () => {
      await expect(
        jsTransformNode.execute(createTableResult([{ score: 91 }]), {
          code: 'return { score: 91 }',
        }),
      ).rejects.toThrow('JS代码执行节点必须返回数组对象列表')
    })
  })

  describe('field-selection', () => {
    it('should keep only selected fields in include mode', async () => {
      const input = createTableResult([
        { id: 1, city: '上海', score: 91, target: 1 },
        { id: 2, city: '北京', score: 77, target: 0 },
      ])

      const result = await fieldSelectionNode.execute(input, {
        mode: 'include',
        fields: ['city', 'score'],
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([
        { city: '上海', score: 91 },
        { city: '北京', score: 77 },
      ])
      expect(legacy.stats.originalFieldCount).toBe(4)
      expect(legacy.stats.outputFieldCount).toBe(2)
      expect(legacy.stats.mode).toBe('include')
    })

    it('should remove selected fields in exclude mode', async () => {
      const input = createTableResult([
        { id: 1, city: '上海', score: 91, target: 1 },
        { id: 2, city: '北京', score: 77, target: 0 },
      ])

      const result = await fieldSelectionNode.execute(input, {
        mode: 'exclude',
        fields: ['target'],
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([
        { id: 1, city: '上海', score: 91 },
        { id: 2, city: '北京', score: 77 },
      ])
      expect(legacy.stats.outputFieldCount).toBe(3)
    })
  })

  describe('sort', () => {
    it('should sort rows by multiple priority rules', async () => {
      const input = createTableResult([
        { city: '上海', score: 82, order: 3 },
        { city: '北京', score: 91, order: 2 },
        { city: '上海', score: 91, order: 1 },
        { city: '北京', score: 91, order: 4 },
      ])

      const result = await sortNode.execute(input, {
        sortRules: [
          { field: 'score', direction: 'desc' },
          { field: 'city', direction: 'asc' },
          { field: 'order', direction: 'asc' },
        ],
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([
        { city: '北京', score: 91, order: 2 },
        { city: '北京', score: 91, order: 4 },
        { city: '上海', score: 91, order: 1 },
        { city: '上海', score: 82, order: 3 },
      ])
      expect(legacy.stats.ruleCount).toBe(3)
    })
  })

  describe('data-limit', () => {
    it('should keep the last n rows in tail mode', async () => {
      const input = createTableResult([
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
      ])

      const result = await dataLimitNode.execute(input, {
        mode: 'tail',
        limit: 2,
      })

      const legacy = asLegacy(result)

      expect(legacy.data).toEqual([{ id: 3 }, { id: 4 }])
      expect(legacy.stats.originalCount).toBe(4)
      expect(legacy.stats.outputCount).toBe(2)
      expect(legacy.stats.mode).toBe('tail')
    })
  })

  describe('algorithms', () => {
    it('should build shap report with summary, all features, and supplement assets', async () => {
      const input = createTableResult([
        { target: 1, f1: 2, f2: 3, f3: 4 },
        { target: 2, f1: 3, f2: 4, f3: 5 },
      ])
      const config = { targetField: 'target' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: {
            summary: {
              targetField: 'target',
              sampleCount: 2,
              featureCount: 3,
              r2: 0.85,
              mae: 0.1,
            },
            importance: [
              { name: 'f1', value: 0.5, rank: 1 },
              { name: 'f2', value: 0.3, rank: 2 },
              { name: 'f3', value: 0.2, rank: 3 },
            ],
            dependence: [
              { feature: 'f1', x: [1, 2], shap: [0.1, 0.2] },
              { feature: 'f2', x: [2, 3], shap: [0.2, 0.3] },
              { feature: 'f3', x: [3, 4], shap: [0.3, 0.4] },
            ],
            assets: {
              beeswarmImage: 'base64_beeswarm',
              dependenceImages: [{ feature: 'f1', image: 'base64_f1' }],
              fullReportImage: 'base64_full',
            },
          },
        }),
      }) as any

      const result = await xgboostShapNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report).toBeDefined()
      expect(legacy.report.title).toContain('Xgboost')
      expect(legacy.report.metadata).toMatchObject({
        targetField: 'target',
        sampleCount: 2,
        featureCount: 3,
        r2: 0.85,
        mae: 0.1,
      })
      expect(legacy.report.sections).toBeDefined()
      expect(legacy.report.sections.some((section: any) => section.type === 'summary')).toBe(true)
      expect(legacy.report.sections.some((section: any) => section.key === 'importance')).toBe(true)
      expect(legacy.report.sections.some((section: any) => section.key === 'dependence')).toBe(true)
      expect(
        legacy.report.sections.find((section: any) => section.key === 'dependence').items,
      ).toHaveLength(3)
      expect(legacy.report.supplements.fullReportImage).toBe('data:image/png;base64,base64_full')
      expect(legacy.report.supplements.beeswarmImage).toBe('data:image/png;base64,base64_beeswarm')
      expect(global.fetch).toHaveBeenCalledWith('/api/analysis/xgboost-shap', expect.any(Object))
    })

    it('should normalize real lasso backend results', async () => {
      const input = createTableResult([
        { target: 1, f1: 2, f2: 1 },
        { target: 2, f1: 3, f2: 1 },
      ])
      const config = { targetField: 'target' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: {
            summary: {
              targetField: 'target',
              sampleCount: 32,
              featureCount: 2,
              selectedFeatureCount: 1,
              alpha: 0.018,
              r2: 0.9521,
              mae: 0.1022,
            },
            coefficients: [
              {
                name: 'f1',
                coefficient: 2.3,
                absCoefficient: 2.3,
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
                { feature: 'f1', coefficients: [0, 1.2, 2.3] },
                { feature: 'f2', coefficients: [0, 0, 0] },
              ],
            },
          },
        }),
      }) as any

      const result = await lassoNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Lasso 回归分析')
      expect(legacy.metrics.alpha).toBe(0.018)
      expect(legacy.metrics.selectedFeatureCount).toBe(1)
      expect(legacy.report.sections[0].type).toBe('summary')
      expect(legacy.report.sections[1].title).toBe('特征系数排序')
      expect(legacy.report.sections[2].title).toBe('正则路径')
      expect(global.fetch).toHaveBeenCalledWith('/api/analysis/lasso', expect.any(Object))
    })

    it('should normalize multiple linear regression backend results', async () => {
      const input = createTableResult([
        { target: 10, f1: 1, f2: 3 },
        { target: 14, f1: 2, f2: 4 },
        { target: 18, f1: 3, f2: 5 },
      ])
      const config = { targetField: 'target', factorNames: ['f1', 'f2'] }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: {
            summary: {
              targetField: 'target',
              sampleCount: 36,
              featureCount: 2,
              r2: 0.9821,
              adjustedR2: 0.9803,
              mae: 0.3562,
              intercept: 1.245,
            },
            coefficients: [
              { name: 'f1', coefficient: 2.5, absCoefficient: 2.5, pValue: 0.0001, rank: 1 },
              { name: 'f2', coefficient: 1.1, absCoefficient: 1.1, pValue: 0.0132, rank: 2 },
            ],
            predictions: {
              actual: [10, 14, 18],
              predicted: [10.2, 13.8, 18.1],
            },
            residuals: {
              fitted: [10.2, 13.8, 18.1],
              residuals: [-0.2, 0.2, -0.1],
            },
          },
        }),
      }) as any

      const result = await multipleLinearRegressionNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('多元线性回归分析')
      expect(legacy.metrics.adjustedR2).toBe(0.9803)
      expect(legacy.metrics.intercept).toBe(1.245)
      expect(legacy.report.sections[0].type).toBe('summary')
      expect(legacy.report.sections[1].title).toBe('回归系数排序')
      expect(legacy.report.sections[2].title).toBe('预测值对比')
      expect(legacy.report.sections[3].title).toBe('残差分布')
      expect(legacy.report.sections[2].option.xAxis.name).toBe('实际值')
      expect(legacy.report.sections[2].option.yAxis.name).toBe('预测值')
      expect(legacy.report.sections[2].option.series[0].type).toBe('scatter')
      expect(legacy.report.sections[2].option.series[1].name).toBe('理想拟合线')
      expect(legacy.report.sections[2].option.series[1].lineStyle.type).toBe('dashed')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/analysis/multiple-linear-regression',
        expect.any(Object),
      )
    })

    it('should normalize random forest feature importance backend results', async () => {
      const input = createTableResult([
        { target: 10, f1: 1, f2: 3, f3: 8 },
        { target: 14, f1: 2, f2: 4, f3: 7 },
        { target: 18, f1: 3, f2: 5, f3: 6 },
      ])
      const config = { targetField: 'target', factorNames: ['f1', 'f2', 'f3'] }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: {
            summary: {
              targetField: 'target',
              sampleCount: 48,
              featureCount: 3,
              r2: 0.9412,
              mae: 0.4281,
              nEstimators: 300,
              maxDepth: 10,
            },
            importance: [
              { name: 'f1', value: 0.58, rank: 1 },
              { name: 'f2', value: 0.29, rank: 2 },
              { name: 'f3', value: 0.13, rank: 3 },
            ],
            cumulativeImportance: [
              { name: 'f1', cumulativeValue: 0.58, rank: 1 },
              { name: 'f2', cumulativeValue: 0.87, rank: 2 },
              { name: 'f3', cumulativeValue: 1, rank: 3 },
            ],
            predictions: {
              actual: [10, 14, 18],
              predicted: [10.3, 13.7, 18.5],
            },
            risks: [
              {
                code: 'top_feature_dominance',
                level: 'low',
                title: '头部因子贡献集中',
                message: '前 1 个因子已覆盖主要解释度，可优先关注。',
              },
            ],
          },
        }),
      }) as any

      const result = await randomForestFeatureImportanceNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('随机森林特征重要性')
      expect(legacy.metrics.nEstimators).toBe(300)
      expect(legacy.metrics.maxDepth).toBe(10)
      expect(legacy.report.sections[0].type).toBe('summary')
      expect(legacy.report.sections[1].title).toBe('特征重要性排行')
      expect(legacy.report.sections[2].title).toBe('累计重要性')
      expect(legacy.report.sections[3].title).toBe('预测值对比')
      expect(legacy.report.sections[4].title).toBe('结果解读提示')
      expect(legacy.report.sections[3].option.xAxis.name).toBe('实际值')
      expect(legacy.report.sections[3].option.yAxis.name).toBe('预测值')
      expect(legacy.report.sections[3].option.series[0].type).toBe('scatter')
      expect(legacy.report.sections[3].option.series[1].name).toBe('理想拟合线')
      expect(legacy.report.sections[3].option.series[1].lineStyle.type).toBe('dashed')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/analysis/random-forest-feature-importance',
        expect.any(Object),
      )
    })

    it('should calculate pearson correlations from numeric data', async () => {
      const input = createTableResult([
        { target: 1, f1: 1, f2: 10 },
        { target: 2, f1: 2, f2: 8 },
        { target: 3, f1: 3, f2: 6 },
        { target: 4, f1: 4, f2: 4 },
        { target: 5, f1: 5, f2: 2 },
      ])

      const result = await pearsonNode.execute(input, {
        xFields: ['f1', 'f2'],
        yFields: ['target'],
        topN: 5,
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Pearson 相关系数矩阵分析')
      expect(legacy.metrics.xFieldCount).toBe(2)
      expect(legacy.metrics.yFieldCount).toBe(1)
      expect(legacy.metrics.numericFieldCount).toBe(3)
      expect(legacy.metrics.minPairSampleSize).toBe(5)
      expect(legacy.metrics.maxPairSampleSize).toBe(5)
      expect(legacy.report.sections).toHaveLength(5)
      expect(legacy.report.sections[1].option.series[0].type).toBe('heatmap')
      expect(legacy.report.sections[1].option.visualMap.top).toBe(8)
      expect(legacy.report.sections[2].controls.select.options).toEqual(['target'])
      expect(legacy.report.sections[2].option.series[0].data[0].value).toBe(1)
      expect(legacy.report.sections[0].type).toBe('summary')
      expect(legacy.report.sections[0].cards[0].label).toBe('样本行数')
      expect(legacy.report.sections[3].title).toBe('结果可信提示')
      expect(legacy.report.sections[3].type).toBe('risk-list')
      expect(legacy.report.sections[4].content).toContain('Y字段')
      expect(Array.isArray(legacy.meta?.risks)).toBe(true)
    })

    it('should calculate vif and flag highly collinear fields', async () => {
      const input = createTableResult([
        { f1: 1, f2: 2.01, f3: 10 },
        { f1: 2, f2: 4.02, f3: 8 },
        { f1: 3, f2: 6.01, f3: 6 },
        { f1: 4, f2: 8.03, f3: 4 },
        { f1: 5, f2: 10.05, f3: 2 },
        { f1: 6, f2: 12.04, f3: 1 },
      ])

      const result = await vifNode.execute(input, {
        factorNames: ['f1', 'f2', 'f3'],
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('VIF 共线性检测')
      expect(legacy.metrics.featureCount).toBe(3)
      expect(legacy.report.sections[0].type).toBe('summary')
      expect(legacy.report.sections[1].title).toBe('VIF 排序')
      expect(legacy.report.sections[2].title).toBe('共线性风险提示')

      const highRisk = legacy.meta?.risks?.find((risk: any) => risk.code === 'high_vif')
      expect(highRisk).toBeDefined()
      expect(highRisk.message).toContain('f1')
    })

    it('should calculate spearman correlations for monotonic but non-linear data', async () => {
      const input = createTableResult([
        { target: 1, f1: 1, f2: 25 },
        { target: 2, f1: 4, f2: 20 },
        { target: 3, f1: 9, f2: 15 },
        { target: 4, f1: 16, f2: 10 },
        { target: 5, f1: 25, f2: 5 },
      ])

      const result = await spearmanNode.execute(input, {
        xFields: ['f1', 'f2'],
        yFields: ['target'],
        topN: 5,
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Spearman 秩相关矩阵分析')
      expect(legacy.metrics.yFields).toEqual(['target'])
      expect(legacy.report.sections[1].option.series[0].name).toBe('Spearman ρ')
      expect(legacy.report.sections[2].option.xAxis.name).toBe('Spearman ρ')
      expect(legacy.report.sections[2].option.series[0].data[0].value).toBe(1)
      expect(legacy.report.sections[2].option.series[0].data[1].value).toBe(-1)
      expect(legacy.report.sections[4].content).toContain('target')
    })

    it('should calculate kendall correlations and rank inverse monotonic fields', async () => {
      const input = createTableResult([
        { target: 1, f1: 5, f2: 1 },
        { target: 2, f1: 4, f2: 2 },
        { target: 3, f1: 3, f2: 3 },
        { target: 4, f1: 2, f2: 4 },
        { target: 5, f1: 1, f2: 5 },
      ])

      const result = await kendallNode.execute(input, {
        xFields: ['f1', 'f2'],
        yFields: ['target'],
        topN: 5,
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Kendall 秩相关矩阵分析')
      expect(legacy.metrics.xFields).toEqual(['f1', 'f2'])
      expect(legacy.report.sections[1].option.series[0].name).toBe('Kendall τ')
      expect(legacy.report.sections[2].option.xAxis.name).toBe('Kendall τ')
      expect(legacy.report.sections[2].option.series[0].data[0].value).toBe(-1)
      expect(legacy.report.sections[2].option.series[0].data[1].value).toBe(1)
      expect(legacy.report.sections[4].content).toContain('f1')
    })

    it('should reject non-numeric selected fields for correlation analysis', async () => {
      const input = createTableResult([
        { target: 1, f1: 1, category: 'A' },
        { target: 2, f1: 2, category: 'B' },
        { target: 3, f1: 3, category: 'C' },
      ])

      await expect(
        pearsonNode.execute(input, {
          xFields: ['category'],
          yFields: ['target'],
          topN: 5,
        }),
      ).rejects.toThrow('X 字段中以下字段不支持相关性分析：category')
    })

    it('should reject missing selected fields for correlation analysis', async () => {
      const input = createTableResult([
        { target: 1, f1: 1 },
        { target: 2, f1: 2 },
        { target: 3, f1: 3 },
      ])

      await expect(
        pearsonNode.execute(input, {
          xFields: ['missingField'],
          yFields: ['target'],
          topN: 5,
        }),
      ).rejects.toThrow('X 字段中以下字段不存在：missingField')
    })

    it('should report insufficient data quality separately from field type errors', async () => {
      const input = createTableResult([
        { target: 1, f1: 1 },
        { target: null, f1: 2 },
        { target: 3, f1: null },
      ])

      await expect(
        pearsonNode.execute(input, {
          xFields: ['f1'],
          yFields: ['target'],
          topN: 5,
        }),
      ).rejects.toThrow('所选字段缺少足够的有效样本，无法完成相关性分析')
    })

    it('should flag high collinearity between x fields when they are strongly correlated', async () => {
      const input = createTableResult([
        { target: 10, f1: 1, f2: 2, f3: 8 },
        { target: 12, f1: 2, f2: 4, f3: 7 },
        { target: 14, f1: 3, f2: 6, f3: 6 },
        { target: 16, f1: 4, f2: 8, f3: 5 },
        { target: 18, f1: 5, f2: 10, f3: 4 },
        { target: 20, f1: 6, f2: 12, f3: 3 },
      ])

      const result = await pearsonNode.execute(input, {
        xFields: ['f1', 'f2', 'f3'],
        yFields: ['target'],
        topN: 5,
      })

      const legacy = asLegacy(result)
      const collinearityRisk = legacy.meta?.risks?.find(
        (risk: any) => risk.code === 'high_collinearity',
      )

      expect(collinearityRisk).toBeDefined()
      expect(collinearityRisk.title).toBe('字段高度共线')
      expect(collinearityRisk.message).toContain('f1 / f2')
    })

    describe('correlation validation for other methods', () => {
      it('spearman rejects non-numeric selected fields', async () => {
        const input = createTableResult([
          { target: 1, f1: 1, category: 'A' },
          { target: 2, f1: 2, category: 'B' },
          { target: 3, f1: 3, category: 'C' },
        ])

        await expect(
          spearmanNode.execute(input, {
            xFields: ['category'],
            yFields: ['target'],
            topN: 5,
          }),
        ).rejects.toThrow('X 字段中以下字段不支持相关性分析：category')
      })

      it('spearman rejects missing selected fields', async () => {
        const input = createTableResult([
          { target: 1, f1: 1 },
          { target: 2, f1: 2 },
          { target: 3, f1: 3 },
        ])

        await expect(
          spearmanNode.execute(input, {
            xFields: ['f1'],
            yFields: ['missingField'],
            topN: 5,
          }),
        ).rejects.toThrow('Y 字段中以下字段不存在：missingField')
      })

      it('spearman surfaces insufficient sample quality', async () => {
        const input = createTableResult([
          { target: 1, f1: 1 },
          { target: null, f1: 2 },
          { target: 3, f1: null },
        ])

        await expect(
          spearmanNode.execute(input, {
            xFields: ['f1'],
            yFields: ['target'],
            topN: 5,
          }),
        ).rejects.toThrow('所选字段缺少足够的有效样本，无法完成相关性分析')
      })

      it('kendall rejects non-numeric selected fields', async () => {
        const input = createTableResult([
          { target: 1, f1: 1, category: 'A' },
          { target: 2, f1: 2, category: 'B' },
          { target: 3, f1: 3, category: 'C' },
        ])

        await expect(
          kendallNode.execute(input, {
            xFields: ['category'],
            yFields: ['target'],
            topN: 5,
          }),
        ).rejects.toThrow('X 字段中以下字段不支持相关性分析：category')
      })

      it('kendall rejects missing selected fields', async () => {
        const input = createTableResult([
          { target: 1, f1: 1 },
          { target: 2, f1: 2 },
          { target: 3, f1: 3 },
        ])

        await expect(
          kendallNode.execute(input, {
            xFields: ['f1'],
            yFields: ['missingField'],
            topN: 5,
          }),
        ).rejects.toThrow('Y 字段中以下字段不存在：missingField')
      })

      it('kendall surfaces insufficient sample quality', async () => {
        const input = createTableResult([
          { target: 1, f1: 1 },
          { target: null, f1: 2 },
          { target: 3, f1: null },
        ])

        await expect(
          kendallNode.execute(input, {
            xFields: ['f1'],
            yFields: ['target'],
            topN: 5,
          }),
        ).rejects.toThrow('所选字段缺少足够的有效样本，无法完成相关性分析')
      })
    })
  })

  describe('neighbor-system', () => {
    it('should fetch board data through the integration bridge', async () => {
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

      const config = {
        productName: '试制产品 A1',
        fetchMode: 'time',
        timeRange: [new Date('2026-03-01'), new Date('2026-03-10')],
        materialType: '正极',
        selectedFactors: {
          'factor:涂布::F_TEMP': { checked: true },
          'factor:涂布::F_PRESS': { checked: true },
        },
        selectedProcesses: ['装配'],
      }

      const result = await neighborSystemNode.execute(null, config)

      const legacy = asLegacy(result)

      expect(mockFetchKanbanData).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'token-from-host',
          productName: '试制产品 A1',
          fetchMode: 'time',
          materialType: '正极',
          factorKeys: ['F_TEMP', 'F_PRESS'],
          processList: ['装配'],
        }),
      )
      expect(legacy.data).toEqual([
        { sn: 'SN001', F_TEMP: 12.3, F_PRESS: 45.6 },
        { sn: 'SN002', F_TEMP: 22.3, F_PRESS: 55.6 },
      ])
      expect(legacy.metadata.factors_count).toBe(2)
      expect(legacy.metadata.product).toBe('试制产品 A1')
      expect(legacy.metadata.fetch_mode).toBe('time')
    })

    it('should throw error if no factors are selected', async () => {
      mockGetResolvedKanbanAuthToken.mockReturnValue('token-from-host')
      const config = {
        fetchMode: 'sn',
        snList: 'SN001',
        productName: '试制产品 A1',
        selectedProcesses: ['涂布'],
        selectedFactors: {},
      }

      await expect(neighborSystemNode.execute(null, config)).rejects.toThrow(
        '请至少选择一个因子进行获取',
      )
    })

    it('should require a token from the host system', async () => {
      mockGetResolvedKanbanAuthToken.mockImplementation(() => {
        throw new Error('未接收到宿主系统传入的访问凭证')
      })

      await expect(
        neighborSystemNode.execute(null, {
          productName: '试制产品 A1',
          fetchMode: 'sn',
          snList: 'SN001',
          selectedProcesses: ['涂布'],
          selectedFactors: { 'factor:涂布::F_TEMP': { checked: true } },
        }),
      ).rejects.toThrow('未接收到宿主系统传入的访问凭证')
    })

    it('should require explicit processes from runtime input instead of inferring them from factors', async () => {
      mockGetResolvedKanbanAuthToken.mockReturnValue('token-from-host')

      await expect(
        neighborSystemNode.execute(null, {
          productName: '试制产品 A1',
          fetchMode: 'sn',
          snList: 'SN001',
          selectedFactors: { 'factor:涂布::F_TEMP': { checked: true } },
          selectedProcesses: [],
        }),
      ).rejects.toThrow('请至少选择一个工序')
    })
  })

  describe('chart-display', () => {
    it('should generate scatter chart option', async () => {
      const input = createTableResult([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ])
      const config = { chartType: 'scatter', xAxis: 'x', yAxis: 'y' }

      const result = await chartDisplayNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('chart')
      expect(legacy.chartOption.series[0].type).toBe('scatter')
    })

    it('should generate bar chart option', async () => {
      const input = createTableResult([
        { x: 'A', y: 10 },
        { x: 'B', y: 20 },
      ])
      const config = { chartType: 'bar', xAxis: 'x', yAxis: 'y' }

      const result = await chartDisplayNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('chart')
      expect(legacy.chartOption.series[0].type).toBe('bar')
    })

    it('should generate histogram distribution chart option', async () => {
      const input = createTableResult([
        { score: 10 },
        { score: 12 },
        { score: 18 },
        { score: 21 },
        { score: 24 },
        { score: 30 },
      ])

      const result = await chartDisplayNode.execute(input, {
        chartType: 'histogram',
        yAxis: 'score',
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('chart')
      expect(legacy.chartOption.series[0].type).toBe('bar')
      expect(legacy.chartOption.xAxis.type).toBe('category')
      expect(legacy.chartOption.xAxis.name).toBe('score 分箱区间')
      expect(legacy.chartOption.yAxis.name).toBe('样本数')
      expect(legacy.meta?.chartType).toBe('histogram')
      expect(legacy.meta?.yAxis).toBe('score')
      expect(legacy.meta?.binCount).toBeGreaterThan(1)
      expect(legacy.chartOption.series[0].data).toHaveLength(legacy.meta?.binCount)
    })

    it('should not mutate grouped collection input when rendering non-boxplot charts', async () => {
      const input = createTableCollectionResult([
        {
          name: '组一',
          data: [
            { f1: 1, target: 2 },
            { f1: 3, target: 4 },
          ],
        },
        {
          name: '组二',
          data: [
            { f1: 5, target: 6 },
            { f1: 7, target: 8 },
          ],
        },
      ])
      const snapshot = JSON.parse(JSON.stringify(input))

      const result = await chartDisplayNode.execute(input, {
        chartType: 'scatter',
        xAxis: 'f1',
        yAxis: 'target',
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('chart')
      expect(input).toEqual(snapshot)
    })
  })

  describe('data-export', () => {
    it('should generate export info for CSV', async () => {
      const input = createTableResult([{ a: 1, b: 2 }])
      const config = { format: 'csv', filename: 'test_export' }

      const result = await dataExportNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('export')
      expect(legacy.exportInfo.filename).toBe('test_export.csv')
      expect(legacy.exportInfo.url).toBe('blob:mock-url')
    })

    it('should generate export info for JSON', async () => {
      const input = createTableResult([{ a: 1, b: 2 }])
      const config = { format: 'json', filename: 'test_export' }

      const result = await dataExportNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('export')
      expect(legacy.exportInfo.filename).toBe('test_export.json')
    })

    it('should generate on-demand pdf export info for report inputs', async () => {
      const input = createReportResult({
        title: '多元线性回归分析',
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '模型摘要',
            cards: [{ label: '样本量', value: 48 }],
          },
        ],
        supplements: {
          fullReportImage: 'data:image/png;base64,base64_full',
          beeswarmImage: 'data:image/png;base64,base64_beeswarm',
          dependenceImages: [{ feature: 'f1', image: 'data:image/png;base64,base64_dep_1' }],
        },
      })

      const result = await dataExportNode.execute(input, {
        format: 'pdf',
        filename: '回归分析报告',
      })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('export')
      expect(legacy.exportInfo.filename).toMatch(/^回归分析报告_\d{8}_\d{6}\.pdf$/)
      expect(legacy.exportInfo.format).toBe('pdf')
      expect(legacy.exportInfo.url).toBeUndefined()
      expect(legacy.exportInfo.contentKind).toBe('report-pdf')
      expect(legacy.exportInfo.report.title).toBe('多元线性回归分析')
      expect(legacy.exportInfo.report.supplements).toEqual({})
      expect(legacy.meta?.sourceKind).toBe('report')
    })

    it('should reject non-pdf exports for report inputs with a clear message', async () => {
      const input = createReportResult({
        title: 'Pearson 相关系数矩阵分析',
        sections: [],
      })

      await expect(
        dataExportNode.execute(input, {
          format: 'csv',
          filename: 'report_export',
        }),
      ).rejects.toThrow('分析报告当前仅支持 PDF 导出')
    })
  })
})


