import type { NodeDefinition } from './types';
import { fileImportNode } from './definitions/fileImport';
import { neighborSystemNode } from './definitions/neighborSystem';
import { dataCleaningNode } from './definitions/dataCleaning';
import { dataAggregationNode } from './definitions/dataAggregation';
import { algorithmNode } from './definitions/algorithm';

export const nodeDefinitions: NodeDefinition[] = [
  fileImportNode,
  neighborSystemNode,
  dataCleaningNode,
  dataAggregationNode,
  algorithmNode
];

export const getNodeDefinition = (name: string) => {
  return nodeDefinitions.find(d => d.name === name);
};
