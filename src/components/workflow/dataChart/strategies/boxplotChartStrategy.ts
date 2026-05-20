import type { ChartStrategy } from '../types'
import {
  applyNativeVerticalDataZoom,
  applyNormalizationAxis,
  buildBoxStatsByKey,
  buildGroupedScatterOffset,
  buildMarkedRawOption,
  buildProcessedChartData,
  createBoxplotBaseOption,
  createBoxplotDataItem,
  createBoxplotOutlierTooltipFormatter,
  toRgba,
} from './shared'
import { BOX_PLOT_COLORS } from '../constants'

export const boxplotChartStrategy: ChartStrategy = {
  type: 'boxplot',
  getEnabledTools: () => ['filter', 'normalization', 'outlier', 'boxplotWhisker'],
  buildModel: buildProcessedChartData,
  buildOption: (model, context) => {
    const whiskerModeLabel =
      context.state.boxplotWhiskerMode.value === 'percentile' ? '2% / 98%' : '1.5 IQR'

    if (context.source.isGroupedData.value) {
      const option = createBoxplotBaseOption(model.keys, whiskerModeLabel)
      applyNormalizationAxis(option.yAxis, context)
      const activeGroups = context.isNormalizedView.value ? model.normalizedGroups : model.filteredGroups
      const boxValuesByGroup = activeGroups.map((group) =>
        model.keys.map((key) => buildBoxStatsByKey(group.data || [], [key], context.state.boxplotWhiskerMode.value)[0]!.boxValues),
      )
      const boxplotSeries = activeGroups.map((group, index) => {
        const color = BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!
        return {
          name: group.name,
          type: 'boxplot',
          data: model.keys.map((key) => buildBoxStatsByKey(group.data || [], [key], context.state.boxplotWhiskerMode.value)[0]!.boxValues),
          itemStyle: {
            color: toRgba(color, 0.2),
            borderColor: color,
            borderWidth: 1.5,
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              borderWidth: 2.5,
            },
          },
        }
      })

      const outlierSeries = activeGroups.flatMap((group, index, groups) => {
        const color = BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!
        const scatterData = model.keys.flatMap((key, keyIndex) =>
          buildBoxStatsByKey(group.data || [], [key], context.state.boxplotWhiskerMode.value)[0]!.outliers.map((value) => ({
            value: [keyIndex, value] as [number, number],
            factorName: key,
            groupName: group.name,
          })),
        )
        if (scatterData.length === 0) return []
        return [
          {
            name: `${group.name}-离群点`,
            type: 'scatter',
            data: scatterData,
            symbolSize: 8,
            symbolOffset: buildGroupedScatterOffset(index, groups.length),
            z: 4,
            legendHoverLink: false,
            itemStyle: { color, borderColor: '#ffffff', borderWidth: 1.2 },
            tooltip: { trigger: 'item', formatter: createBoxplotOutlierTooltipFormatter(whiskerModeLabel) },
          },
        ]
      })
      applyNativeVerticalDataZoom(
        option,
        context.state.yZoomEnabled.value ? context.state.yZoomRange.value[0] : 0,
        context.state.yZoomEnabled.value ? context.state.yZoomRange.value[1] : 100,
        {
          top: 56,
          bottom: 40,
        },
      )

      option.legend.data = boxplotSeries.map((series: { name: string }) => series.name)
      option.series = [...boxplotSeries, ...outlierSeries]
      return buildMarkedRawOption(option)
    }

    const option = createBoxplotBaseOption(model.keys, whiskerModeLabel)
    applyNormalizationAxis(option.yAxis, context)
    const activeRows = context.isNormalizedView.value ? model.normalizedRows : model.filteredRows
    const boxStatsByKey = buildBoxStatsByKey(activeRows, model.keys, context.state.boxplotWhiskerMode.value)
    const outlierData = boxStatsByKey.flatMap((stats, index) =>
      stats.outliers.map((value) => ({
        value: [index, value] as [number, number],
        factorName: model.keys[index] ?? '',
      })),
    )
    option.legend.data = ['数据分布']
    option.series = [
      {
        name: '数据分布',
        type: 'boxplot',
        data: boxStatsByKey.map((stats, index) => createBoxplotDataItem(stats.boxValues, BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!)),
        itemStyle: {
          color: toRgba(BOX_PLOT_COLORS[0]!, 0.18),
          borderColor: BOX_PLOT_COLORS[0],
          borderWidth: 1.5,
        },
        emphasis: { focus: 'series', itemStyle: { borderWidth: 2.5 } },
      },
    ]
    applyNativeVerticalDataZoom(
      option,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[0] : 0,
      context.state.yZoomEnabled.value ? context.state.yZoomRange.value[1] : 100,
      {
        top: 56,
        bottom: 40,
      },
    )
    if (outlierData.length > 0) {
      option.series.push({
        name: '离群点',
        type: 'scatter',
        data: outlierData,
        symbolSize: 8,
        z: 4,
        legendHoverLink: false,
        itemStyle: { color: '#0f172a', borderColor: '#ffffff', borderWidth: 1.2 },
        tooltip: { trigger: 'item', formatter: createBoxplotOutlierTooltipFormatter(whiskerModeLabel) },
      })
    }

    return buildMarkedRawOption(option)
  },
}
