import { describe, expect, it } from 'vitest'
import { createTableResult } from '@/nodes/result'
import { buildJsTransformAgentContext } from '../jsTransformAgentContext'

describe('jsTransformAgentContext', () => {
  it('keeps at most 3 input and output samples with schema summaries', () => {
    const inputRows = Array.from({ length: 5 }, (_, index) => ({
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      revenue: index * 100,
      nested: { detail: `detail_${index}` },
    }))
    const outputRows = Array.from({ length: 4 }, (_, index) => ({
      month: `2026-${String(index + 1).padStart(2, '0')}`,
      revenue: index * 100,
    }))

    const context = buildJsTransformAgentContext({
      nodeId: 'node_js_1',
      nodeLabel: 'JS代码执行',
      nodeType: 'js-transform',
      currentCode: 'return rows',
      declarations: 'declare const rows: Array<Record<string, unknown>>',
      inputData: createTableResult(inputRows),
      outputData: createTableResult(outputRows),
      errorMessage: '',
      status: 'success',
    })

    expect(context.inputContext.rowCount).toBe(5)
    expect(context.inputContext.sampleRows).toHaveLength(3)
    expect(context.inputContext.schemaSummary.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'date' }),
        expect.objectContaining({ name: 'revenue' }),
      ]),
    )
    expect(context.latestDebugContext.outputSample).toHaveLength(3)
    expect(context.latestDebugContext.summary).toContain('4')
    expect(context.capabilities.agent).toEqual([
      'read_context',
      'update_current_code',
      'debug_current_node',
    ])
  })

  it('returns empty sample context when upstream input is unavailable', () => {
    const context = buildJsTransformAgentContext({
      nodeId: 'node_js_1',
      nodeLabel: 'JS代码执行',
      nodeType: 'js-transform',
      currentCode: 'return rows',
      declarations: 'declare const rows: Array<Record<string, unknown>>',
      inputData: null,
      outputData: null,
      errorMessage: 'JS代码执行失败：rows is not defined',
      status: 'error',
    })

    expect(context.inputContext.rowCount).toBe(0)
    expect(context.inputContext.sampleRows).toEqual([])
    expect(context.latestDebugContext.status).toBe('error')
    expect(context.latestDebugContext.errorMessage).toContain('rows is not defined')
  })
})
