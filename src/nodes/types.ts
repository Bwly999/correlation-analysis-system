export type NodeCategory = 'trigger' | 'action' | 'terminal'
export type NodeInputMode = 'single' | 'multiple'

export interface NodePropertyContext {
  config: Record<string, any>
  property: NodeProperty
}

export interface NodeProperty {
  name: string
  displayName: string
  type:
    | 'string'
    | 'textarea'
    | 'number'
    | 'options'
    | 'multi-options'
    | 'boolean'
    | 'collection'
    | 'tree'
    | 'file'
    | 'datetime-range'
    | 'json'
    | 'tags'
    | 'select-button'
  default?: any
  description?: string
  placeholder?: string
  options?: any[]
  properties?: NodeProperty[]
  required?: boolean
  isRuntimeInput?: boolean
  useUpstreamFactors?: boolean
  editable?: boolean
  filterable?: boolean
  dateOnly?: boolean
  emptyMessage?: string
  dependencies?: string[]
  resolveOptions?: (context: NodePropertyContext) => Promise<any[]> | any[]
  displayIf?: (config: any) => boolean
}

export interface NodeDefinition {
  name: string
  displayName: string
  icon: string
  category: NodeCategory
  description: string
  properties: NodeProperty[]
  inputMode?: NodeInputMode
  minInputs?: number
  maxInputs?: number | null
  execute: (input: any, config: any) => Promise<any> | any
}
