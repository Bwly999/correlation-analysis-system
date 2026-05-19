import type { ChartStrategy } from '../types'
import { buildMarkedRawOption, buildProcessedChartData, createBaseOption } from './shared'
import { isFiniteNumber } from '../tools/normalization'

export const groupedBarStrategy: ChartStrategy = {
  type: 'grouped-bar',
  getEnabledTools: () => ['filter'],
  buildModel: buildProcessedChartData,
  buildOption: (model) => {
    const option = createBaseOption()
    option.tooltip.trigger = 'axis'
    option.legend.data = [model.primaryKey]
    option.grid = { top: '18%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
    option.xAxis = {
      type: 'category',
      data: model.filteredGroups.map((group) => group.name),
      boundaryGap: true,
    }
    option.yAxis = { type: 'value', boundaryGap: ['0%', '15%'] }
    option.series = [
      {
        name: model.primaryKey,
        type: 'bar',
        data: model.filteredGroups.map((group) => {
          const firstValidRow = group.data.find((row) => isFiniteNumber(row[model.primaryKey]))
          return firstValidRow ? (firstValidRow[model.primaryKey] as number) : null
        }),
        itemStyle: { color: '#2563eb' },
      },
    ]

    return buildMarkedRawOption(option)
  },
}
