<script setup lang="ts">
import { markRaw } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from 'echarts/components'

use([CanvasRenderer, BarChart, LineChart, PieChart, ScatterChart, GridComponent, TooltipComponent, TitleComponent, LegendComponent])

const props = defineProps<{
  data: any
}>()
</script>

<template>
  <div class="report-viewer h-full overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
    <div class="max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
      <h1 class="text-2xl font-black text-slate-800 mb-6 pb-4 border-b border-slate-100">{{ data.report?.title || '分析报告' }}</h1>
      
      <div v-for="(section, idx) in data.report?.sections" :key="idx" class="mb-8">
        <h2 v-if="section.title" class="text-lg font-bold text-slate-700 mb-4">{{ section.title }}</h2>
        
        <p v-if="section.type === 'text'" class="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
          {{ section.content }}
        </p>
        
        <div v-else-if="section.type === 'image'" class="flex justify-center my-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
          <img :src="section.url" :alt="section.alt" class="max-w-full rounded shadow-sm" />
        </div>
        
        <div v-else-if="section.type === 'chart'" class="h-[400px] w-full my-4 bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
          <VChart :option="section.option" autoresize />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
</style>
