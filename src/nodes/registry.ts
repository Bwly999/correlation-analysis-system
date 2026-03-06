import type { NodeDefinition } from './types';
import { fileImportNode } from './definitions/fileImport';
import { neighborSystemNode } from './definitions/neighborSystem';
import { dataCleaningNode } from './definitions/dataCleaning';
import { dataAggregationNode } from './definitions/dataAggregation';
import { algorithmNode } from './definitions/algorithm';
import { dataExportNode } from './definitions/dataExport';
import { chartDisplayNode } from './definitions/chartDisplay';

export const nodeDefinitions: NodeDefinition[] = [
  fileImportNode,
  neighborSystemNode,
  dataCleaningNode,
  dataAggregationNode,
  algorithmNode,
  dataExportNode,
  chartDisplayNode
];

export const getNodeDefinition = (name: string) => {
  return nodeDefinitions.find(d => d.name === name);
};
