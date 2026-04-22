import type { NodeProperty } from '@/nodes/types'

export const NUMERIC_ANALYSIS_FIELD_NAMES = [
  'xFields',
  'yFields',
  'targetField',
  'factorNames',
] as const satisfies readonly string[]

export const PROPERTY_FIELD_OPTION_ITEM_SIZE = 44
export const PROPERTY_FIELD_MULTI_OPTIONS_MAX_SELECTED_LABELS = 3
export const PROPERTY_FIELD_MULTI_OPTIONS_SELECTED_LABEL = '{0} 项已选'

export type NonCollectionPropertyType = Exclude<NodeProperty['type'], 'collection'>
