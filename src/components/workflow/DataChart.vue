<script setup lang="ts">
import { computed, markRaw, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, BoxplotChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  TransformComponent,
} from 'echarts/components'
import Select from 'primevue/select'
import { BoxSelect, Layers, LineChart as LineChartIcon, ListChecks } from 'lucide-vue-next'
import SearchAppendMultiSelect from './common/SearchAppendMultiSelect.vue'
import { useWorkflowOverlayHost } from './workflowOverlayHost'
import { CHART_VIEW_MODE_OPTIONS, NORMALIZATION_METHOD_OPTIONS, getChartTypeOptions } from './dataChart/constants'
import type { ChartContext, ChartType } from './dataChart/types'
import ChartBoxplotOutlierToggle from './dataChart/controls/ChartBoxplotOutlierToggle.vue'
import { useChartFilterPresets } from './dataChart/useChartFilterPresets'
import { useDataChartSource } from './dataChart/useDataChartSource'
import { useDataChartState } from './dataChart/useDataChartState'
import ChartBoxplotWhiskerTool from './dataChart/controls/ChartBoxplotWhiskerTool.vue'
import ChartFilterTool from './dataChart/controls/ChartFilterTool.vue'
import ChartNormalizationTool from './dataChart/controls/ChartNormalizationTool.vue'
import ChartOutlierTool from './dataChart/controls/ChartOutlierTool.vue'
import ChartSamplingTool from './dataChart/controls/ChartSamplingTool.vue'
import ChartTrendLineTool from './dataChart/controls/ChartTrendLineTool.vue'
import ChartXAxisFieldTool from './dataChart/controls/ChartXAxisFieldTool.vue'
import { useChartFiltering } from './dataChart/tools/useChartFiltering'
import { useChartNormalization } from './dataChart/tools/useChartNormalization'
import { useChartOutlierHandling } from './dataChart/tools/useChartOutlierHandling'
import { useChartSampling } from './dataChart/tools/useChartSampling'
import { getChartStrategy } from './dataChart/strategies'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  BoxplotChart,
  ScatterChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  DatasetComponent,
  TransformComponent,
  MarkLineComponent,
])

const props = defineProps<{
  data: unknown
  storageScopeKey?: string
}>()

const { overlayAppendTo } = useWorkflowOverlayHost()
const sourceChartType = shallowRef<ChartType>('line')

const source = useDataChartSource({
  data: props.data,
  chartType: () => sourceChartType.value,
})

const state = useDataChartState({
  storageScopeKey: props.storageScopeKey,
  isGroupedData: () => source.isGroupedData.value,
  hasRenderableData: () => source.hasRenderableData.value,
  availableKeys: () => source.availableKeys.value,
  allFieldNames: () => source.allFieldNames.value,
  availableXAxisOptions: () => source.availableXAxisOptions.value,
  previewChartDefaults: () => source.previewChartDefaults.value,
})

watch(
  state.chartType,
  (value) => {
    sourceChartType.value = value
  },
  { immediate: true },
)

const normalizedKeys = computed(() =>
  state.selectedKeys.value.length > 0 ? state.selectedKeys.value : source.availableKeys.value.slice(0, 1),
)

const filtering = useChartFiltering({
  isGroupedData: source.isGroupedData,
  groupedData: source.groupedData,
  tableRows: source.tableRows,
  normalizedKeys,
  lowerBound: state.lowerBound,
  upperBound: state.upperBound,
})

const filteredRows = computed(() =>
  source.isGroupedData.value ? [] : (filtering.filteredData.value as Array<Record<string, unknown>>),
)

const outlierHandling = useChartOutlierHandling({
  isGroupedData: source.isGroupedData,
  chartType: state.chartType,
  skipInvalidRows: state.skipInvalidRows,
  filteredRows,
  normalizedKeys,
})

const normalization = useChartNormalization({
  isGroupedData: source.isGroupedData,
  filteredData: filtering.filteredData,
  lineRenderableRows: outlierHandling.lineRenderableRows,
  chartType: state.chartType,
  skipInvalidRows: state.skipInvalidRows,
  normalizedKeys,
  viewMode: state.viewMode,
  normalizationMethod: state.normalizationMethod,
})

