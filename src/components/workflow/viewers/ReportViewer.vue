<script setup lang="ts">
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  VisualMapComponent,
} from 'echarts/components'
import { FileText, Image as ImageIcon, Loader2, Search } from 'lucide-vue-next'
import { useToast } from 'primevue/usetoast'
import { getResultReport } from '../resultView'
import { exportReportElementToPdf } from '../reportPdfExport'
import { resolveExportFilename } from '@/utils/exportNaming'

type ReportSection = {
  key?: string
  type?: string
  title?: string
  option?: Record<string, unknown>
  optionMap?: Record<string, Record<string, unknown>>
  controls?: {
    select?: {
      label?: string
      modelKey?: string
      options?: string[]
    }
    labelTruncate?: {
      label?: string
      modelKey?: string
      defaultValue?: number
    }
  }
  items?: any[]
  allItems?: any[]
  cards?: Array<{ label: string; value: unknown }>
  content?: string
  url?: string
  alt?: string
  defaultVisibleCount?: number
}

type ReportPayload = {
  title?: string
  sections?: ReportSection[]
  supplements?: Record<string, any>
  metadata?: Record<string, any>
}

use([
  CanvasRenderer,
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  VisualMapComponent,
])

const props = defineProps<{
  data: any
  exportMode?: boolean
}>()

const toast = useToast()
const isExporting = ref(false)
const exportRootRef = ref<HTMLElement | null>(null)
const featureSearch = ref('')
const expandedDetailCount = ref(0)
const chartSelectState = ref<Record<string, string>>({})
const labelTruncateState = ref<Record<string, number>>({})
const isExportMode = computed(() => props.exportMode === true)

const report = computed<ReportPayload>(() => (getResultReport(props.data) ?? {}) as ReportPayload)
const sections = computed<ReportSection[]>(() =>
  Array.isArray(report.value.sections) ? report.value.sections : [],
)
const supplements = computed<Record<string, any>>(() => report.value.supplements ?? {})
const metadata = computed<Record<string, any>>(() => report.value.metadata ?? {})
const isShapReport = computed(() =>
  sections.value.some((section: any) =>
    ['dependence', 'details'].includes(section?.type) ||
    ['importance', 'dependence', 'details'].includes(section?.key),
  ),
)

const detailSection = computed(() => {
  return sections.value.find((section: any) => section?.key === 'details' || section?.type === 'details')
})

const dependenceSection = computed(() => {
  return sections.value.find((section: any) => section?.key === 'dependence' || section?.type === 'dependence')
})

const normalizedDetails = computed(() => {
  const section = detailSection.value
  if (!section) return []
  const items = Array.isArray(section.items) ? section.items : []
  const keyword = featureSearch.value.trim().toLowerCase()
  if (!keyword) return items
  return items.filter((item: any) => {
    const feature = String(item.feature ?? item.title ?? '').toLowerCase()
    return feature.includes(keyword)
  })
})

const normalizedDependence = computed(() => {
  const section = dependenceSection.value
  if (!section) return []
  const items = Array.isArray(section.allItems) ? section.allItems : Array.isArray(section.items) ? section.items : []
  const keyword = featureSearch.value.trim().toLowerCase()
  if (!keyword) return items
  return items.filter((item: any) => {
    const feature = String(item.feature ?? item.title ?? '').toLowerCase()
    return feature.includes(keyword)
  })
})

const visibleDetails = computed(() => {
  const section = detailSection.value
  const items = normalizedDetails.value
  if (!section) return []
  if (featureSearch.value.trim()) return items
  const limit = expandedDetailCount.value || section.defaultVisibleCount || items.length
  return items.slice(0, limit)
})

const visibleDependence = computed(() => {
  const section = dependenceSection.value
  const items = normalizedDependence.value
  if (!section) return []
  if (featureSearch.value.trim()) return items
  const limit = section.defaultVisibleCount || items.length
  return items.slice(0, limit)
})

