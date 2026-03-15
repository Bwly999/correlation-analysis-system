import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

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

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

describe('Node Definitions Execution Logic', () => {
  describe('file-import', () => {
    it('should parse a CSV file correctly', async () => {
      const csvPath = path.resolve(__dirname, '../../../test/resource/test_data.csv')
      const csvBuffer = fs.readFileSync(csvPath)
      const file = new File([csvBuffer], 'test_data.csv', { type: 'text/csv' })

      const config = { fileData: file, format: 'auto' }
      const result = await fileImportNode.execute(null, config)

      expect(result.data).toBeDefined()
      expect(result.data.length).toBeGreaterThan(0)
      expect(result.type).toBe('csv')
    })

    it('should parse an XLSX file correctly', async () => {
      const xlsxPath = path.resolve(__dirname, '../../../test/resource/test_data.xlsx')
      const xlsxBuffer = fs.readFileSync(xlsxPath)
      const file = new File([xlsxBuffer], 'test_data.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const config = { fileData: file, format: 'auto' }
      const result = await fileImportNode.execute(null, config)

      expect(result.data).toBeDefined()
      expect(result.data.length).toBeGreaterThan(0)
      expect(result.type).toBe('excel')
    })
  })

  describe('data-cleaning', () => {
    it('should handle missing values and record stats', async () => {
      const input = { data: [{ a: 1 }, { a: null }, { a: 2 }] }
      const config = { missingValueStrategy: 'mean', outlierMethod: 'none' }

      const result = await dataCleaningNode.execute(input, config)

      expect(result.data).toBeDefined()
      expect(result.stats.originalCount).toBe(3)
      expect(result.stats.missingFilled).toBe(1)
      expect(result.data[1].a).toBe(1.5)
    })

    it('should perform min-max scaling', async () => {
      const input = {
        data: [{ a: 0 }, { a: 5 }, { a: 10 }],
      }
      const config = { scaling: 'minmax', targetColumns: ['a'] }

      const result = await dataCleaningNode.execute(input, config)

      expect(result.data[0].a).toBe(0)
      expect(result.data[1].a).toBe(0.5)
      expect(result.data[2].a).toBe(1)
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

      expect(typeof result.data[0].category).toBe('number')
      expect(result.data[0].category).toBe(result.data[2].category)
      expect(result.data[0].category).not.toBe(result.data[1].category)
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

      expect(result.viewType).toBe('report')
      expect(result.data).toHaveLength(3)
      expect(result.metrics.fieldCount).toBe(5)
      expect(result.metrics.numericFieldCount).toBeGreaterThanOrEqual(3)
      expect(result.metrics.riskFieldCount).toBeGreaterThanOrEqual(1)
      expect(result.report.title).toBe('数据体检与字段画像')
      expect(result.report.sections[1].option.series[0].type).toBe('bar')
      expect(result.report.sections[2].option.series[0].type).toBe('pie')
      expect(result.report.sections[3].content).toContain('字段')
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

      expect(result.metrics.duplicateRowCount).toBe(1)
      expect(result.metrics.duplicateRowRate).toBeCloseTo(0.2)
      expect(result.metrics.targetFieldUsability).toBe('classification')
      expect(result.report.sections[0].content).toContain('target')
      expect(result.report.sections[0].content).toContain('1')
      expect(result.report.sections[3].content).toContain('字段')
      expect(result.report.sections[3].content).toContain('20.0%')
      expect(result.report.sections[3].content).toContain('sensor_b')

      const sensorProfile = result.profile.find((item: any) => item.field === 'sensor_b')
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

      expect(result.data[0].total).toBe(60)
      expect(result.data[1].total).toBe(15)
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

      expect(mergeNode).toBeDefined()
      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toEqual({ id: 1, city: '上海', score: null, __source: 'Source A' })
      expect(result.data[1]).toEqual({ id: 2, city: null, score: 95, __source: 'Source B' })
      expect(result.stats.inputCount).toBe(2)
      expect(result.stats.outputRows).toBe(2)
      expect(result.lineage.fields.score[0].sourceNodeId).toBe('n2')
    })

    it('should left-join datasets and suffix conflicting fields', async () => {
      const mergeNode = nodeDefinitions.find((definition) => definition.name === 'data-merge')

      const result = await mergeNode!.execute(
        {
          inputs: [
            {
              sourceNodeId: 'base',
              sourceNodeLabel: 'Base',
              payload: { data: [{ id: 1, city: '上海', value: 10 }, { id: 2, city: '北京', value: 20 }] },
            },
            {
              sourceNodeId: 'extra',
              sourceNodeLabel: 'Extra',
              payload: { data: [{ id: 1, value: 99, score: 90 }, { id: 3, value: 88, score: 70 }] },
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

      expect(mergeNode).toBeDefined()
      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toEqual({ id: 1, city: '上海', value: 10, value_Extra: 99, score: 90 })
      expect(result.data[1]).toEqual({ id: 2, city: '北京', value: 20, value_Extra: null, score: null })
      expect(result.stats.outputRows).toBe(2)
      expect(result.stats.matchedRows).toBe(1)
      expect(result.stats.conflictFieldCount).toBe(1)
      expect(result.diagnostics.conflicts[0].field).toBe('value')
      expect(result.lineage.fields.score[0].sourceNodeId).toBe('extra')
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

      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toEqual({ name: 'Group A', data: [{ val: 10 }] })
      expect(result.data[1]).toEqual({ name: 'Group B', data: [{ val: 20 }, { val: 30 }] })
      expect(result.stats.groupCount).toBe(2)
      expect(result.stats.totalRows).toBe(3)
    })
  })

  describe('data-filter', () => {
    it('should filter rows by multiple conditions with all-match mode', async () => {
      const input = {
        data: [
          { city: '涓婃捣', score: 91, tag: 'A-1' },
          { city: '鍖椾含', score: 77, tag: 'B-2' },
          { city: '涓婃捣', score: 82, tag: 'A-2' },
          { city: '娣卞湷', score: 95, tag: 'C-1' },
        ],
      }

      const result = await dataFilterNode.execute(input, {
        matchMode: 'all',
        conditions: [
          { field: 'city', operator: 'equals', value: '涓婃捣' },
          { field: 'score', operator: 'gte', value: 85 },
        ],
      })

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toEqual({ city: '涓婃捣', score: 91, tag: 'A-1' })
      expect(result.stats.originalCount).toBe(4)
      expect(result.stats.filteredCount).toBe(1)
    })

    it('should filter rows by any-match mode with contains operator', async () => {
      const input = {
        data: [
          { city: '涓婃捣', score: 91, tag: 'A-1' },
          { city: '鍖椾含', score: 77, tag: 'B-2' },
          { city: '涓婃捣', score: 82, tag: 'A-2' },
          { city: '娣卞湷', score: 95, tag: 'C-1' },
        ],
      }

      const result = await dataFilterNode.execute(input, {
        matchMode: 'any',
        conditions: [
          { field: 'tag', operator: 'contains', value: 'B-' },
          { field: 'score', operator: 'gte', value: 95 },
        ],
      })

      expect(result.data).toHaveLength(2)
      expect(result.data.map((row: any) => row.city)).toEqual(['鍖椾含', '娣卞湷'])
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

      expect(result.viewType).toBe('report')
      expect(result.report).toBeDefined()
      expect(result.report.title).toContain('Xgboost')
      expect(result.report.metadata).toMatchObject({
        targetField: 'target',
        sampleCount: 2,
        featureCount: 3,
        r2: 0.85,
        mae: 0.1,
      })
      expect(result.report.sections).toBeDefined()
      expect(result.report.sections.some((section: any) => section.type === 'summary')).toBe(true)
      expect(result.report.sections.some((section: any) => section.key === 'importance')).toBe(true)
      expect(result.report.sections.some((section: any) => section.key === 'dependence')).toBe(true)
      expect(result.report.sections.some((section: any) => section.key === 'details')).toBe(true)
      expect(result.report.sections.find((section: any) => section.key === 'details').items).toHaveLength(3)
      expect(result.report.supplements.fullReportImage).toBe('data:image/png;base64,base64_full')
      expect(result.report.supplements.beeswarmImage).toBe('data:image/png;base64,base64_beeswarm')
    })

    it('should simulate lasso result', async () => {
      const input = { data: [{ target: 1, f1: 2 }] }
      const config = { targetLabel: 'target' }

      const result = await lassoNode.execute(input, config)

      expect(result.viewType).toBe('report')
      expect(result.report.title).toBe('Lasso 回归分析')
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

      expect(result.viewType).toBe('report')
      expect(result.report.title).toBe('Pearson 相关系数矩阵分析')
      expect(result.metrics.targetField).toBe('target')
      expect(result.metrics.numericFieldCount).toBe(3)
      expect(result.report.sections).toHaveLength(4)
      expect(result.report.sections[1].option.series[0].type).toBe('heatmap')
      expect(result.report.sections[2].option.series[0].data[0].value).toBe(1)
      expect(result.report.sections[3].content).toContain('因子')
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

      expect(result.viewType).toBe('report')
      expect(result.report.title).toBe('Spearman 秩相关矩阵分析')
      expect(result.metrics.targetField).toBe('target')
      expect(result.report.sections[1].option.series[0].name).toBe('Spearman ρ')
      expect(result.report.sections[2].option.xAxis.name).toBe('Spearman ρ')
      expect(result.report.sections[2].option.series[0].data[0].value).toBe(1)
      expect(result.report.sections[2].option.series[0].data[1].value).toBe(-1)
      expect(result.report.sections[3].content).toContain('因子')
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

      expect(result.viewType).toBe('report')
      expect(result.report.title).toBe('Kendall 秩相关矩阵分析')
      expect(result.metrics.targetField).toBe('target')
      expect(result.report.sections[1].option.series[0].name).toBe('Kendall τ')
      expect(result.report.sections[2].option.xAxis.name).toBe('Kendall τ')
      expect(result.report.sections[2].option.series[0].data[0].value).toBe(-1)
      expect(result.report.sections[2].option.series[0].data[1].value).toBe(1)
      expect(result.report.sections[3].content).toContain('因子')
    })
  })

  describe('neighbor-system', () => {
    it('should generate mock data based on fetch mode and factor selection', async () => {
      const config = {
        productId: 'p_01',
        fetchMode: 'time',
        timeRange: [new Date(), new Date()],
        selectedFactors: {
          f_bat_volt: { checked: true },
          f_bat_curr: { checked: true },
          sys_power: { checked: true },
        },
      }

      const result = await neighborSystemNode.execute(null, config)

      expect(result.data).toBeDefined()
      expect(result.data.length).toBeGreaterThan(0)
      expect(result.metadata.factors_count).toBe(2)
      expect(result.metadata.product).toBe('p_01')
      expect(result.data[0].f_bat_volt).toBeDefined()
      expect(result.data[0].f_bat_curr).toBeDefined()
      expect(result.data[0].sn).toMatch(/^SN_TIME_/)
    })

    it('should throw error if no factors are selected', async () => {
      const config = {
        fetchMode: 'sn',
        snList: 'SN001',
        selectedFactors: {},
      }

      await expect(neighborSystemNode.execute(null, config)).rejects.toThrow(
        '请至少选择一个因子进行获取',
      )
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

      expect(result.viewType).toBe('chart')
      expect(result.chartOption.series[0].type).toBe('scatter')
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

      expect(result.viewType).toBe('chart')
      expect(result.chartOption.series[0].type).toBe('bar')
    })
  })

  describe('data-export', () => {
    it('should generate export info for CSV', async () => {
      const input = { data: [{ a: 1, b: 2 }] }
      const config = { format: 'csv', filename: 'test_export' }

      const result = await dataExportNode.execute(input, config)

      expect(result.viewType).toBe('export')
      expect(result.exportInfo.filename).toBe('test_export.csv')
      expect(result.exportInfo.url).toBe('blob:mock-url')
    })

    it('should generate export info for JSON', async () => {
      const input = { data: [{ a: 1, b: 2 }] }
      const config = { format: 'json', filename: 'test_export' }

      const result = await dataExportNode.execute(input, config)

      expect(result.viewType).toBe('export')
      expect(result.exportInfo.filename).toBe('test_export.json')
    })
  })
})








