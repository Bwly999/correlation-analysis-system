import type { NodeResult } from './result'
import type { NodeAssistantHints, NodeHelpDoc } from '@/help/types'

export type NodeCategory = 'trigger' | 'action' | 'terminal'
export type NodeInputMode = 'single' | 'multiple'

export type NodeExecutionJsonPrimitive = string | number | boolean | null
export type NodeExecutionJsonValue =
  | NodeExecutionJsonPrimitive
  | NodeExecutionJsonValue[]
  | { [key: string]: NodeExecutionJsonValue }

export type NodeExecutionValue = NodeResult | NodeExecutionJsonValue | File | undefined

export interface MultipleNodeExecutionItem<TResult = NodeResult | null> {
  sourceNodeId: string
  sourceNodeLabel: string
  edgeId?: string
  order?: number
  result: TResult
}

export interface MultipleNodeExecutionInput<TResult = NodeResult | null> {
  inputs?: Array<MultipleNodeExecutionItem<TResult>>
}

export type NodeExecuteFunction<TInput, TConfig, TOutput> = {
  bivarianceHack(input: TInput, config: TConfig): Promise<TOutput> | TOutput
}['bivarianceHack']

export interface NodePropertyContext {
  config: Record<string, any>
  property: NodeProperty
  nodeId?: string | null
  inputData?: unknown
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
  editorLanguage?: 'json' | 'javascript' | 'typescript'
  editorDeclarations?: string
  editorHeight?: string
  options?: any[]
  properties?: NodeProperty[]
  required?: boolean
  isRuntimeInput?: boolean
  useUpstreamFactors?: boolean
  editable?: boolean
  forceInput?: boolean
  filterable?: boolean
  allowRegexSearch?: boolean
  filterPlaceholder?: string
  dateOnly?: boolean
  emptyMessage?: string
  dependencies?: string[]
  resolveOptions?: (context: NodePropertyContext) => Promise<any[]> | any[]
  displayIf?: (config: any) => boolean
}

export interface NodeDefinition<
  TInput = any,
  TConfig = Record<string, any>,
  TOutput = any,
> {
  name: string
  displayName: string
  icon: string
  category: NodeCategory
  description: string
  help?: NodeHelpDoc
  assistantHints?: NodeAssistantHints
  properties: NodeProperty[]
  inputMode?: NodeInputMode
  minInputs?: number
  maxInputs?: number | null
  execute: NodeExecuteFunction<TInput, TConfig, TOutput>
}
