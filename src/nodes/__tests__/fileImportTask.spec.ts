import { describe, expect, it } from 'vitest'

import { createFileImportTask } from '../fileImport/task'

describe('createFileImportTask', () => {
  it('should report progress and resolve a table result with schema metadata', async () => {
    const file = new File(['feature,target\n1,2\n3,4'], 'metrics.csv', {
      type: 'text/csv',
    })
    const phases: string[] = []

    const task = createFileImportTask(
      file,
      {
        format: 'csv',
        autoClean: true,
        excludeFields: [],
      },
      (progress) => {
        phases.push(progress.phase)
      },
    )

    const result = await task.result

    expect(phases.length).toBeGreaterThan(0)
    expect(result.kind).toBe('table')
    expect(result.schema?.fields?.map((field) => field.name)).toEqual(['feature', 'target'])
    expect(result.meta?.rowCount).toBe(2)
    expect(typeof result.preview?.summary).toBe('string')
    expect(String(result.preview?.summary)).toContain('2 行')
  })

  it('should reject with a cancellation error after cancel is called', async () => {
    const file = new File(['feature,target\n1,2\n3,4'], 'metrics.csv', {
      type: 'text/csv',
    })

    const task = createFileImportTask(file, {
      format: 'csv',
      autoClean: true,
      excludeFields: [],
    })

    task.cancel()

    await expect(task.result).rejects.toThrow('IMPORT_CANCELLED')
  })
})
