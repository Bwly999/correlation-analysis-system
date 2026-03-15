import type { NodeDefinition } from './types'
import { fileImportNode } from './definitions/fileImport'
import { manualJsonImportNode } from './definitions/manualJsonImport'
import { neighborSystemNode } from './definitions/neighborSystem'
import { dataCleaningNode } from './definitions/dataCleaning'
import { dataProfilingNode } from './definitions/dataProfiling'
import { dataAggregationNode } from './definitions/dataAggregation'
import { appendNode } from './definitions/append'
import { objectMergeNode } from './definitions/objectMerge'
import { dataFilterNode } from './definitions/dataFilter'
import { xgboostShapNode } from './definitions/xgboostShap'
import { lassoNode } from './definitions/lasso'
import { pearsonNode } from './definitions/pearson'
import { spearmanNode } from './definitions/spearman'
import { kendallNode } from './definitions/kendall'
import { dataExportNode } from './definitions/dataExport'
import { chartDisplayNode } from './definitions/chartDisplay'

export const nodeDefinitions: NodeDefinition[] = [
  fileImportNode,
  manualJsonImportNode,
  neighborSystemNode,
  dataCleaningNode,
  dataProfilingNode,
  dataAggregationNode,
  appendNode,
  objectMergeNode,
  dataFilterNode,
  xgboostShapNode,
  lassoNode,
  pearsonNode,
  spearmanNode,
  kendallNode,
  dataExportNode,
  chartDisplayNode,
]

export const getNodeDefinition = (name: string) => {
  return nodeDefinitions.find((d) => d.name === name)
}
