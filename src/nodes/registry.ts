import type { NodeDefinition } from './types';
import { fileImportNode } from './definitions/fileImport';
import { dataCleaningNode } from './definitions/dataCleaning';
import { neighborSystemNode } from './definitions/neighborSystem';

// 这里汇聚所有的节点定义
export const nodeDefinitions: NodeDefinition[] = [
  fileImportNode,
  dataCleaningNode,
  neighborSystemNode
  // 后续增加新节点直接在这里 import 并添加
];

// 辅助方法：快速查找定义
export const getNodeDefinition = (name: string) => {
  return nodeDefinitions.find(d => d.name === name);
};
