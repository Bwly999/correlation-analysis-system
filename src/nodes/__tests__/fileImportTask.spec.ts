import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFileImportTask } from '../fileImport/task'

describe('createFileImportTask', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('should clone reactive worker options before posting to the background parser', async () => {
    const expectedResult = {
      kind: 'table',
      data: [{ feature: 1, target: '2' }],
      schema: {
        fields: [
          { name: 'feature', type: 'number', nullable: false },
          { name: 'target', type: 'string', nullable: false },
        ],
      },
      meta: {
        rowCount: 1,
      },
      preview: {
        summary: '共 1 行，2 个字段',
      },
    }

    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: Event) => void) | null = null

      postMessage = vi.fn((payload: unknown) => {
        const cloned = structuredClone(payload) as { id: string }
        this.onmessage?.({
          data: {
            type: 'completed',
            id: cloned.id,
            result: expectedResult,
          },
        } as MessageEvent)
      })
      terminate = vi.fn()
    }

    vi.stubGlobal('Worker', WorkerMock)

    const file = new File(['feature,target\n1,2'], 'metrics.csv', {
      type: 'text/csv',
    })

    const task = createFileImportTask(file, {
      format: 'csv',
      autoClean: true,
      excludeFields: reactive(['target']),
    })

    await expect(task.result).resolves.toMatchObject(expectedResult)
  })
})
