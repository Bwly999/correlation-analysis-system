import { parseFileImportResult } from './parse'
import type { FileImportParseOptions, FileImportProgress, FileImportTask } from './types'

type WorkerEvent =
  | { type: 'progress'; id: string; progress: FileImportProgress }
  | { type: 'completed'; id: string; result: Awaited<ReturnType<typeof parseFileImportResult>> }
  | { type: 'failed'; id: string; error: string }

const IMPORT_CANCELLED_ERROR = 'IMPORT_CANCELLED'

const createCancelledError = () => new Error(IMPORT_CANCELLED_ERROR)

export const isFileImportCancelledError = (error: unknown) =>
  error instanceof Error && error.message === IMPORT_CANCELLED_ERROR

const supportsWorkerParsing = () =>
  typeof window !== 'undefined'
  && typeof Worker !== 'undefined'
  && typeof URL !== 'undefined'

const normalizeParseOptions = (
  options: FileImportParseOptions = {},
): FileImportParseOptions => {
  const normalizedExcludeFields = Array.isArray(options.excludeFields)
    ? [...options.excludeFields]
    : options.excludeFields

  return {
    format: options.format,
    autoClean: options.autoClean,
    excludeFields: normalizedExcludeFields,
  }
}

export const createFileImportTask = (
  file: File,
  options: FileImportParseOptions = {},
  onProgress?: (progress: FileImportProgress) => void,
): FileImportTask => {
  let cancelled = false
  const normalizedOptions = normalizeParseOptions(options)

  const cancel = () => {
    cancelled = true
  }

  if (!supportsWorkerParsing()) {
    const result = (async () => {
      if (cancelled) throw createCancelledError()

      return parseFileImportResult(
        file,
        normalizedOptions,
        (progress) => {
          if (!cancelled) {
            onProgress?.(progress)
          }
        },
        () => {
          if (cancelled) throw createCancelledError()
        },
      )
    })()

    return {
      result,
      cancel,
    }
  }

  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
  const taskId = `file-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const result = new Promise<Awaited<ReturnType<typeof parseFileImportResult>>>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      if (event.data.id !== taskId) return

      if (event.data.type === 'progress') {
        if (!cancelled) {
          onProgress?.(event.data.progress)
        }
        return
      }

      worker.terminate()

      if (cancelled) {
        reject(createCancelledError())
        return
      }

      if (event.data.type === 'completed') {
        resolve(event.data.result)
        return
      }

      reject(new Error(event.data.error))
    }

    worker.onerror = () => {
      worker.terminate()
      if (cancelled) {
        reject(createCancelledError())
        return
      }
      reject(new Error('文件解析失败'))
    }

    worker.postMessage({
      type: 'start',
      id: taskId,
      file,
      options: normalizedOptions,
    })
  })

  return {
    result,
    cancel: () => {
      if (cancelled) return
      cancelled = true
      worker.terminate()
    },
  }
}
