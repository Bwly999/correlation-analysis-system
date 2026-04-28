import type { NodeDefinition } from './types.js'
import { attachNodeHelp } from './helpCatalog.js'
import { fileImportNode } from './definitions/fileImport.js'
import { manualJsonImportNode } from './definitions/manualJsonImport.js'
import { neighborSystemNode } from './definitions/neighborSystem.js'
import { dataCleaningNode } from './definitions/dataCleaning.js'
import { dataDedupNode } from './definitions/dataDedup.js'
import { dataMissingOutlierNode } from './definitions/dataMissingOutlier.js'
import { dataEncodingScalingNode } from './definitions/dataEncodingScaling.js'
import { dataProfilingNode } from './definitions/dataProfiling.js'
import { dataAggregationNode } from './definitions/dataAggregation.js'
import { dataMergeNode } from './definitions/dataMerge.js'
import { dataFilterNode } from './definitions/dataFilter.js'
import { jsTransformNode } from './definitions/jsTransform.js'
import { fieldSelectionNode } from './definitions/fieldSelection.js'
import { sortNode } from './definitions/sort.js'
import { dataLimitNode } from './definitions/dataLimit.js'
import { xgboostShapNode } from './definitions/xgboostShap.js'
import { lassoNode } from './definitions/lasso.js'
import { multipleLinearRegressionNode } from './definitions/multipleLinearRegression.js'
import { randomForestFeatureImportanceNode } from './definitions/randomForestFeatureImportance.js'
import { anovaNode } from './definitions/anova.js'
import { classificationFactorScreeningNode } from './definitions/classificationFactorScreening.js'
import { pcaNode } from './definitions/pca.js'
import { correlationAnalysisNode } from './definitions/correlationAnalysis.js'
import { pearsonNode } from './definitions/pearson.js'
import { spearmanNode } from './definitions/spearman.js'
import { kendallNode } from './definitions/kendall.js'
import { vifNode } from './definitions/vif.js'
import { dataExportNode } from './definitions/dataExport.js'
import { chartDisplayNode } from './definitions/chartDisplay.js'
import { logisticRegressionClassificationNode } from './definitions/logisticRegressionClassification.js'

const rawNodeDefinitions: NodeDefinition[] = [
  fileImportNode,
  manualJsonImportNode,
  neighborSystemNode,
  dataCleaningNode,
  dataDedupNode,
  dataMissingOutlierNode,
  dataEncodingScalingNode,
  dataProfilingNode,
  dataAggregationNode,
  dataMergeNode,
  dataFilterNode,
  jsTransformNode,
  fieldSelectionNode,
  sortNode,
  dataLimitNode,
  xgboostShapNode,
  lassoNode,
  multipleLinearRegressionNode,
  randomForestFeatureImportanceNode,
  anovaNode,
  classificationFactorScreeningNode,
  pcaNode,
  correlationAnalysisNode,
  vifNode,
  pearsonNode,
  spearmanNode,
  kendallNode,
  logisticRegressionClassificationNode,
  dataExportNode,
  chartDisplayNode,
]

export const nodeDefinitions: NodeDefinition[] = rawNodeDefinitions.map((definition) =>
  attachNodeHelp(definition),
)

export const creatableNodeDefinitions: NodeDefinition[] = nodeDefinitions.filter(
  (definition) => !definition.isLegacy,
)

export const getNodeDefinition = (name: string) => {
  return nodeDefinitions.find((d) => d.name === name)
}
