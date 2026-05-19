import type { ChartStrategy } from '../types'
import { buildMarkedRawOption, buildProcessedChartData, createBaseOption, getChartXAxisValue, getFiniteRowValue } from './shared'

export const barChartStrategy: ChartStrategy = {
  type: 'bar',
  getEnabledTools: () => ['xField', 'filter'],
  buildModel: buildProcessedChartData,
  buildOption: (model) => {
    const option = createBaseOption()
    option.tooltip.trigger = 'axis'
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
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
        data: model.filteredRows.map((row) => getFiniteRowValue(row, model.primaryKey)),
        itemStyle: { color: '#2563eb' },
      },
    ]

    return buildMarkedRawOption(option)
  },
}
