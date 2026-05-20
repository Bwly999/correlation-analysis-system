import type { ChartStrategy } from '../types'
import {
  applyVerticalZoomAxis,
  buildMarkedRawOption,
  buildProcessedChartData,
  buildScatterValueAxisRange,
  createBaseOption,
  getChartXAxisValue,
  getScatterChartYZoomExtent,
} from './shared'
import { isFiniteNumber } from '../tools/normalization'

export const groupedScatterStrategy: ChartStrategy = {
  type: 'grouped-scatter',
  getEnabledTools: () => ['xField', 'filter'],
  buildModel: buildProcessedChartData,
  buildOption: (model, context) => {
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
    const allPoints = groupedScatterSeries.flatMap((series) => series.data)

    option.tooltip.trigger = 'item'
    option.legend.data = groupedScatterSeries.map((series: { name: string }) => series.name)
    option.grid = { top: '18%', bottom: '15%', left: '10%', right: '14%', containLabel: true }
    option.xAxis = {
      type: 'value',
      ...(model.xField ? { name: model.xField } : {}),
      scale: true,
      boundaryGap: ['5%', '5%'],
      ...buildScatterValueAxisRange(allPoints.map(([xAxisValue]) => xAxisValue)),
    }
    option.yAxis = { type: 'value', name: model.primaryKey, scale: true, boundaryGap: ['15%', '15%'] }
    option.series = groupedScatterSeries
    applyVerticalZoomAxis(option.yAxis, context, getScatterChartYZoomExtent(allPoints))

    return buildMarkedRawOption(option)
  },
}
