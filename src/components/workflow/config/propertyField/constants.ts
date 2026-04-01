import type { NodeProperty } from '@/nodes/types'

export const NUMERIC_ANALYSIS_FIELD_NAMES = [
  'xFields',
  'yFields',
  'targetField',
  'factorNames',
] as const satisfies readonly string[]

export type NonCollectionPropertyType = Exclude<NodeProperty['type'], 'collection'>
