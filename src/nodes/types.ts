export type NodeCategory = 'trigger' | 'action' | 'model';
export interface NodeProperty {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'options' | 'boolean' | 'collection' | 'tree' | 'file' | 'datetime-range';
  default?: any;
  description?: string;
  placeholder?: string;
  options?: { name: string; value: any }[]; // 仅用于 type: 'options'
  required?: boolean;
  isRuntimeInput?: boolean; // 新增：标记是否为运行时输入参数
}

  required?: boolean;
}

export interface NodeDefinition {
  name: string; // 唯一标识，如 'file-import'
  displayName: string;
  icon: string;
  category: NodeCategory;
  description: string;
  properties: NodeProperty[];
  // 执行逻辑：输入数据 + 用户配置 -> 输出结果
  execute: (input: any, config: any) => Promise<any> | any;
}