const sampling = useChartSampling(state.chartType)

const chartHostStyle = computed(() => {
  if (source.isGroupedData.value || state.chartType.value !== 'normal') return undefined
  const rowCount = Math.max(1, Math.ceil(normalizedKeys.value.length / 2))
  return {
    minHeight: `${Math.max(360, rowCount * 300)}px`,
  }
})

const strategy = computed(() => getChartStrategy(state.chartType.value))
const enabledTools = computed(() => new Set(strategy.value.getEnabledTools()))

const presets = useChartFilterPresets({
  lowerBound: state.lowerBound,
  upperBound: state.upperBound,
  selectedPresetId: state.selectedPresetId,
  savedPresets: state.savedPresets,
  defaultPresetId: state.defaultPresetId,
  presetNameInput: state.presetNameInput,
})

watch(
  () => [state.lowerBound.value, state.upperBound.value] as const,
  () => {
    presets.syncSelectionWithBounds()
  },
)

watch(
  () => source.availableKeys.value,
  () => {
    if (state.selectedKeys.value.length === 0) return
    const normalizedSelected = state.selectedKeys.value.filter((key) => source.availableKeys.value.includes(key))
    if (normalizedSelected.length !== state.selectedKeys.value.length) {
      state.selectedKeys.value = normalizedSelected
    }
  },
  { immediate: true },
)

presets.applyDefaultPreset()

const chartContext = computed<ChartContext>(() => ({
  state,
  source,
  filteredData: filtering.filteredData,
  filteredSummary: filtering.filteredSummary,
  normalizedKeys,
  normalizationStats: normalization.normalizationStats,
  isNormalizedView: normalization.isNormalizedView,
  lineRenderableRows: outlierHandling.lineRenderableRows,
  chartHostStyle,
}))

const processedModel = computed(() => strategy.value.buildModel(chartContext.value))

const chartOption = computed(() => {
  if (!source.availableKeys.value.length) return {}
  return strategy.value.buildOption(processedModel.value, chartContext.value)
})

const chartTypeOptions = computed(() => getChartTypeOptions(source.isGroupedData.value))
const chartUpdateOptions = markRaw({ notMerge: true, lazyUpdate: true })
const chartRef = shallowRef<any>(null)

