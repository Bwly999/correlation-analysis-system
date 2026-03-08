<script setup lang="ts">
import {
  FileType, Database, Settings2, Sigma, BarChart3, HelpCircle, Download, PieChart, Edit3
} from 'lucide-vue-next'

const props = defineProps<{
  type: string
  size?: number
}>()

const iconMap: Record<string, any> = {
  'file-import': { icon: FileType, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  'manual-json-import': { icon: Edit3, color: 'text-orange-500', bg: 'bg-orange-50' },
  'neighbor-system': { icon: Database, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'data-cleaning': { icon: Settings2, color: 'text-blue-500', bg: 'bg-blue-50' },
  'data-aggregation': { icon: Sigma, color: 'text-blue-600', bg: 'bg-blue-50' },
  'algorithm': { icon: BarChart3, color: 'text-orange-500', bg: 'bg-orange-50' },
  'data-export': { icon: Download, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  'chart-display': { icon: PieChart, color: 'text-purple-500', bg: 'bg-purple-50' }
}
const config = iconMap[props.type] || { icon: HelpCircle, color: 'text-slate-400', bg: 'bg-slate-100' }
</script>

<template>
  <div :class="['flex items-center justify-center rounded-lg shrink-0', config.bg]" :style="{ width: (size || 32) + 'px', height: (size || 32) + 'px' }">
    <component :is="config.icon" :class="config.color" :size="(size || 32) * 0.6" />
  </div>
</template>
