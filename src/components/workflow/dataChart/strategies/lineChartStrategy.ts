import type { ChartStrategy } from '../types'
import {
  applyNativeVerticalDataZoom,
  applyNormalizationAxis,
  buildMarkedRawOption,
  buildProcessedChartData,
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
    option.tooltip.formatter = createLineTooltipFormatter(model.sampledRows, context)
    applyNormalizationAxis(option.yAxis, context)
    option.series = model.keys.map((key) => ({
      name: key,
      type: 'line',
      data: model.sampledRows.map((row) =>
        context.isNormalizedView.value
          ? normalizeSeriesValue(row[key], context.normalizationStats.value.get(key), activeNormalizationMethod)
          : getFiniteRowValue(row, key),
      ),
      showSymbol: false,
      lineStyle: { width: 2.5 },
      sampling: 'lttb',
      large: true,
      progressive: 800,
      progressiveThreshold: 1200,
      hoverAnimation: false,
      emphasis: { disabled: true },
    }))
    applyNativeVerticalDataZoom(
      option,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[0] : 0,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[1] : 100,
    )

    return buildMarkedRawOption(option)
  },
}
