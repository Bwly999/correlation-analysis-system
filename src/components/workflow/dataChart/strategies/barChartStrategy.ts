import type { ChartStrategy } from '../types'
import {
  applyNormalizationAxis,
  applyNativeVerticalDataZoom,
  buildMarkedRawOption,
  buildProcessedChartData,
  createBaseOption,
  getChartXAxisValue,
  getFiniteRowValue,
} from './shared'

export const barChartStrategy: ChartStrategy = {
  type: 'bar',
  getEnabledTools: () => ['xField', 'filter', 'normalization'],
  buildModel: buildProcessedChartData,
  buildOption: (model, context) => {
    const option = createBaseOption()
    const displayRows = context.isNormalizedView.value ? model.normalizedRows : model.filteredRows
    const seriesData = displayRows.map((row) => getFiniteRowValue(row, model.primaryKey))
    option.tooltip.trigger = 'axis'
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '14%', containLabel: true }
    option.xAxis = {
      type: 'category',
      data: model.filteredRows.map((row, index) => getChartXAxisValue(row, index, model.xField)),
      boundaryGap: true,
    }
    option.yAxis = { type: 'value', name: model.primaryKey, boundaryGap: ['0%', '15%'] }
    applyNormalizationAxis(option.yAxis, context)
    option.series = [
      {
        name: model.primaryKey,
        type: 'bar',
        data: seriesData,
        itemStyle: { color: '#2563eb' },
      },
    ]
    applyNativeVerticalDataZoom(
      option,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[0] : 0,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[1] : 100,
    )

    return buildMarkedRawOption(option)
  },
}
