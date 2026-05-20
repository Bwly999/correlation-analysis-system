import type { ChartStrategy } from '../types'
import { buildMarkedRawOption, buildProcessedChartData, buildScatterValueAxisRange, createBaseOption, getChartXAxisValue } from './shared'
import { isFiniteNumber } from '../tools/normalization'

export const scatterChartStrategy: ChartStrategy = {
  type: 'scatter',
  getEnabledTools: () => ['xField', 'filter'],
  buildModel: buildProcessedChartData,
  buildOption: (model) => {
    const points = model.filteredRows.reduce<Array<[number, number]>>((points, row, index) => {
      const xAxisValue = getChartXAxisValue(row, index, model.xField)
      const yAxisValue = row[model.primaryKey]
      if (!isFiniteNumber(xAxisValue) || !isFiniteNumber(yAxisValue)) return points
      points.push([xAxisValue, yAxisValue])
      return points
    }, [])
    const option = createBaseOption()
    option.tooltip.trigger = 'item'
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
    option.xAxis = {
      type: 'value',
      ...(model.xField ? { name: model.xField } : {}),
      scale: true,
      ...buildScatterValueAxisRange(points.map(([xAxisValue]) => xAxisValue)),
      boundaryGap: ['5%', '5%'],
    }
    option.yAxis = { type: 'value', name: model.primaryKey, scale: true, boundaryGap: ['15%', '15%'] }
    option.series = [
      {
        type: 'scatter',
        symbolSize: 8,
        data: points,
        itemStyle: { color: '#0ea5e9' },
      },
    ]

    return buildMarkedRawOption(option)
  },
}
