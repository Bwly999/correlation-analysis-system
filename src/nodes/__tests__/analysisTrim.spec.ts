import { describe, expect, it } from 'vitest'
import { trimAnalysisPayload } from '../analysisTrim'

const sampleRows = [
  { target: 1, f1: 10, f2: 20, f3: 30, id: 'A1', city: '上海' },
  { target: 2, f1: 11, f2: 21, f3: 31, id: 'A2', city: '北京' },
  { target: 3, f1: 12, f2: 22, f3: 32, id: 'A3', city: '深圳' },
]

describe('trimAnalysisPayload', () => {
  it('should keep only targetField and selected factorNames columns', () => {
    const result = trimAnalysisPayload({
      rows: sampleRows,
      targetField: 'target',
      factorNames: ['f1', 'f2'],
    })

    expect(result).toEqual([
      { target: 1, f1: 10, f2: 20 },
      { target: 2, f1: 11, f2: 21 },
      { target: 3, f1: 12, f2: 22 },
    ])
  })

  it('should not include unselected factor columns', () => {
    const result = trimAnalysisPayload({
      rows: sampleRows,
      targetField: 'target',
      factorNames: ['f1'],
    })

    expect(result[0]).not.toHaveProperty('f2')
    expect(result[0]).not.toHaveProperty('f3')
    expect(result[0]).not.toHaveProperty('id')
    expect(result[0]).not.toHaveProperty('city')
  })

  it('should deduplicate factorNames that overlap with targetField', () => {
    const result = trimAnalysisPayload({
      rows: sampleRows,
      targetField: 'target',
      factorNames: ['target', 'f1'],
    })

    expect(result).toEqual([
      { target: 1, f1: 10 },
      { target: 2, f1: 11 },
      { target: 3, f1: 12 },
    ])
    expect(result[0]).not.toHaveProperty('f2')
  })

  it('should throw a Chinese error when factorNames is empty', () => {
    expect(() =>
      trimAnalysisPayload({
        rows: sampleRows,
        targetField: 'target',
        factorNames: [],
      }),
    ).toThrow('请先选择参与分析的字段')
  })

  it('should throw a Chinese error when factorNames is not an array', () => {
    expect(() =>
      trimAnalysisPayload({
        rows: sampleRows,
        targetField: 'target',
        factorNames: undefined as any,
      }),
    ).toThrow('请先选择参与分析的字段')
  })

  it('should throw a Chinese error when targetField is empty', () => {
    expect(() =>
      trimAnalysisPayload({
        rows: sampleRows,
        targetField: '',
        factorNames: ['f1'],
      }),
    ).toThrow('请先选择目标变量')
  })

  it('should throw a Chinese error when all factorNames are the same as targetField', () => {
    expect(() =>
      trimAnalysisPayload({
        rows: sampleRows,
        targetField: 'target',
        factorNames: ['target'],
      }),
    ).toThrow('请先选择参与分析的字段')
  })

  it('should skip keys that do not exist in row data', () => {
    const rows = [{ target: 1, f1: 10 }, { target: 2, f1: 20 }]
    const result = trimAnalysisPayload({
      rows,
      targetField: 'target',
      factorNames: ['f1', 'f2'],
    })

    expect(result).toEqual([
      { target: 1, f1: 10 },
      { target: 2, f1: 20 },
    ])
  })
})