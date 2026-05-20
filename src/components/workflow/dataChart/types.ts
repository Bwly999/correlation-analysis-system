import type { ComputedRef, Ref } from 'vue'
import type { EChartsOption } from 'echarts'
import type { BoxplotWhiskerMode } from '@/utils/stats'
import type { NodePreviewChartDefaults } from '@/nodes/result'

export type ChartRow = Record<string, unknown>

export type ChartGroup = {
  name: string
  data: ChartRow[]
}

export type NormalizationMethod = 'min-max' | 'z-score'
export type ChartViewMode = 'raw' | 'normalized'

export type GroupedChartType = 'boxplot' | 'grouped-scatter' | 'grouped-bar'
export type TableChartType = 'line' | 'scatter' | 'bar' | 'boxplot' | 'normal'
export type ChartType = TableChartType | GroupedChartType

export type ChartToolKey =
  | 'sampling'
  | 'filter'
  | 'normalization'
  | 'outlier'
  | 'xField'
  | 'boxplotWhisker'

export type SeriesStats = {
  min: number
  max: number
  mean: number
  std: number
}

export type ChartFilterPreset = {
  id: string
  name: string
  lowerBound: number | null
  upperBound: number | null
  updatedAt: number
}

export type ChartYZoomRange = [number, number]
export type ChartNumericExtent = [number, number]

export type DataChartState = {
  chartType: Ref<ChartType>
  maxPoints: Ref<number>
  selectedKeys: Ref<string[]>
  xField: Ref<string | null>
  lowerBound: Ref<number | null>
  upperBound: Ref<number | null>
  viewMode: Ref<ChartViewMode>
  normalizationMethod: Ref<NormalizationMethod>
  skipInvalidRows: Ref<boolean>
  boxplotWhiskerMode: Ref<BoxplotWhiskerMode>
  isPresetPanelOpen: Ref<boolean>
  presetNameInput: Ref<string>
  selectedPresetId: Ref<string | null>
  savedPresets: Ref<ChartFilterPreset[]>
  defaultPresetId: Ref<string | 'none' | null>
  yZoomEnabled: Ref<boolean>
  yZoomRange: Ref<ChartYZoomRange>
  yZoomBaseExtent: Ref<ChartNumericExtent | null>
  showsXAxisFieldSelector: ComputedRef<boolean>
}

export type DataChartSource = {
  groupedData: ComputedRef<ChartGroup[]>
  tableRows: ComputedRef<ChartRow[]>
  isGroupedData: ComputedRef<boolean>
  hasRenderableData: ComputedRef<boolean>
  availableKeys: ComputedRef<string[]>
  allFieldNames: ComputedRef<string[]>
  categoricalFieldNames: ComputedRef<string[]>
  availableXAxisOptions: ComputedRef<string[]>
  previewChartDefaults: ComputedRef<NodePreviewChartDefaults | null>
}

export type ProcessedChartData = {
  keys: string[]
  primaryKey: string
  xField: string | null
  filteredRows: ChartRow[]
  filteredGroups: ChartGroup[]
  normalizedRows: ChartRow[]
  normalizedGroups: ChartGroup[]
  lineRows: ChartRow[]
  sampledRows: ChartRow[]
}

export type ChartContext = {
  state: DataChartState
  source: DataChartSource
  filteredData: ComputedRef<ChartRow[] | ChartGroup[]>
  filteredSummary: ComputedRef<number>
  normalizedKeys: ComputedRef<string[]>
  normalizationStats: ComputedRef<Map<string, SeriesStats>>
  isNormalizedView: ComputedRef<boolean>
  lineRenderableRows: ComputedRef<ChartRow[]>
  chartHostStyle: ComputedRef<Record<string, string> | undefined>
}

export type ChartStrategy = {
  type: ChartType
  getEnabledTools: () => ChartToolKey[]
  buildModel: (context: ChartContext) => ProcessedChartData
  getYZoomExtent?: (model: ProcessedChartData, context: ChartContext) => ChartNumericExtent | null
  buildOption: (model: ProcessedChartData, context: ChartContext) => EChartsOption
}
