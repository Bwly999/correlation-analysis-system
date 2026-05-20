import type { ChartStrategy } from '../types'
import {
  applyVerticalZoomAxis,
  buildMarkedRawOption,
  buildProcessedChartData,
  createBaseOption,
  getBarChartYZoomExtent,
  getChartXAxisValue,
  getFiniteRowValue,
} from './shared'

export const barChartStrategy: ChartStrategy = {
  type: 'bar',
  getEnabledTools: () => ['xField', 'filter'],
  buildModel: buildProcessedChartData,
  buildOption: (model, context) => {
    const option = createBaseOption()
    const seriesData = model.filteredRows.map((row) => getFiniteRowValue(row, model.primaryKey))
    option.tooltip.trigger = 'axis'
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '14%', containLabel: true }
    option.xAxis = {
      type: 'category',
      data: model.filteredRows.map((row, index) => getChartXAxisValue(row, index, model.xField)),
      boundaryGap: true,
    }
    option.yAxis = { type: 'value', boundaryGap: ['0%', '15%'] }
    option.series = [
      {
        name: model.primaryKey,
        type: 'bar',
        data: seriesData,
        itemStyle: { color: '#2563eb' },
      },
    ]
    applyVerticalZoomAxis(option.yAxis, context, getBarChartYZoomExtent(seriesData))

    return buildMarkedRawOption(option)
  },
}
