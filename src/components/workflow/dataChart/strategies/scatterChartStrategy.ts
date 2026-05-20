import type { ChartStrategy } from '../types'
import {
  applyNativeVerticalDataZoom,
  buildMarkedRawOption,
  buildProcessedChartData,
  buildScatterValueAxisRange,
  createBaseOption,
  getChartXAxisValue,
} from './shared'
import { isFiniteNumber } from '../tools/normalization'

export const scatterChartStrategy: ChartStrategy = {
  type: 'scatter',
  getEnabledTools: () => ['xField', 'filter'],
  buildModel: buildProcessedChartData,
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
    applyNativeVerticalDataZoom(
      option,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[0] : 0,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[1] : 100,
    )

    return buildMarkedRawOption(option)
  },
}
