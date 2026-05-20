import type { ChartStrategy } from '../types'
import {
  applyNativeVerticalDataZoom,
  applyNormalizationAxis,
  buildMarkedRawOption,
  buildProcessedChartData,
  buildTrendLineSeries,
  createBaseOption,
  createLineTooltipFormatter,
  getFiniteRowValue,
} from './shared'
import { normalizeSeriesValue } from '../tools/normalization'

export const lineChartStrategy: ChartStrategy = {
  type: 'line',
  getEnabledTools: () => ['sampling', 'filter', 'normalization', 'outlier'],
  buildModel: buildProcessedChartData,
  buildOption: (model, context) => {
    const option = createBaseOption()
    const sampledIndex = Array.from({ length: model.sampledRows.length }, (_, index) => index + 1)
    const activeNormalizationMethod = context.state.normalizationMethod.value
    const trendSeriesList: Record<string, any>[] = []
    const trendLineFormulaByName = new Map<string, string>()

    option.tooltip.trigger = 'axis'
    option.tooltip.axisPointer = { type: 'line', animation: false, snap: false }
    option.tooltip.triggerOn = 'mousemove'
    option.xAxis.data = sampledIndex
    option.tooltip.backgroundColor = '#ffffff'
    option.tooltip.borderColor = '#dbe5f1'
    option.tooltip.borderWidth = 1
    option.tooltip.padding = 14
    option.tooltip.extraCssText = 'box-shadow: 0 20px 45px -24px rgba(15, 23, 42, 0.28); border-radius: 18px;'
    option.tooltip.textStyle = { color: '#475569' }
    applyNormalizationAxis(option.yAxis, context)
    option.series = model.keys.map((key) => {
      const data = model.sampledRows.map((row) =>
        context.isNormalizedView.value
          ? normalizeSeriesValue(row[key], context.normalizationStats.value.get(key), activeNormalizationMethod)
          : getFiniteRowValue(row, key),
      )
      const series: Record<string, any> = {
        name: key,
        type: 'line',
        data,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        sampling: 'lttb',
        large: true,
        progressive: 800,
        progressiveThreshold: 1200,
        hoverAnimation: false,
        emphasis: { disabled: true },
      }

      if (context.state.trendLineEnabled.value) {
        const regressionPoints: Array<[number, number]> = []
        for (let i = 0; i < data.length; i++) {
          const y = data[i]
          if (typeof y === 'number' && Number.isFinite(y)) {
            regressionPoints.push([sampledIndex[i]!, y])
          }
        }
        const trendSeries = buildTrendLineSeries(regressionPoints, {
          name: `${key} 趋势线`,
          coordinateMode: 'category',
          categoryXAxisValues: sampledIndex,
        })
        if (trendSeries) {
          trendSeriesList.push(trendSeries)
          trendLineFormulaByName.set(key, String(trendSeries.trendLineFormula ?? ''))
        }
      }

      return series
    })
    option.tooltip.formatter = createLineTooltipFormatter(model.sampledRows, context, trendLineFormulaByName)
    option.series.push(...trendSeriesList)
    applyNativeVerticalDataZoom(
      option,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[0] : 0,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[1] : 100,
    )

    return buildMarkedRawOption(option)
  },
}
