import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

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

import { fileImportNode } from '../definitions/fileImport'
import { dataCleaningNode } from '../definitions/dataCleaning'
import { dataProfilingNode } from '../definitions/dataProfiling'
import { dataAggregationNode } from '../definitions/dataAggregation'
import { dataFilterNode } from '../definitions/dataFilter'
import { xgboostShapNode } from '../definitions/xgboostShap'
import { neighborSystemNode } from '../definitions/neighborSystem'
import { chartDisplayNode } from '../definitions/chartDisplay'
import { dataExportNode } from '../definitions/dataExport'
import { lassoNode } from '../definitions/lasso'
import { pearsonNode } from '../definitions/pearson'
import { spearmanNode } from '../definitions/spearman'
import { kendallNode } from '../definitions/kendall'
import { nodeDefinitions } from '../registry'
import { withResultAliases } from '../result'

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

const asLegacy = (result: unknown) => withResultAliases(result as any) as any

describe('Node Definitions Execution Logic', () => {
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
      const input = { data: [{ a: 1 }, { a: null }, { a: 2 }] }
      const config = { missingValueStrategy: 'mean', outlierMethod: 'none' }

      const result = await dataCleaningNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.data).toBeDefined()
      expect(legacy.stats.originalCount).toBe(3)
      expect(legacy.stats.missingFilled).toBe(1)
      expect(legacy.data[1].a).toBe(1.5)
    })

    it('should perform min-max scaling', async () => {
      const input = {
        data: [{ a: 0 }, { a: 5 }, { a: 10 }],
      }
      const config = { scaling: 'minmax', targetColumns: ['a'] }

      const result = await dataCleaningNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.data[0].a).toBe(0)
      expect(legacy.data[1].a).toBe(0.5)
      expect(legacy.data[2].a).toBe(1)
    })

    it('should perform label encoding for string fields', async () => {
      const input = {
        data: [
          { category: 'A', value: 10 },
          { category: 'B', value: 20 },
          { category: 'A', value: 30 },
        ],
      }
      const config = { encoding: 'label', targetColumns: ['category'] }

      const result = await dataCleaningNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(typeof legacy.data[0].category).toBe('number')
      expect(legacy.data[0].category).toBe(legacy.data[2].category)
      expect(legacy.data[0].category).not.toBe(legacy.data[1].category)
    })
  })

  describe('data-profiling', () => {
    it('should build a profiling report and keep upstream data', async () => {
      const input = {
        data: [
          { id: 'A001', target: 10, sensor_a: 1, sensor_b: null, ts: '2026-03-15T10:00:00Z' },
          { id: 'A002', target: 12, sensor_a: 2, sensor_b: null, ts: '2026-03-15T11:00:00Z' },
          { id: 'A003', target: 14, sensor_a: 3, sensor_b: 0, ts: '2026-03-15T12:00:00Z' },
        ],
      }

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
      const input = {
        data: [
          { target: 'A', sensor_a: 1, sensor_b: 10, batch_id: 'B1' },
          { target: 'A', sensor_a: 1, sensor_b: 10, batch_id: 'B1' },
          { target: 'B', sensor_a: 2, sensor_b: 11, batch_id: 'B2' },
          { target: 'C', sensor_a: 3, sensor_b: 12, batch_id: 'B3' },
          { target: 'D', sensor_a: 4, sensor_b: 200, batch_id: 'B4' },
        ],
      }

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
      const input = {
        data: [
          { f1: 10, f2: 20, f3: 30 },
          { f1: 5, f2: 5, f3: 5 },
        ],
      }
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
              payload: { data: [{ id: 1, city: '上海' }] },
            },
            {
              sourceNodeId: 'n2',
              sourceNodeLabel: 'Source B',
              payload: { data: [{ id: 2, score: 95 }] },
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

    it('should left-join datasets and suffix conflicting fields', async () => {
      const mergeNode = nodeDefinitions.find((definition) => definition.name === 'data-merge')

      const result = await mergeNode!.execute(
        {
          inputs: [
            {
              sourceNodeId: 'base',
              sourceNodeLabel: 'Base',
              payload: {
                data: [
                  { id: 1, city: '上海', value: 10 },
                  { id: 2, city: '北京', value: 20 },
                ],
              },
            },
            {
              sourceNodeId: 'extra',
              sourceNodeLabel: 'Extra',
              payload: {
                data: [
                  { id: 1, value: 99, score: 90 },
                  { id: 3, value: 88, score: 70 },
                ],
              },
            },
          ],
        },
        {
          mergeMode: 'join',
          joinType: 'left',
          baseJoinKey: 'id',
          conflictStrategy: 'suffix',
          suffixMode: 'source_label',
          dropDuplicateKeyFields: true,
        },
      )

      const legacy = asLegacy(result)

      expect(mergeNode).toBeDefined()
      expect(legacy.data).toHaveLength(2)
      expect(legacy.data[0]).toEqual({ id: 1, city: '上海', value: 10, value_Extra: 99, score: 90 })
      expect(legacy.data[1]).toEqual({
        id: 2,
        city: '北京',
        value: 20,
        value_Extra: null,
        score: null,
      })
      expect(legacy.stats.outputRows).toBe(2)
      expect(legacy.stats.matchedRows).toBe(1)
      expect(legacy.stats.conflictFieldCount).toBe(1)
      expect(legacy.diagnostics.conflicts[0].field).toBe('value')
      expect(legacy.lineage.fields.score[0].sourceNodeId).toBe('extra')
    })

    it('should package multiple datasets into a collection for parallel analysis', async () => {
      const mergeNode = nodeDefinitions.find((definition) => definition.name === 'data-merge')

      const result = await mergeNode!.execute(
        {
          inputs: [
            {
              sourceNodeId: 'n1',
              sourceNodeLabel: 'Group A',
              payload: { data: [{ val: 10 }] },
            },
            {
              sourceNodeId: 'n2',
              sourceNodeLabel: 'Group B',
              payload: { data: [{ val: 20 }, { val: 30 }] },
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
      const input = {
        data: [
          { city: '上海', score: 91, tag: 'A-1' },
          { city: '北京', score: 77, tag: 'B-2' },
          { city: '上海', score: 82, tag: 'A-2' },
          { city: '深圳', score: 95, tag: 'C-1' },
        ],
      }

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
      const input = {
        data: [
          { city: '上海', score: 91, tag: 'A-1' },
          { city: '北京', score: 77, tag: 'B-2' },
          { city: '上海', score: 82, tag: 'A-2' },
          { city: '深圳', score: 95, tag: 'C-1' },
        ],
      }

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

  describe('algorithms', () => {
    it('should build shap report with summary, all features, and supplement assets', async () => {
      const input = {
        data: [
          { target: 1, f1: 2, f2: 3, f3: 4 },
          { target: 2, f1: 3, f2: 4, f3: 5 },
        ],
      }
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
      expect(legacy.report.sections.some((section: any) => section.key === 'details')).toBe(true)
      expect(
        legacy.report.sections.find((section: any) => section.key === 'details').items,
      ).toHaveLength(3)
      expect(legacy.report.supplements.fullReportImage).toBe('data:image/png;base64,base64_full')
      expect(legacy.report.supplements.beeswarmImage).toBe('data:image/png;base64,base64_beeswarm')
    })

    it('should simulate lasso result', async () => {
      const input = { data: [{ target: 1, f1: 2 }] }
      const config = { targetLabel: 'target' }

      const result = await lassoNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Lasso 回归分析')
    })

    it('should calculate pearson correlations from numeric data', async () => {
      const input = {
        data: [
          { target: 1, f1: 1, f2: 10 },
          { target: 2, f1: 2, f2: 8 },
          { target: 3, f1: 3, f2: 6 },
          { target: 4, f1: 4, f2: 4 },
          { target: 5, f1: 5, f2: 2 },
        ],
      }

      const result = await pearsonNode.execute(input, { targetField: 'target', topN: 5 })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Pearson 相关系数矩阵分析')
      expect(legacy.metrics.targetField).toBe('target')
      expect(legacy.metrics.numericFieldCount).toBe(3)
      expect(legacy.report.sections).toHaveLength(4)
      expect(legacy.report.sections[1].option.series[0].type).toBe('heatmap')
      expect(legacy.report.sections[2].option.series[0].data[0].value).toBe(1)
      expect(legacy.report.sections[3].content).toContain('因子')
    })

    it('should calculate spearman correlations for monotonic but non-linear data', async () => {
      const input = {
        data: [
          { target: 1, f1: 1, f2: 25 },
          { target: 2, f1: 4, f2: 20 },
          { target: 3, f1: 9, f2: 15 },
          { target: 4, f1: 16, f2: 10 },
          { target: 5, f1: 25, f2: 5 },
        ],
      }

      const result = await spearmanNode.execute(input, { targetField: 'target', topN: 5 })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Spearman 秩相关矩阵分析')
      expect(legacy.metrics.targetField).toBe('target')
      expect(legacy.report.sections[1].option.series[0].name).toBe('Spearman ρ')
      expect(legacy.report.sections[2].option.xAxis.name).toBe('Spearman ρ')
      expect(legacy.report.sections[2].option.series[0].data[0].value).toBe(1)
      expect(legacy.report.sections[2].option.series[0].data[1].value).toBe(-1)
      expect(legacy.report.sections[3].content).toContain('因子')
    })

    it('should calculate kendall correlations and rank inverse monotonic fields', async () => {
      const input = {
        data: [
          { target: 1, f1: 5, f2: 1 },
          { target: 2, f1: 4, f2: 2 },
          { target: 3, f1: 3, f2: 3 },
          { target: 4, f1: 2, f2: 4 },
          { target: 5, f1: 1, f2: 5 },
        ],
      }

      const result = await kendallNode.execute(input, { targetField: 'target', topN: 5 })

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('report')
      expect(legacy.report.title).toBe('Kendall 秩相关矩阵分析')
      expect(legacy.metrics.targetField).toBe('target')
      expect(legacy.report.sections[1].option.series[0].name).toBe('Kendall τ')
      expect(legacy.report.sections[2].option.xAxis.name).toBe('Kendall τ')
      expect(legacy.report.sections[2].option.series[0].data[0].value).toBe(-1)
      expect(legacy.report.sections[2].option.series[0].data[1].value).toBe(1)
      expect(legacy.report.sections[3].content).toContain('因子')
    })
  })

  describe('neighbor-system', () => {
    it('should fetch board data through the integration bridge', async () => {
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

      const config = {
        productName: '试制产品 A1',
        fetchMode: 'time',
        factorTreeOptions: [
          {
            key: 'scene_all',
            label: '全场景/全场景',
            data: { nodeType: 'scene' },
            children: [
              {
                key: 'PROC_A',
                label: '涂布',
                data: { nodeType: 'process', process: '涂布' },
                children: [
                  {
                    key: 'F_TEMP',
                    label: '温度',
                    data: { nodeType: 'factor', factorKey: 'F_TEMP', process: '涂布' },
                  },
                  {
                    key: 'F_PRESS',
                    label: '压力',
                    data: { nodeType: 'factor', factorKey: 'F_PRESS', process: '涂布' },
                  },
                ],
              },
            ],
          },
        ],
        timeRange: [new Date('2026-03-01'), new Date('2026-03-10')],
        materialType: '正极',
        selectedFactors: {
          'factor:涂布::F_TEMP': { checked: true },
          'factor:涂布::F_PRESS': { checked: true },
        },
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
          processList: ['涂布'],
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
      mockGetKanbanAuthToken.mockReturnValue('token-from-host')
      const config = {
        fetchMode: 'sn',
        snList: 'SN001',
        productName: '试制产品 A1',
        selectedFactors: {},
      }

      await expect(neighborSystemNode.execute(null, config)).rejects.toThrow(
        '请至少选择一个因子进行获取',
      )
    })

    it('should require a token from the host system', async () => {
      mockGetKanbanAuthToken.mockReturnValue('')

      await expect(
        neighborSystemNode.execute(null, {
          productName: '试制产品 A1',
          fetchMode: 'sn',
          snList: 'SN001',
          factorTreeOptions: [
            {
              key: 'scene_all',
              label: '全场景/全场景',
              data: { nodeType: 'scene' },
              children: [
                {
                  key: 'PROC_A',
                  label: '涂布',
                  data: { nodeType: 'process', process: '涂布' },
                  children: [
                    {
                      key: 'F_TEMP',
                      label: '温度',
                      data: { nodeType: 'factor', factorKey: 'F_TEMP', process: '涂布' },
                    },
                  ],
                },
              ],
            },
          ],
          selectedFactors: { 'factor:涂布::F_TEMP': { checked: true } },
        }),
      ).rejects.toThrow('未接收到宿主系统传入的访问凭证')
    })
  })

  describe('chart-display', () => {
    it('should generate scatter chart option', async () => {
      const input = {
        data: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      }
      const config = { chartType: 'scatter', xAxis: 'x', yAxis: 'y' }

      const result = await chartDisplayNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('chart')
      expect(legacy.chartOption.series[0].type).toBe('scatter')
    })

    it('should generate bar chart option', async () => {
      const input = {
        data: [
          { x: 'A', y: 10 },
          { x: 'B', y: 20 },
        ],
      }
      const config = { chartType: 'bar', xAxis: 'x', yAxis: 'y' }

      const result = await chartDisplayNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('chart')
      expect(legacy.chartOption.series[0].type).toBe('bar')
    })

    it('should not mutate grouped collection input when rendering non-boxplot charts', async () => {
      const input = {
        data: [
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
        ],
      }
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
      const input = { data: [{ a: 1, b: 2 }] }
      const config = { format: 'csv', filename: 'test_export' }

      const result = await dataExportNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('export')
      expect(legacy.exportInfo.filename).toBe('test_export.csv')
      expect(legacy.exportInfo.url).toBe('blob:mock-url')
    })

    it('should generate export info for JSON', async () => {
      const input = { data: [{ a: 1, b: 2 }] }
      const config = { format: 'json', filename: 'test_export' }

      const result = await dataExportNode.execute(input, config)

      const legacy = asLegacy(result)

      expect(legacy.viewType).toBe('export')
      expect(legacy.exportInfo.filename).toBe('test_export.json')
    })
  })
})
