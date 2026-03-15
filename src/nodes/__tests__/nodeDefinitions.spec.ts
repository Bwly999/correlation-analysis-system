import { describe, it, expect, vi } from 'vitest'
import { fileImportNode } from '../definitions/fileImport'
import { dataCleaningNode } from '../definitions/dataCleaning'
import { dataProfilingNode } from '../definitions/dataProfiling'
import { dataAggregationNode } from '../definitions/dataAggregation'
import { xgboostShapNode } from '../definitions/xgboostShap'
import { neighborSystemNode } from '../definitions/neighborSystem'
import { chartDisplayNode } from '../definitions/chartDisplay'
import { dataExportNode } from '../definitions/dataExport'
import { lassoNode } from '../definitions/lasso'
import { pearsonNode } from '../definitions/pearson'
import * as fs from 'fs'
import * as path from 'path'

// Mock URL for data-export
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
      expect(result.data[1].a).toBe(1.5) // (1+2)/2
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
      expect(result.report.sections[3].content).toContain('"字段": "sensor_b"')
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

  describe('algorithms', () => {
    it('should simulate xgboost+shap result', async () => {
      const input = { data: [{ target: 1, f1: 2 }] }
      const config = { targetLabel: 'target' }

      // Mock fetch response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: {
            r2: 0.85,
            mae: 0.1,
            importance: [{ name: 'f1', value: 0.5 }],
            beeswarm_image: 'base64_beeswarm',
            dependence_images: [{ feature: 'f1', image: 'base64_f1' }],
            raw_dependence_data: [{ feature: 'f1', x: [1, 2], shap: [0.1, 0.2] }],
            full_report_image: 'base64_full',
          },
        }),
      })

      const result = await xgboostShapNode.execute(input, config)

      expect(result.viewType).toBe('report')
      expect(result.report).toBeDefined()
      expect(result.report.title).toContain('Xgboost')
      expect(result.report.tabs).toHaveLength(2)
      expect(result.report.tabs[0].name).toContain('前端分图')
      expect(result.report.tabs[1].name).toContain('后端全量')

      // Verify sections
      const sections = result.report.tabs[0].sections
      expect(sections.some((s: any) => s.title?.includes('特征重要性'))).toBe(true)
      expect(sections.some((s: any) => s.title?.includes('因子影响趋势 (前端渲染)'))).toBe(true)
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
      const config = { targetField: 'target', topN: 5 }

      const result = await pearsonNode.execute(input, config)

      expect(result.viewType).toBe('report')
      expect(result.report.title).toBe('Pearson 相关系数矩阵分析')
      expect(result.metrics.targetField).toBe('target')
      expect(result.metrics.numericFieldCount).toBe(3)
      expect(result.report.sections).toHaveLength(4)
      expect(result.report.sections[1].option.series[0].type).toBe('heatmap')
      expect(result.report.sections[2].option.series[0].data[0].value).toBe(1)
      expect(result.report.sections[3].content).toContain('"因子": "f1"')
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
          sys_power: { checked: true }, // 非因子节点，应被忽略
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

      await expect(neighborSystemNode.execute(null, config)).rejects.toThrow('请至少选择一个因子进行获取')
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