watch(
  [chartRef, () => state.chartType.value, () => state.trendLineEnabled.value],
  ([ref, type, trendLineEnabled]) => {
    const instance = ref?.chart || ref?.getEchartsInstance?.()
    if (!instance) return

    instance.off('datazoom')
    instance.off('mouseover')
    instance.off('mouseout')
    instance.off('globalout')

    instance.on('datazoom', () => {
      const option = instance.getOption?.() as { dataZoom?: Array<Record<string, any>> } | undefined
      const yZoom = option?.dataZoom?.find((item) => Array.isArray(item?.yAxisIndex) && item.yAxisIndex.includes(0))
      const start = Number(yZoom?.start ?? 0)
      const end = Number(yZoom?.end ?? 100)
      const isActive = start > 0 || end < 100

      if (state.yZoomEnabled.value !== isActive) state.yZoomEnabled.value = isActive
      if (state.yZoomRange.value[0] !== start || state.yZoomRange.value[1] !== end) {
        state.yZoomRange.value = [start, end]
      }
    })

    if (type === 'normal') {
      instance.on('mouseover', (params: Record<string, any>) => {
        const si = Number(params.seriesIndex)
        const di = Number(params.dataIndex)
        if (!Number.isFinite(si)) return

        instance.dispatchAction({ type: 'downplay' })
        const pairSi = si % 2 === 0 ? si + 1 : si - 1
        instance.dispatchAction({ type: 'highlight', seriesIndex: si, dataIndex: di })

        const hoverX = Array.isArray(params.data) ? (params.data[0] as number) : 0
        const option = instance.getOption()
        const pairSeries = (option as any).series?.[pairSi] as { data?: Array<[number, number]> } | undefined
        const pairData = pairSeries?.data
        if (pairData && pairData.length > 0) {
          let nearestIdx = 0
          let minDist = Math.abs((pairData[0]?.[0] ?? 0) - hoverX)
          for (let i = 1; i < pairData.length; i++) {
            const dist = Math.abs((pairData[i]?.[0] ?? 0) - hoverX)
            if (dist < minDist) {
              minDist = dist
              nearestIdx = i
            }
          }
          instance.dispatchAction({ type: 'highlight', seriesIndex: pairSi, dataIndex: nearestIdx })
        }
      })

      instance.on('globalout', () => {
        instance.dispatchAction({ type: 'downplay' })
      })
      return
    }

    if (type !== 'scatter' || !trendLineEnabled) return

    const isTrendLineEvent = (params: Record<string, any>) =>
      params.componentType === 'series' &&
      (params.componentSubType === 'line' || params.seriesType === 'line') &&
      String(params.seriesName ?? '').includes('趋势线')

    instance.on('mouseover', (params: Record<string, any>) => {
      if (!isTrendLineEvent(params)) return

      const seriesIndex = Number(params.seriesIndex)
      if (!Number.isFinite(seriesIndex)) return

      const dataIndex = Number.isFinite(Number(params.dataIndex)) ? Number(params.dataIndex) : 0
      instance.dispatchAction({ type: 'showTip', seriesIndex, dataIndex })
    })

    instance.on('mouseout', (params: Record<string, any>) => {
      if (!isTrendLineEvent(params)) return
      instance.dispatchAction({ type: 'hideTip' })
    })

    instance.on('globalout', () => {
      instance.dispatchAction({ type: 'hideTip' })
    })
  },
  { immediate: true },
)

const boxplotToggleVisible = computed(
  () => source.hasRenderableData.value && enabledTools.value.has('boxplotWhisker'),
)

const trendLineVisible = computed(
  () => source.hasRenderableData.value && (state.chartType.value === 'line' || state.chartType.value === 'scatter'),
)
</script>

