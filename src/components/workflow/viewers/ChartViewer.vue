<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  BoxplotChart,
  HeatmapChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  TransformComponent,
  VisualMapComponent,
} from 'echarts/components'
import { getResultChartOption } from '../resultView'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  BoxplotChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  TransformComponent,
  VisualMapComponent,
])

const props = defineProps<{
  data: any
}>()

const chartOption = computed(() => getResultChartOption(props.data))
</script>

<template>
  <div data-test="chart-viewer-root" class="flex h-full min-h-0 w-full flex-col overflow-hidden">
    <div
      v-if="chartOption"
      data-test="chart-viewer-host"
      class="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <VChart class="h-full w-full" :option="chartOption" autoresize />
    </div>
    <div
      v-else
      data-test="chart-viewer-host"
      class="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400"
    >
        无图表配置数据
    </div>
  </div>
</template>
