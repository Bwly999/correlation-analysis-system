import type { ChartStrategy } from '../types'
import { buildMarkedRawOption, buildProcessedChartData, buildScatterValueAxisRange, createBaseOption, getChartXAxisValue } from './shared'
import { isFiniteNumber } from '../tools/normalization'

export const groupedScatterStrategy: ChartStrategy = {
  type: 'grouped-scatter',
  getEnabledTools: () => ['xField', 'filter'],
  buildModel: buildProcessedChartData,
  buildOption: (model) => {
    const option = createBaseOption()
    const groupedScatterSeries = model.filteredGroups.map((group) => ({
      name: group.name,
      type: 'scatter',
      symbolSize: 8,
      data: group.data.reduce<Array<[number, number]>>((points, row, index) => {
        const xAxisValue = getChartXAxisValue(row, index, model.xField)
        const yAxisValue = row[model.primaryKey]
        if (!isFiniteNumber(xAxisValue) || !isFiniteNumber(yAxisValue)) return points
        points.push([xAxisValue, yAxisValue])
        return points
      }, []),
    }))
    const allXValues = groupedScatterSeries.flatMap((series) => series.data.map(([xAxisValue]) => xAxisValue))

    option.tooltip.trigger = 'item'
    option.legend.data = groupedScatterSeries.map((series: { name: string }) => series.name)
    option.grid = { top: '18%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
    option.xAxis = {
      type: 'value',
      ...(model.xField ? { name: model.xField } : {}),
      scale: true,
      boundaryGap: ['5%', '5%'],
      ...buildScatterValueAxisRange(allXValues),
    }
    option.yAxis = { type: 'value', name: model.primaryKey, scale: true, boundaryGap: ['15%', '15%'] }
    option.series = groupedScatterSeries

    return buildMarkedRawOption(option)
  },
}
