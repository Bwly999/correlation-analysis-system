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

export const scatterChartStrategy: ChartStrategy = {
  type: 'scatter',
  getEnabledTools: () => ['xField', 'filter'],
  buildModel: buildProcessedChartData,
  getYZoomExtent: (model) =>
    getScatterChartYZoomExtent(
      model.filteredRows.reduce<Array<[number, number]>>((points, row, index) => {
        const xAxisValue = getChartXAxisValue(row, index, model.xField)
        const yAxisValue = row[model.primaryKey]
        if (!isFiniteNumber(xAxisValue) || !isFiniteNumber(yAxisValue)) return points
        points.push([xAxisValue, yAxisValue])
        return points
      }, []),
    ),
  buildOption: (model, context) => {
    const option = createBaseOption()
    const points = model.filteredRows.reduce<Array<[number, number]>>((result, row, index) => {
      const xAxisValue = getChartXAxisValue(row, index, model.xField)
      const yAxisValue = row[model.primaryKey]
      if (!isFiniteNumber(xAxisValue) || !isFiniteNumber(yAxisValue)) return result
      result.push([xAxisValue, yAxisValue])
      return result
    }, [])
    option.tooltip.trigger = 'item'
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '14%', containLabel: true }
    option.xAxis = {
      type: 'value',
      ...(model.xField ? { name: model.xField } : {}),
      scale: true,
      boundaryGap: ['5%', '5%'],
      ...buildScatterValueAxisRange(points.map(([xAxisValue]) => xAxisValue)),
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
    applyVerticalZoomAxis(option.yAxis, context, getScatterChartYZoomExtent(points))

    return buildMarkedRawOption(option)
  },
}