<template>
  <div class="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
    <div class="flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-slate-50/30">
      <div data-test="chart-toolbar-tools" class="flex flex-1 min-w-0 items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <ListChecks :size="14" class="text-indigo-500" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析因子</span>
          <SearchAppendMultiSelect
            v-model="state.selectedKeys.value"
            :options="source.availableKeys.value"
            :append-to="overlayAppendTo"
            placeholder="选择对比因子"
            select-class="property-select"
            select-test-id="chart-key-select"
            clear-button-test-id="chart-key-clear-all"
          />
        </div>

        <ChartSamplingTool
          v-if="enabledTools.has('sampling') && sampling.usesSampling.value"
          v-model="state.maxPoints.value"
        />

        <ChartXAxisFieldTool
          v-if="enabledTools.has('xField') && state.showsXAxisFieldSelector.value && source.availableXAxisOptions.value.length > 0"
          v-model="state.xField.value"
          :options="source.availableXAxisOptions.value"
          :append-to="overlayAppendTo"
        />

        <ChartFilterTool
          v-if="enabledTools.has('filter')"
          v-model:lower-bound="state.lowerBound.value"
          v-model:upper-bound="state.upperBound.value"
          v-model:is-preset-panel-open="state.isPresetPanelOpen.value"
          v-model:preset-name-input="state.presetNameInput.value"
          :filtered-summary="filtering.filteredSummary.value"
          :presets="state.savedPresets.value"
          :selected-preset-id="state.selectedPresetId.value"
          :default-preset-id="state.defaultPresetId.value"
          @save-preset="presets.saveCurrentPreset()"
          @apply-preset="presets.selectAndApplyPreset($event)"
          @delete-preset="presets.deletePreset($event)"
          @mark-default="presets.markCurrentSelectionAsDefault()"
          @set-no-default="presets.setNoFilterAsDefault()"
        />

        <ChartNormalizationTool
          v-if="enabledTools.has('normalization') && normalization.supportsNormalization.value"
          v-model:view-mode="state.viewMode.value"
          v-model:normalization-method="state.normalizationMethod.value"
          :is-normalized-view="normalization.isNormalizedView.value"
        />

        <ChartOutlierTool
          v-if="enabledTools.has('outlier')"
          v-model="state.skipInvalidRows.value"
        />
      </div>

      <Select
        v-model="state.chartType.value"
        :options="chartTypeOptions"
        :append-to="overlayAppendTo"
        option-label="label"
        option-value="value"
        class="chart-type-select"
        data-test="chart-type-select"
      >
        <template #value="slotProps">
          <div v-if="slotProps.value" class="flex items-center gap-2 text-slate-800">
            <component
              :is="chartTypeOptions.find((item) => item.value === slotProps.value)?.icon"
              :size="14"
              :stroke-width="2.5"
            />
            <span>{{ chartTypeOptions.find((item) => item.value === slotProps.value)?.label }}</span>
          </div>
        </template>
        <template #option="slotProps">
          <div class="flex items-center gap-2 font-bold text-[11px] uppercase tracking-widest text-slate-500 w-full">
            <component :is="slotProps.option.icon" :size="14" class="text-slate-700" />
            <span>{{ slotProps.option.label }}</span>
          </div>
        </template>
      </Select>
    </div>

    <div class="flex-1 p-4 relative min-h-0 overflow-hidden">
      <div class="h-full flex gap-4 min-h-0">
        <div
          data-test="chart-scroll-viewport"
          class="chart-scroll-viewport flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden pr-2"
        >
          <div v-if="source.hasRenderableData.value" data-test="chart-host" class="h-full w-full relative" :style="chartHostStyle">
            <div class="absolute inset-0 z-20 pointer-events-none">
              <ChartBoxplotOutlierToggle
                v-if="boxplotToggleVisible"
                v-model="state.showBoxplotOutliers.value"
              />
              <ChartBoxplotWhiskerTool
                v-if="boxplotToggleVisible"
                v-model="state.boxplotWhiskerMode.value"
              />
              <ChartTrendLineTool
                v-if="trendLineVisible"
                v-model="state.trendLineEnabled.value"
              />
            </div>
            <VChart ref="chartRef" :option="chartOption" :update-options="chartUpdateOptions" autoresize />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-scroll-viewport {
  scrollbar-gutter: stable;
}

.chart-scroll-viewport::-webkit-scrollbar {
  width: 8px;
}

.chart-scroll-viewport::-webkit-scrollbar-track {
  background: #f8fafc;
  border-radius: 999px;
}

.chart-scroll-viewport::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}

.chart-scroll-viewport::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

:deep(.filter-input) {
  width: 88px;
}

:deep(.filter-input .p-inputnumber-input) {
  padding: 2px 8px;
  font-size: 11px;
  width: 60px;
  border: none;
  background: #f8fafc;
  border-radius: 4px;
  font-family: monospace;
}

:deep(.chart-type-select) {
  height: 32px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  background: #fdfdfe;
}

:deep(.chart-type-select .p-select-label) {
  padding: 4px 12px;
  display: flex;
  align-items: center;
}

:deep(.chart-type-select .p-select-dropdown) {
  width: 28px;
  color: #94a3b8;
}

:deep(.property-select) {
  height: 28px;
  min-width: 160px;
  max-width: 300px;
  font-size: 11px;
  font-weight: 700;
  border-color: #f1f5f9;
  background: #f8fafc;
}

:deep(.property-select .p-multiselect-label) {
  padding: 2px 8px;
  display: flex;
  align-items: center;
}

:deep(.property-select .p-select-label) {
  padding: 2px 8px;
  display: flex;
  align-items: center;
}

:deep(.chart-axis-select) {
  min-width: 132px;
  max-width: 220px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

:deep(.chart-axis-select .p-select-label) {
  padding-right: 10px;
}

:deep(.chart-axis-select .p-select-dropdown) {
  width: 28px;
  color: #94a3b8;
}
</style>
