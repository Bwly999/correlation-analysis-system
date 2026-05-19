import { markRaw } from 'vue'
import { BoxSelect, Layers, LineChart as LineChartIcon } from 'lucide-vue-next'
import type { GroupedChartType, TableChartType } from './types'

export const LINE_CHART_RENDER_LIMIT = 1200
export const LINE_TOOLTIP_MAX_ROWS = 12
export const NORMAL_DISTRIBUTION_BIN_COUNT = 20
export const NORMAL_DISTRIBUTION_CURVE_POINTS = 80
export const NORMAL_DISTRIBUTION_COLUMNS = 2
export const BOX_PLOT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#475569']

export const TABLE_CHART_TYPES: TableChartType[] = ['line', 'scatter', 'bar', 'boxplot', 'normal']
export const GROUPED_CHART_TYPES: GroupedChartType[] = ['boxplot', 'grouped-scatter', 'grouped-bar']

export const BOXPLOT_WHISKER_MODE_OPTIONS = [
  { label: '1.5 IQR', value: 'iqr' as const },
  { label: '2% / 98%', value: 'percentile' as const },
]

export const CHART_VIEW_MODE_OPTIONS = [
  { label: '原始值', value: 'raw' as const },
  { label: '归一化', value: 'normalized' as const },
]

export const NORMALIZATION_METHOD_OPTIONS = [
  { label: 'Min-Max 0~1', value: 'min-max' as const },
  { label: 'Z-Score', value: 'z-score' as const },
]

export const getChartTypeOptions = (isGroupedData: boolean) => {
  if (isGroupedData) {
    return [
      { label: '多组因子对比', value: 'boxplot' as const, icon: markRaw(Layers) },
      { label: '多组散点图', value: 'grouped-scatter' as const, icon: markRaw(LineChartIcon) },
      { label: '多组柱状图', value: 'grouped-bar' as const, icon: markRaw(BoxSelect) },
    ]
  }

  return [
    { label: '折线云图', value: 'line' as const, icon: markRaw(LineChartIcon) },
    { label: '散点图', value: 'scatter' as const, icon: markRaw(LineChartIcon) },
    { label: '柱状图', value: 'bar' as const, icon: markRaw(BoxSelect) },
    { label: '箱线分布', value: 'boxplot' as const, icon: markRaw(BoxSelect) },
    { label: '正态分布', value: 'normal' as const, icon: markRaw(LineChartIcon) },
  ]
}
