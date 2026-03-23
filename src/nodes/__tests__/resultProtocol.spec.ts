import { describe, expect, it } from 'vitest'
import {
  extractTableCollectionGroups,
  extractTableRows,
  inferSchemaFromRows,
  normalizeNodeResult,
} from '../result'

describe('result protocol helpers', () => {
  it('infers schema from table rows', () => {
    const schema = inferSchemaFromRows([
      {
        name: 'alpha',
        score: 12.5,
        active: true,
        createdAt: '2026-03-19T08:00:00Z',
        note: null,
      },
      {
        name: 'beta',
        score: 13.2,
        active: false,
        createdAt: '2026-03-20T08:00:00Z',
        note: 'ok',
      },
    ])

    expect(schema.fields).toEqual([
      { name: 'name', type: 'string', nullable: false },
      { name: 'score', type: 'number', nullable: false },
      { name: 'active', type: 'boolean', nullable: false },
      { name: 'createdAt', type: 'date', nullable: false },
      { name: 'note', type: 'string', nullable: true },
    ])
  })

  it('normalizes table results with inferred schema and default preview', () => {
    const result = normalizeNodeResult({
      kind: 'table',
      payload: [
        { factor: 'f1', value: 10 },
        { factor: 'f2', value: 12 },
      ],
    })

    expect(result.kind).toBe('table')
    expect(result.preview?.viewer).toBe('table-chart-combo-viewer')
    expect(result.meta?.rowCount).toBe(2)
    expect(result.schema?.fields).toEqual([
      { name: 'factor', type: 'string', nullable: false },
      { name: 'value', type: 'number', nullable: false },
    ])
  })

  it('extracts table rows from raw row arrays without legacy wrappers', () => {
    const rows = extractTableRows([
      { factor: 'f1', value: 10 },
      { factor: 'f2', value: 12 },
    ])

    expect(rows).toEqual([
      { factor: 'f1', value: 10 },
      { factor: 'f2', value: 12 },
    ])
  })

  it('extracts grouped rows from raw collection arrays without legacy wrappers', () => {
    const groups = extractTableCollectionGroups([
      { name: 'Group A', data: [{ value: 10 }] },
      { name: 'Group B', data: [{ value: 20 }, { value: 30 }] },
    ])

    expect(groups).toEqual([
      { name: 'Group A', data: [{ value: 10 }] },
      { name: 'Group B', data: [{ value: 20 }, { value: 30 }] },
    ])
  })

  it('rejects legacy wrapped table payloads from the execution protocol', () => {
    expect(
      extractTableRows({
        data: [{ factor: 'f1', value: 10 }],
      }),
    ).toBeNull()
  })

  it('rejects legacy wrapped collection payloads from the execution protocol', () => {
    expect(
      extractTableCollectionGroups({
        data: [{ name: 'Group A', data: [{ value: 10 }] }],
      }),
    ).toBeNull()
  })
})
