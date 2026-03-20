import type { NodeDefinition } from './types'
import { attachNodeHelp } from './helpCatalog'
import { fileImportNode } from './definitions/fileImport'
import { manualJsonImportNode } from './definitions/manualJsonImport'
import { neighborSystemNode } from './definitions/neighborSystem'
import { dataCleaningNode } from './definitions/dataCleaning'
import { dataProfilingNode } from './definitions/dataProfiling'
import { dataAggregationNode } from './definitions/dataAggregation'
import { dataMergeNode } from './definitions/dataMerge'
import { dataFilterNode } from './definitions/dataFilter'
import { fieldSelectionNode } from './definitions/fieldSelection'
import { sortNode } from './definitions/sort'
import { dataLimitNode } from './definitions/dataLimit'
import { dataKeyMergeNode } from './definitions/dataKeyMerge'
import { xgboostShapNode } from './definitions/xgboostShap'
import { lassoNode } from './definitions/lasso'
import { pearsonNode } from './definitions/pearson'
import { spearmanNode } from './definitions/spearman'
import { kendallNode } from './definitions/kendall'
import { dataExportNode } from './definitions/dataExport'
import { chartDisplayNode } from './definitions/chartDisplay'

const rawNodeDefinitions: NodeDefinition[] = [
  fileImportNode,
  manualJsonImportNode,
  neighborSystemNode,
  dataCleaningNode,
  dataProfilingNode,
  dataAggregationNode,
  dataMergeNode,
  dataFilterNode,
  fieldSelectionNode,
  sortNode,
  dataLimitNode,
  dataKeyMergeNode,
  xgboostShapNode,
  lassoNode,
  pearsonNode,
  spearmanNode,
  kendallNode,
  dataExportNode,
  chartDisplayNode,
]

export const nodeDefinitions: NodeDefinition[] = rawNodeDefinitions.map((definition) =>
  attachNodeHelp(definition),
)

export const getNodeDefinition = (name: string) => {
  return nodeDefinitions.find((d) => d.name === name)
}
