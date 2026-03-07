import type { NodeDefinition } from './types';
import { fileImportNode } from './definitions/fileImport';
import { neighborSystemNode } from './definitions/neighborSystem';
import { dataCleaningNode } from './definitions/dataCleaning';
import { dataAggregationNode } from './definitions/dataAggregation';
import { xgboostShapNode } from './definitions/xgboostShap';
import { lassoNode } from './definitions/lasso';
import { pearsonNode } from './definitions/pearson';
import { dataExportNode } from './definitions/dataExport';
import { chartDisplayNode } from './definitions/chartDisplay';

export const nodeDefinitions: NodeDefinition[] = [
  fileImportNode,
  neighborSystemNode,
  dataCleaningNode,
  dataAggregationNode,
  xgboostShapNode,
  lassoNode,
  pearsonNode,
  dataExportNode,
  chartDisplayNode
];

export const getNodeDefinition = (name: string) => {
  return nodeDefinitions.find(d => d.name === name);
};
