import { describe, expect, it } from 'vitest'
import { extractResultEvidence } from '../resultEvidence.js'
import type { AgentExecutionRecord } from '../../../../ai/types.js'

const buildExecution = (overrides: Partial<AgentExecutionRecord> = {}): AgentExecutionRecord => ({
  executionId: 'exec_sales_1',
  planSummary: '销量相关性分析',
  status: 'completed',
  bindings: {},
  createdAt: 1,
  nodeResults: [],
  finalResults: [],
  ...overrides,
})

describe('agentic result evidence extractor', () => {
  it('extracts evidence from correlation report nodes without inferring new conclusions', () => {
    const result = extractResultEvidence(buildExecution({
      nodeResults: [
        {
          nodeId: 'node_pearson_1',
          nodeLabel: 'Pearson 相关系数',
          nodeType: 'pearson',
          success: true,
          resultKind: 'report',
          resultSummary: '3 个数值字段，120 行数据。发现 2 对强相关变量。',
          result: {
            kind: 'report',
            payload: {
              title: 'Pearson 相关系数矩阵',
              summary: '3 个数值字段，120 行数据。发现 2 对强相关变量。',
              matrix: {
                sales: { price: 0.82, discount: -0.41 },
              },
            },
          },
        },
      ],
    }))

    expect(result).toEqual([
      expect.objectContaining({
        evidenceId: 'exec_sales_1:node_pearson_1',
        executionId: 'exec_sales_1',
        nodeId: 'node_pearson_1',
        nodeLabel: 'Pearson 相关系数',
        nodeType: 'pearson',
        statement: '3 个数值字段，120 行数据。发现 2 对强相关变量。',
        resultKind: 'report',
        metrics: expect.objectContaining({
          title: 'Pearson 相关系数矩阵',
          summary: '3 个数值字段，120 行数据。发现 2 对强相关变量。',
          matrix: {
            sales: { price: 0.82, discount: -0.41 },
          },
        }),
      }),
    ])
  })

  it('extracts regression and feature-importance metrics from report payloads', () => {
    const result = extractResultEvidence(buildExecution({
      nodeResults: [
        {
          nodeId: 'node_regression_1',
          nodeLabel: '多元线性回归',
          nodeType: 'multiple-linear-regression',
          success: true,
          resultKind: 'report',
          resultSummary: '回归模型已完成，R² 为 0.76。',
          result: {
            kind: 'report',
            payload: {
              title: '多元线性回归',
              summary: '回归模型已完成，R² 为 0.76。',
              rSquared: 0.76,
              adjustedRSquared: 0.73,
              coefficients: [
                { field: 'price', value: 12.3 },
                { field: 'discount', value: -4.1 },
              ],
            },
          },
        },
        {
          nodeId: 'node_importance_1',
          nodeLabel: '随机森林特征重要度',
          nodeType: 'random-forest-feature-importance',
          success: true,
          resultKind: 'report',
          resultSummary: '特征重要度计算完成。',
          result: {
            kind: 'report',
            payload: {
              title: '随机森林特征重要度',
              summary: '特征重要度计算完成。',
              featureImportances: [
                { field: 'price', importance: 0.61 },
                { field: 'discount', importance: 0.39 },
              ],
            },
          },
        },
      ],
    }))

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: 'exec_sales_1:node_regression_1',
        metrics: expect.objectContaining({
          rSquared: 0.76,
          adjustedRSquared: 0.73,
          coefficients: [
            { field: 'price', value: 12.3 },
            { field: 'discount', value: -4.1 },
          ],
        }),
      }),
      expect.objectContaining({
        evidenceId: 'exec_sales_1:node_importance_1',
        metrics: expect.objectContaining({
          featureImportances: [
            { field: 'price', importance: 0.61 },
            { field: 'discount', importance: 0.39 },
          ],
        }),
      }),
    ]))
  })

  it('keeps table evidence compact by returning only a preview', () => {
    const result = extractResultEvidence(buildExecution({
      nodeResults: [
        {
          nodeId: 'node_clean_1',
          nodeLabel: '数据清洗',
          nodeType: 'data-cleaning',
          success: true,
          resultKind: 'table',
          resultSummary: '表格数据，6 行，2 列（sales, price）',
          result: {
            kind: 'table',
            payload: [
              { sales: 100, price: 10 },
              { sales: 120, price: 11 },
              { sales: 130, price: 12 },
              { sales: 150, price: 14 },
              { sales: 160, price: 15 },
              { sales: 170, price: 16 },
            ],
          },
        },
      ],
    }))

    expect(result).toEqual([
      expect.objectContaining({
        evidenceId: 'exec_sales_1:node_clean_1',
        statement: '表格数据，6 行，2 列（sales, price）',
        metrics: {
          rowCount: 6,
          columnCount: 2,
          columns: ['sales', 'price'],
        },
        previewRows: [
          { sales: 100, price: 10 },
          { sales: 120, price: 11 },
          { sales: 130, price: 12 },
          { sales: 150, price: 14 },
          { sales: 160, price: 15 },
        ],
      }),
    ])
  })

  it('ignores failed nodes and nodes without standard result payloads', () => {
    const result = extractResultEvidence(buildExecution({
      nodeResults: [
        {
          nodeId: 'node_failed',
          nodeLabel: '失败节点',
          nodeType: 'pearson',
          success: false,
          resultKind: null,
          resultSummary: '执行失败',
          error: '缺少数值字段',
        },
        {
          nodeId: 'node_unknown',
          nodeLabel: '未知节点',
          nodeType: 'custom',
          success: true,
          resultKind: 'unknown',
          resultSummary: '执行成功',
          result: 'plain text',
        },
      ],
    }))

    expect(result).toEqual([])
  })
})
