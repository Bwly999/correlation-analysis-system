import type { KanbanFactorValue, KanbanTreeNode } from '@/services/kanbanIntegration'

export const CUSTOM_FACTOR_FIELDS = [
  'factorKey',
  'factorName',
  'materialType',
  'processName',
  'r2Name',
] as const

export type CustomFactorField = (typeof CUSTOM_FACTOR_FIELDS)[number]

export interface CustomFactorRecord extends KanbanFactorValue {
  identityKey: string
}

export interface CustomFactorGroup {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  factors: CustomFactorRecord[]
}

export interface CustomFactorFieldDraft {
  value: string
  locked: boolean
}

export type CustomFactorDraft = Record<CustomFactorField, CustomFactorFieldDraft>

export interface CustomFactorDraftFieldStats {
  lineCount: number
  locked: boolean
}

export type CustomFactorDraftStats = Record<CustomFactorField, CustomFactorDraftFieldStats>

export type CustomFactorColumnMapping = Record<CustomFactorField, string>

export type CustomFactorTreeNode = KanbanTreeNode
