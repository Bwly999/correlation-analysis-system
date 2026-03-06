export type NodeCategory = 'trigger' | 'action' | 'terminal';

export interface NodeProperty {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'options' | 'multi-options' | 'boolean' | 'collection' | 'tree' | 'file' | 'datetime-range';
  default?: any;
  description?: string;
  placeholder?: string;
  options?: any[]; // 用于 options 类型、multi-options 或 tree 类型的静态选项
  properties?: NodeProperty[]; // 用于 collection 类型定义每一项的结构
  required?: boolean;
  isRuntimeInput?: boolean; 
}

export interface NodeDefinition {
  name: string; 
  displayName: string;
  icon: string;
  category: NodeCategory;
  description: string;
  properties: NodeProperty[];
  // 执行逻辑：输入数据 + 用户配置 -> 输出结果
  execute: (input: any, config: any) => Promise<any> | any;
}
