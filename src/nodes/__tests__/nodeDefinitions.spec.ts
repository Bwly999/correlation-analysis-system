import { describe, it, expect, vi } from 'vitest'
import { fileImportNode } from '../definitions/fileImport'
import { dataCleaningNode } from '../definitions/dataCleaning'
import { dataAggregationNode } from '../definitions/dataAggregation'
import { algorithmNode } from '../definitions/algorithm'
import * as fs from 'fs'
import * as path from 'path'

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
      const file = new File([xlsxBuffer], 'test_data.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      
      const config = { fileData: file, format: 'auto' }
      const result = await fileImportNode.execute(null, config)
      
      expect(result.data).toBeDefined()
      expect(result.data.length).toBeGreaterThan(0)
      expect(result.type).toBe('excel')
    })
  })

  describe('data-cleaning', () => {
    it('should pass through data and record count', async () => {
      const input = { data: [{ a: 1 }, { a: null }, { a: 2 }] }
      const config = { missingValueStrategy: 'mean', outlierMethod: 'iqr' }
      
      const result = await dataCleaningNode.execute(input, config)
      
      expect(result.data).toBeDefined()
      expect(result.originalCount).toBe(3)
      expect(result.method).toBe('iqr')
    })
  })

  describe('data-aggregation', () => {
    it('should aggregate multiple columns into one using the new nested schema', async () => {
      const input = { 
        data: [
          { f1: 10, f2: 20, f3: 30 },
          { f1: 5, f2: 5, f3: 5 }
        ] 
      }
      // 更新配置以符合最新的 NodeProperty[] 嵌套结构
      const config = {
        aggregationGroups: [
          { 
            targetFactorName: 'total', 
            method: 'sum', 
            factorWeights: [
              { factorName: 'f1', weight: 1.0 },
              { factorName: 'f2', weight: 1.0 },
              { factorName: 'f3', weight: 1.0 }
            ]
          }
        ]
      }
      
      const result = await dataAggregationNode.execute(input, config)
      
      expect(result.data[0].total).toBe(60)
      expect(result.data[1].total).toBe(15)
    })

    it('should handle weighted mean correctly', async () => {
      const input = { data: [{ f1: 10, f2: 20 }] }
      const config = {
        aggregationGroups: [
          { 
            targetFactorName: 'weighted_avg', 
            method: 'weighted_mean', 
            factorWeights: [
              { factorName: 'f1', weight: 1.0 },
              { factorName: 'f2', weight: 3.0 }
            ]
          }
        ]
      }
      // (10*1 + 20*3) / (1+3) = 70 / 4 = 17.5
      const result = await dataAggregationNode.execute(input, config)
      expect(result.data[0].weighted_avg).toBe(17.5)
    })
  })

  describe('algorithm', () => {
    it('should simulate xgboost+shap result', async () => {
      const input = { data: [{ target: 1, f1: 2 }] }
      const config = { modelType: 'xgboost_shap', targetLabel: 'target' }
      
      const result = await algorithmNode.execute(input, config)
      
      expect(result.model).toBe('Xgboost + SHAP')
      expect(result.featureImportance).toBeDefined()
      expect(result.featureImportance.length).toBeGreaterThan(0)
    })
  })
})
