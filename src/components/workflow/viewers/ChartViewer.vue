<script setup lang="ts">
import { markRaw } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart, ScatterChart, BoxplotChart, HeatmapChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, TitleComponent, LegendComponent, 
  DataZoomComponent, TransformComponent, VisualMapComponent
} from 'echarts/components'

use([
  CanvasRenderer, LineChart, BarChart, PieChart, ScatterChart, BoxplotChart, HeatmapChart,
  GridComponent, TooltipComponent, TitleComponent, LegendComponent, DataZoomComponent, 
  TransformComponent, VisualMapComponent
])

const props = defineProps<{
  data: any
}>()
</script>

<template>
  <div class="h-full w-full p-4">
    <div class="h-full w-full bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <VChart v-if="data.chartOption" :option="data.chartOption" autoresize />
      <div v-else class="h-full flex items-center justify-center text-slate-400">
        无图表配置数据
      </div>
    </div>
  </div>
</template>
