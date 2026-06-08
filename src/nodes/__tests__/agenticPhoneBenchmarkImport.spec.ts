import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseFileImportResult } from '../fileImport/parse'

describe('agentic phone benchmark import compatibility', () => {
  it('parses the benchmark part csv through the existing file import pipeline', async () => {
    const csvPath = path.resolve(
      __dirname,
      '../../../test/resource/agentic_phone_dimension_benchmark/data/phone_dimension_benchmark.csv',
    )
    const csvBuffer = fs.readFileSync(csvPath)
    const file = new File([csvBuffer], 'phone_dimension_benchmark.csv', { type: 'text/csv' })

    const result = await parseFileImportResult(file, { format: 'csv', autoClean: true })

    expect(result.kind).toBe('table')
    expect(result.meta?.rowCount).toBe(480)
    expect(result.schema?.fields?.length).toBeGreaterThanOrEqual(400)
    expect(result.schema?.fields?.some((field) => field.name === 'assembly_id')).toBe(true)
    expect(result.schema?.fields?.some((field) => field.name === 'frame_part_id')).toBe(true)
  })
})
