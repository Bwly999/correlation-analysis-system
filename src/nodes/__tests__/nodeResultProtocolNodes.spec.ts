import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileImportNode } from '../definitions/fileImport'
import { dataCleaningNode } from '../definitions/dataCleaning'
import { dataMergeNode } from '../definitions/dataMerge'
import { dataProfilingNode } from '../definitions/dataProfiling'
import { chartDisplayNode } from '../definitions/chartDisplay'
import { createTableResult } from '../result'

describe('core nodes standardized result protocol', () => {
  it('file-import should return a table result with schema and preview metadata', async () => {
    const csvPath = path.resolve(__dirname, '../../../test/resource/test_data.csv')
    const csvBuffer = fs.readFileSync(csvPath)
    const file = new File([csvBuffer], 'test_data.csv', { type: 'text/csv' })

    const result = await fileImportNode.execute(null, { fileData: file, format: 'auto' })

    expect(result.kind).toBe('table')
    expect(Array.isArray(result.payload)).toBe(true)
    expect(result.schema?.fields?.length).toBeGreaterThan(0)
    expect(result.meta?.filename).toBe('test_data.csv')
    expect(result.preview?.viewer).toBe('table-chart-combo-viewer')
  })

  it('data-cleaning should return a table result and move stats into meta', async () => {
    const result = await dataCleaningNode.execute(
      createTableResult([{ a: 1 }, { a: null }, { a: 2 }]),
      { missingValueStrategy: 'mean', outlierMethod: 'none' },
    )

    expect(result.kind).toBe('table')
    expect(result.payload[1].a).toBe(1.5)
    expect(result.meta?.stats).toMatchObject({
      originalCount: 3,
      missingFilled: 1,
    })
    expect(result.preview?.viewer).toBe('table-chart-combo-viewer')
  })

  it('data-cleaning should expose deduplication stats in standardized meta', async () => {
    const result = await dataCleaningNode.execute(
      createTableResult([
        { batch: 'B1', step: '涂布', score: 10, version: 1 },
        { batch: 'B1', step: '涂布', score: 12, version: 2 },
        { batch: 'B2', step: '辊压', score: 8, version: 1 },
      ]),
      {
        deduplicationMode: 'by_fields',
        deduplicationFields: ['batch', 'step'],
        deduplicationKeep: 'last',
      },
    )

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([
      { batch: 'B1', step: '涂布', score: 12, version: 2 },
      { batch: 'B2', step: '辊压', score: 8, version: 1 },
    ])
    expect(result.meta?.stats).toMatchObject({
      originalCount: 3,
      finalCount: 2,
      duplicatesRemoved: 1,
      deduplicationMode: 'by_fields',
      deduplicationKeep: 'last',
    })
  })

  it('data-merge should return a standardized table result and keep lineage', async () => {
    const result = await dataMergeNode.execute(
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

    expect(result.kind).toBe('table')
    expect(result.payload).toEqual([
      { id: 1, city: '上海', score: null, __source: 'Source A' },
      { id: 2, city: null, score: 95, __source: 'Source B' },
    ])
    expect(result.meta?.stats?.outputRows).toBe(2)
    expect(result.lineage?.fields?.score?.[0]?.sourceNodeId).toBe('n2')
    expect(result.preview?.viewer).toBe('table-chart-combo-viewer')
  })

  it('data-profiling should return a report result with report payload and metrics meta', async () => {
    const result = await dataProfilingNode.execute(
      createTableResult([
        { id: 'A001', target: 10, sensor_a: 1, sensor_b: null, ts: '2026-03-15T10:00:00Z' },
        { id: 'A002', target: 12, sensor_a: 2, sensor_b: null, ts: '2026-03-15T11:00:00Z' },
        { id: 'A003', target: 14, sensor_a: 3, sensor_b: 0, ts: '2026-03-15T12:00:00Z' },
      ]),
      {
        targetField: 'target',
        topFields: 6,
      },
    )

    expect(result.kind).toBe('report')
    expect(result.payload.title).toBe('数据体检与字段画像')
    expect(result.meta?.metrics?.fieldCount).toBe(5)
    expect(result.preview?.viewer).toBe('report-viewer')
  })

  it('chart-display should return a chart result with chart payload', async () => {
    const result = await chartDisplayNode.execute(
      createTableResult([
        { f1: 10, target: 1 },
        { f1: 20, target: 2 },
      ]),
      {
        chartType: 'scatter',
        xAxis: 'f1',
        yAxis: 'target',
      },
    )

    expect(result.kind).toBe('chart')
    expect(result.payload.series[0].type).toBe('scatter')
    expect(result.preview?.viewer).toBe('chart-viewer')
  })
})
