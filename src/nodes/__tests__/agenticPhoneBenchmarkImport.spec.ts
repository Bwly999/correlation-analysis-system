import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseFileImportResult } from '../fileImport/parse'

describe('agentic phone benchmark import compatibility', () => {
  it('parses the benchmark part csv through the existing file import pipeline', async () => {
    const csvPath = path.resolve(
      __dirname,
      '../../../test/resource/agentic_phone_dimension_benchmark/data/part_measurements.csv',
    )
    const csvBuffer = fs.readFileSync(csvPath)
    const file = new File([csvBuffer], 'part_measurements.csv', { type: 'text/csv' })

    const result = await parseFileImportResult(file, { format: 'csv', autoClean: true })

    expect(result.kind).toBe('table')
    expect(result.meta?.rowCount).toBe(1440)
    expect(result.schema?.fields?.length).toBeGreaterThanOrEqual(200)
    expect(result.schema?.fields?.some((field) => field.name === 'part_id')).toBe(true)
    expect(result.schema?.fields?.some((field) => field.name === 'assembly_id')).toBe(true)
  })
})
