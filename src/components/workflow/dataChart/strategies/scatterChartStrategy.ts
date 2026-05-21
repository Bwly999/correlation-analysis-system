import type { ChartStrategy } from '../types'
import {
  applyNormalizationAxis,
  applyNativeVerticalDataZoom,
  buildMarkedRawOption,
  buildProcessedChartData,
  buildScatterValueAxisRange,
  buildTrendLineSeries,
  createBaseOption,
  createTrendLineTooltipFormatter,
  getChartXAxisValue,
} from './shared'
import { isFiniteNumber } from '../tools/normalization'

export const scatterChartStrategy: ChartStrategy = {
  type: 'scatter',
  getEnabledTools: () => ['xField', 'filter', 'normalization'],
  buildModel: buildProcessedChartData,
  buildOption: (model, context) => {
    const option = createBaseOption()
    const displayRows = context.isNormalizedView.value ? model.normalizedRows : model.filteredRows
    const trendSeriesList: Record<string, any>[] = []
    const trendLineFormulaByName = new Map<string, string>()
    const scatterSeries = model.keys.map((key) => {
      const tooltipRows: Array<{
        xAxisValue: number
        rawValue: number
        displayValue: number
      }> = []
      const points = displayRows.reduce<Array<[number, number]>>((result, row, index) => {
        const rawRow = model.filteredRows[index]
        if (!rawRow) return result

        const xAxisValue = getChartXAxisValue(rawRow, index, model.xField)
        const rawValue = rawRow[key]
        const displayValue = row[key]
        if (!isFiniteNumber(xAxisValue) || !isFiniteNumber(rawValue) || !isFiniteNumber(displayValue)) return result

        tooltipRows.push({
          xAxisValue,
          rawValue,
          displayValue,
        })
        result.push([xAxisValue, displayValue])
        return result
      }, [])

      return {
        name: key,
        type: 'scatter' as const,
        symbolSize: 8,
        data: points,
        tooltipRows,
      }
    })
    const points = scatterSeries.flatMap((series) => series.data)

    option.tooltip.trigger = 'item'
    option.tooltip.formatter = (params: Record<string, any>) => {
      const seriesName = String(params.seriesName ?? '')
      const trendLineFormula = trendLineFormulaByName.get(seriesName)
      if (trendLineFormula) {
        return createTrendLineTooltipFormatter(seriesName, trendLineFormula)()
      }

      const dataIndex = Number(params.dataIndex ?? -1)
      const series = scatterSeries.find((item) => item.name === seriesName)
      const point = series?.tooltipRows[dataIndex]
      const value = Array.isArray(params.value) ? params.value : Array.isArray(params.data) ? params.data : []
      const xAxisValue = point?.xAxisValue ?? value[0]
      const displayValue = point?.displayValue ?? value[1]
      const rawValue = point?.rawValue ?? value[1]
      const normalizationLabel = context.state.normalizationMethod.value === 'min-max' ? '归一化值' : '标准分值'

      if (context.isNormalizedView.value) {
        return [
          `<div style="padding:4px 2px;">`,
          `<div style="margin-bottom:8px;color:#0f172a;font-size:13px;font-weight:700;">${seriesName}</div>`,
          `<div style="display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:11px;color:#475569;">`,
          `<span>X 值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${xAxisValue}</span>`,
          `<span>原始值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${rawValue}</span>`,
          `<span>${normalizationLabel}</span><span style="color:#2563eb;text-align:right;font-weight:700;">${displayValue}</span>`,
          `</div>`,
          `</div>`,
        ].join('')
      }

      return [
        `<div style="padding:4px 2px;">`,
        `<div style="margin-bottom:8px;color:#0f172a;font-size:13px;font-weight:700;">${seriesName}</div>`,
        `<div style="display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:11px;color:#475569;">`,
        `<span>X 值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${xAxisValue}</span>`,
        `<span>Y 值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${displayValue}</span>`,
        `</div>`,
        `</div>`,
      ].join('')
    }
    option.legend.data = scatterSeries.map((series) => series.name)
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '14%', containLabel: true }
    option.xAxis = {
      type: 'value',
      ...(model.xField ? { name: model.xField } : {}),
      scale: true,
      boundaryGap: ['5%', '5%'],
      ...buildScatterValueAxisRange(points.map(([xAxisValue]) => xAxisValue)),
    }
    option.yAxis = {
      type: 'value',
      name: model.keys.length === 1 ? model.primaryKey : '分析因子',
      scale: true,
      boundaryGap: ['15%', '15%'],
    }
    applyNormalizationAxis(option.yAxis, context)
    option.series = scatterSeries.map(({ tooltipRows, data, ...rest }) => {
      const series: Record<string, any> = { ...rest, data, tooltip: { show: true } }
      if (context.state.trendLineEnabled.value) {
        const trendSeries = buildTrendLineSeries(data as Array<[number, number]>, {
          name: `${String(rest.name)} 趋势线`,
          coordinateMode: 'value',
        })
        if (trendSeries) {
          trendSeriesList.push(trendSeries)
          trendLineFormulaByName.set(String(trendSeries.name ?? ''), String(trendSeries.trendLineFormula ?? ''))
        }
      }
      return series
    })
    if (trendSeriesList.length > 0) {
      option.legend.data = [
        ...scatterSeries.map((series) => series.name),
        ...trendSeriesList.map((series) => String(series.name ?? '')),
      ]
    }
    option.series.push(...trendSeriesList)
    applyNativeVerticalDataZoom(
      option,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[0] : 0,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[1] : 100,
    )

    return buildMarkedRawOption(option)
  },
}
