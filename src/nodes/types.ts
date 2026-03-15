export type NodeCategory = 'trigger' | 'action' | 'terminal'
export type NodeInputMode = 'single' | 'multiple'

export interface NodeProperty {
  name: string
  displayName: string
  type:
    | 'string'
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
  default?: any
  description?: string
  placeholder?: string
  options?: any[] // 用于 options 类型、multi-options 或 tree 类型的静态选项
  properties?: NodeProperty[] // 用于 collection 类型定义每一项的结构
  required?: boolean
  isRuntimeInput?: boolean
  useUpstreamFactors?: boolean // [新增] 是否自动拉取上游字段作为选项
  editable?: boolean // [新增] Select 选项是否允许手动编辑输入
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
  // 执行逻辑：输入数据 + 用户配置 -> 输出结果
  execute: (input: any, config: any) => Promise<any> | any
}