const hasMoreDetails = computed(() => {
  const section = detailSection.value
  if (!section || featureSearch.value.trim()) return false
  const items = normalizedDetails.value
  const limit = expandedDetailCount.value || section.defaultVisibleCount || items.length
  return items.length > limit
})

const getRiskItemClasses = (level: string | undefined) => {
  if (level === 'danger') return 'border-rose-200 bg-rose-50'
  if (level === 'warning') return 'border-amber-200 bg-amber-50'
  return 'border-slate-200 bg-slate-50'
}

const getRiskBadgeClasses = (level: string | undefined) => {
  if (level === 'danger') return 'bg-rose-100 text-rose-700'
  if (level === 'warning') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

const getRiskLevelText = (level: string | undefined) => {
  if (level === 'danger') return '高风险'
  if (level === 'warning') return '需关注'
  return '提示'
}

const getSectionKey = (section: ReportSection, index: number) => section.key || `section-${index}`

const getChartSelectedValue = (section: ReportSection, index: number) => {
  const stateKey = getSectionKey(section, index)
  const options = section.controls?.select?.options ?? []
  const selectedValue = chartSelectState.value[stateKey]
  if (selectedValue && options.includes(selectedValue)) return selectedValue

  const modelKey = section.controls?.select?.modelKey
  if (typeof modelKey === 'string' && typeof metadata.value[modelKey] === 'string') {
    const metadataValue = String(metadata.value[modelKey])
    if (options.includes(metadataValue)) return metadataValue
  }

  return options[0] ?? ''
}

const getLabelTruncateLength = (section: ReportSection, index: number) => {
  const stateKey = getSectionKey(section, index)
  const stateValue = labelTruncateState.value[stateKey]
  if (typeof stateValue === 'number' && Number.isFinite(stateValue)) {
    return Math.max(0, Math.trunc(stateValue))
  }
  return Math.max(0, Math.trunc(section.controls?.labelTruncate?.defaultValue ?? 12))
}

const truncateLabel = (label: string, length: number) => {
  if (length <= 0 || label.length <= length) return label
  return `${label.slice(0, length)}...`
}

const withAxisLabelTruncation = (axis: unknown, truncateLength: number): unknown => {
  if (Array.isArray(axis)) {
    return axis.map((item) => withAxisLabelTruncation(item, truncateLength))
  }

  if (!axis || typeof axis !== 'object') return axis

  const baseAxis = axis as Record<string, unknown>
  return {
    ...baseAxis,
    axisLabel: {
      ...((baseAxis.axisLabel as Record<string, unknown> | undefined) ?? {}),
      formatter: (value: string) => truncateLabel(String(value), truncateLength),
    },
  }
}

const resolveChartOption = (section: ReportSection, index: number) => {
  const selectedValue = getChartSelectedValue(section, index)
  const optionMap = section.optionMap ?? {}
  const baseOption =
    (selectedValue ? optionMap[selectedValue] : undefined) ??
    optionMap[Object.keys(optionMap)[0] ?? ''] ??
    section.option

  if (!baseOption) return {}

  const truncateLength = getLabelTruncateLength(section, index)

  return {
    ...baseOption,
    xAxis: withAxisLabelTruncation(baseOption.xAxis, truncateLength),
    yAxis: withAxisLabelTruncation(baseOption.yAxis, truncateLength),
  }
}

const exportCurrentReport = async () => {
  if (!exportRootRef.value || isExporting.value) return
  isExporting.value = true

  toast.add({
    severity: 'info',
    summary: '正在导出当前报告',
    detail: '正在生成 PDF，请稍候。',
    life: 2000,
  })

  try {
    const filename = resolveExportFilename(undefined, report.value.title || '分析报告', 'pdf', {
      appendTimestamp: true,
    })

    await exportReportElementToPdf(exportRootRef.value, { filename })

    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: '当前报告已导出。',
      life: 2500,
    })
  } catch (error) {
    console.error('导出当前报告失败:', error)
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: '生成当前报告 PDF 时发生错误。',
      life: 4000,
    })
  } finally {
    isExporting.value = false
  }
}

