/// <reference lib="webworker" />

import { parseFileImportResult } from './parse'
import type { FileImportParseOptions, FileImportProgress } from './types'

type StartMessage = {
  type: 'start'
  id: string
  file: File
  options: FileImportParseOptions
}

type WorkerMessage = StartMessage

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type !== 'start') return

  const { id, file, options } = event.data

  try {
    const result = await parseFileImportResult(
      file,
      options,
      (progress: FileImportProgress) => {
        ctx.postMessage({
          type: 'progress',
          id,
          progress,
        })
      },
    )

    ctx.postMessage({
      type: 'completed',
      id,
      result,
    })
  } catch (error) {
    ctx.postMessage({
      type: 'failed',
      id,
      error: error instanceof Error ? error.message : '文件解析失败',
    })
  }
}

export {}
