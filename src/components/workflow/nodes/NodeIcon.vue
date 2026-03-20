<script setup lang="ts">
import {
  FileType,
  Database,
  Settings2,
  ScanSearch,
  Sigma,
  Spline,
  ChartScatter,
  ChartLine,
  ChartColumn,
  BarChart3,
  HelpCircle,
  Download,
  PieChart,
  Edit3,
  Brain,
  GitMerge,
  Filter,
  ListFilter,
  ArrowUpDown,
  ScissorsLineDashed,
  Combine,
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
  'data-profiling': { icon: ScanSearch, color: 'text-sky-600', bg: 'bg-sky-50' },
  'data-aggregation': { icon: Sigma, color: 'text-blue-600', bg: 'bg-blue-50' },
  'data-merge': { icon: GitMerge, color: 'text-blue-600', bg: 'bg-blue-50' },
  'data-filter': { icon: Filter, color: 'text-amber-500', bg: 'bg-amber-50' },
  'field-selection': { icon: ListFilter, color: 'text-amber-600', bg: 'bg-amber-50' },
  sort: { icon: ArrowUpDown, color: 'text-slate-600', bg: 'bg-slate-100' },
  'data-limit': { icon: ScissorsLineDashed, color: 'text-orange-600', bg: 'bg-orange-50' },
  'data-key-merge': { icon: Combine, color: 'text-blue-700', bg: 'bg-blue-50' },
  'xgboost-shap': { icon: Brain, color: 'text-rose-500', bg: 'bg-rose-50' },
  lasso: { icon: Spline, color: 'text-sky-600', bg: 'bg-sky-50' },
  pearson: { icon: ChartScatter, color: 'text-blue-600', bg: 'bg-blue-50' },
  spearman: { icon: ChartLine, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  kendall: { icon: ChartColumn, color: 'text-teal-600', bg: 'bg-teal-50' },
  algorithm: { icon: BarChart3, color: 'text-orange-500', bg: 'bg-orange-50' },
  'data-export': { icon: Download, color: 'text-blue-600', bg: 'bg-blue-50' },
  'chart-display': { icon: PieChart, color: 'text-sky-600', bg: 'bg-sky-50' },
}
const config = iconMap[props.type] || {
  icon: HelpCircle,
  color: 'text-slate-400',
  bg: 'bg-slate-100',
}
</script>

<template>
  <div
    :class="['flex items-center justify-center rounded-lg shrink-0', config.bg]"
    :style="{ width: (size || 32) + 'px', height: (size || 32) + 'px' }"
  >
    <component :is="config.icon" :class="config.color" :size="(size || 32) * 0.6" />
  </div>
</template>
