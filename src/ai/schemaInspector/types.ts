export type AiSchemaSourceKind = 'canvas-cache' | 'canvas-ephemeral-run' | 'draft-ephemeral-run'

export interface AiSchemaSourceRef {
  kind: AiSchemaSourceKind
  nodeRef: string
}

export type AiSchemaDetectedType = 'number' | 'string' | 'boolean' | 'date' | 'json' | 'unknown'

export interface AiColumnSummary {
  name: string
  detectedType: AiSchemaDetectedType
  semanticTags: string[]
  nullable: boolean
  nullRate: number
  uniqueCount?: number
  uniqueRate?: number
  isConstant?: boolean
  isLikelyId?: boolean
  isLikelyCategory?: boolean
  isLikelyTarget?: boolean
  isLikelyFeature?: boolean
  sampleValues: unknown[]
}

export interface AiSchemaSummary {
  source: AiSchemaSourceRef
  resultKind: 'table' | 'tableCollection' | 'json' | 'unknown'
  rowCount?: number
  columnCount?: number
  columns: AiColumnSummary[]
  summary: {
    numericColumns: string[]
    categoricalColumns: string[]
    datetimeColumns: string[]
    candidateTargetColumns: string[]
    candidateFeatureColumns: string[]
    blockedReasons: string[]
  }
}

export interface InspectAiSchemaSummaryInput {
  source: AiSchemaSourceRef
  value: unknown
  maxSamples?: number
}
