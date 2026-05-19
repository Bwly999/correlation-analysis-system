import type { ChartStrategy } from '../types'
import { buildProcessedChartData, createNormalDistributionOption } from './shared'

export const normalDistributionStrategy: ChartStrategy = {
  type: 'normal',
  getEnabledTools: () => ['filter', 'normalization', 'outlier'],
  buildModel: buildProcessedChartData,
  buildOption: (model, context) => {
    const activeRows = context.isNormalizedView.value ? model.normalizedRows : model.filteredRows
    const xAxisName = context.isNormalizedView.value
      ? context.state.normalizationMethod.value === 'min-max'
        ? '归一化值'
        : '标准分值'
      : '原始值'
    return createNormalDistributionOption(activeRows, model.keys, xAxisName)
  },
}
