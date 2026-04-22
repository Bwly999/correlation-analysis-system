import type { NodeResult } from '../result'

export type FileImportResolvedFormat = 'csv' | 'xlsx' | 'json'

export interface FileImportParseOptions {
  format?: string
  autoClean?: boolean
  excludeFields?: string[] | string
}

export type FileImportProgressPhase =
  | 'reading'
  | 'parsing'
  | 'cleaning'
  | 'finalizing'

export interface FileImportProgress {
  phase: FileImportProgressPhase
  progress: number
}

export interface FileImportTask {
  result: Promise<NodeResult<Array<Record<string, unknown>>>>
  cancel: () => void
}