const exportOriginalImage = () => {
  const imageUrl = supplements.value.fullReportImage
  if (!imageUrl) return

  const anchor = document.createElement('a')
  anchor.href = imageUrl
  anchor.download = `后端原始整图_${Date.now()}.png`
  anchor.click()
}
</script>

<template>
  <div
    class="report-viewer h-full overflow-y-auto p-6 bg-slate-50 custom-scrollbar relative"
    :class="{ 'report-viewer--export px-0 py-0 bg-white overflow-visible': isExportMode }"
  >
    <div
      ref="exportRootRef"
      class="max-w-5xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-100 relative"
      :class="{ 'max-w-none rounded-none border-0 shadow-none': isExportMode }"
    >
      <div class="flex flex-col gap-4 mb-6 pb-4 border-b border-slate-100 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="text-2xl font-black text-slate-800">
            {{ report.title || '分析报告' }}
          </h1>
          <p v-if="isShapReport" class="mt-2 text-sm text-slate-500 leading-relaxed">
            前端主报告负责阅读与筛选，后端原始整图作为补充视图保留完整归档能力。
          </p>
        </div>
        <div v-if="!isExportMode" data-export-hidden="true" class="flex flex-wrap gap-2">
          <button
            :disabled="isExporting"
            data-test="report-export-current"
            class="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            title="导出当前报告"
            @click="exportCurrentReport"
          >
            <Loader2 v-if="isExporting" class="animate-spin" :size="16" />
            <FileText v-else :size="16" />
            导出当前报告
          </button>
          <button
            v-if="supplements.fullReportImage"
            class="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all border border-slate-200"
            title="导出原始整图"
            @click="exportOriginalImage"
          >
            <ImageIcon :size="16" />
            导出原始整图
          </button>
        </div>
      </div>

      <div class="pdf-container space-y-8">
        <template v-for="(section, idx) in sections" :key="section.key || idx">
          <section v-if="section.type === 'summary'" class="space-y-4">
            <div>
              <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
              <p v-if="isShapReport" class="mt-1 text-sm text-slate-500">快速查看本次 SHAP 建模的核心上下文。</p>
              <p
                v-else-if="section.content"
                class="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-500"
              >
                {{ section.content }}
              </p>
            </div>
            <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              <article
                v-for="card in section.cards"
                :key="card.label"
                class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <p class="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  {{ card.label }}
                </p>
                <p class="mt-2 text-lg font-black text-slate-800">{{ card.value }}</p>
              </article>
            </div>
          </section>

          <section v-else-if="section.type === 'chart'" class="space-y-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
                <p v-if="section.key === 'importance'" class="mt-1 text-sm text-slate-500">
                  默认按 SHAP 重要性从高到低排序，可作为浏览全量因子的导航入口。
                </p>
              </div>
              <div
                v-if="section.controls?.select || section.controls?.labelTruncate"
                class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <label
                  v-if="section.controls?.select"
                  class="flex items-center gap-2 text-sm font-medium text-slate-600"
                >
                  <span>{{ section.controls.select.label || '切换维度' }}</span>
                  <select
                    data-test="report-select"
                    class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    :value="getChartSelectedValue(section, idx)"
                    @change="chartSelectState[getSectionKey(section, idx)] = String(($event.target as HTMLSelectElement).value)"
                  >
                    <option
                      v-for="option in section.controls.select.options || []"
                      :key="option"
                      :value="option"
                    >
                      {{ option }}
                    </option>
                  </select>
                </label>
                <label
                  v-if="section.controls?.labelTruncate"
                  class="flex items-center gap-2 text-sm font-medium text-slate-600"
                >
                  <span>{{ section.controls.labelTruncate.label || '标签截断' }}</span>
                  <input
                    data-test="report-label-truncate-input"
                    type="number"
                    min="1"
                    class="w-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    :value="getLabelTruncateLength(section, idx)"
                    @input="labelTruncateState[getSectionKey(section, idx)] = Number(($event.target as HTMLInputElement).value || 0)"
                  />
                </label>
              </div>
            </div>
            <div class="h-[400px] w-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <VChart :option="resolveChartOption(section, idx)" autoresize />
            </div>
          </section>

          <section v-else-if="section.type === 'dependence'" class="space-y-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
                <p class="mt-1 text-sm text-slate-500">
                  默认展示高重要性因子，可通过搜索快速切换到任意因子。
                </p>
              </div>
              <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                <Search :size="14" />
                <input
                  v-model="featureSearch"
                  data-test="shap-feature-search"
                  type="text"
                  class="min-w-[200px] border-0 bg-transparent p-0 text-sm text-slate-700 outline-none"
                  placeholder="搜索因子，如 f3"
                />
              </label>
            </div>
            <div class="grid gap-4 lg:grid-cols-2">
              <article
                v-for="item in visibleDependence"
                :key="`dependence-${item.feature}`"
                class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <h3 class="text-sm font-bold text-slate-700">{{ item.title }}</h3>
                <div class="mt-3 h-[280px] rounded-xl border border-slate-100 bg-white p-3">
                  <VChart :option="item.option" autoresize />
                </div>
              </article>
            </div>
          </section>

          <section v-else-if="section.type === 'details'" class="space-y-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
                <p class="mt-1 text-sm text-slate-500">
                  默认只展开部分因子，支持搜索和逐步展开，保证全部因子都可访问。
                </p>
              </div>
              <button
                v-if="hasMoreDetails"
                class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                @click="expandedDetailCount = normalizedDetails.length"
              >
                显示全部因子
              </button>
            </div>
            <div class="grid gap-4 lg:grid-cols-2">
              <article
                v-for="item in visibleDetails"
                :key="`details-${item.feature}`"
                class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-sm font-bold text-slate-800">{{ item.title }}</h3>
                  <span class="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600">
                    {{ item.feature }}
                  </span>
                </div>
                <div class="mt-3 h-[260px] rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <VChart :option="item.option" autoresize />
                </div>
              </article>
            </div>
          </section>

          <section v-else-if="section.type === 'text'" class="space-y-2">
            <h2 v-if="section.title" class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
            <p class="text-sm leading-relaxed whitespace-pre-wrap text-slate-600">{{ section.content }}</p>
          </section>

          <section v-else-if="section.type === 'risk-list'" class="space-y-4">
            <div>
              <h2 v-if="section.title" class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
              <p class="mt-1 text-sm text-slate-500">
                这些提示用于帮助判断结果是否足够稳定，不替代业务结论。
              </p>
            </div>
            <div class="grid gap-3">
              <article
                v-for="(item, riskIndex) in section.items || []"
                :key="`${section.key || 'risk'}-${riskIndex}`"
                data-test="report-risk-item"
                class="rounded-2xl border px-4 py-4"
                :class="getRiskItemClasses(item.level)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-bold text-slate-800">{{ item.title }}</h3>
                    <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ item.message }}</p>
                  </div>
                  <span
                    class="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold"
                    :class="getRiskBadgeClasses(item.level)"
                  >
                    {{ getRiskLevelText(item.level) }}
                  </span>
                </div>
              </article>
            </div>
          </section>

          <section v-else-if="section.type === 'image'" class="space-y-3">
            <h2 v-if="section.title" class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
            <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <img :src="section.url" :alt="section.alt" class="mx-auto max-w-full rounded-xl shadow-sm" />
            </div>
          </section>
        </template>

        <section
          v-if="supplements.fullReportImage || supplements.beeswarmImage"
          class="rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 class="text-lg font-bold text-slate-800">后端原始整图</h2>
              <p class="mt-1 text-sm leading-relaxed text-slate-500">
                这是后端 Python 侧生成的原始整图，用于补充对照与归档，不替代前端主报告。
              </p>
            </div>
            <button
              v-if="supplements.fullReportImage"
              class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              @click="exportOriginalImage"
            >
              导出原始整图
            </button>
          </div>
          <div v-if="supplements.fullReportImage" class="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
            <img
              :src="supplements.fullReportImage"
              alt="后端原始整图"
              class="mx-auto max-w-full rounded-xl shadow-sm"
            />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
</style>

