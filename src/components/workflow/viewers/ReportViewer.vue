<script setup lang="ts">
import { computed, useTemplateRef, type Component } from 'vue'
import { FileText, Image as ImageIcon, Loader2 } from 'lucide-vue-next'
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
import ReportPreviewDialog from './reportViewer/ReportPreviewDialog.vue'
import ReportSupplementSection from './reportViewer/ReportSupplementSection.vue'
import ReportChartSection from './reportViewer/sections/ReportChartSection.vue'
import ReportDependenceSection from './reportViewer/sections/ReportDependenceSection.vue'
import ReportImageSection from './reportViewer/sections/ReportImageSection.vue'
import ReportRiskListSection from './reportViewer/sections/ReportRiskListSection.vue'
import ReportSummarySection from './reportViewer/sections/ReportSummarySection.vue'
import ReportTextSection from './reportViewer/sections/ReportTextSection.vue'
import { useReportExport } from './reportViewer/useReportExport'
import { useReportPreview } from './reportViewer/useReportPreview'
import { useReportSections } from './reportViewer/useReportSections'
import type {
  ReportChartSection as ReportChartSectionType,
  ReportDependenceSection as ReportDependenceSectionType,
  ReportImageSection as ReportImageSectionType,
  ReportRiskListSection as ReportRiskListSectionType,
  ReportSection,
  ReportSectionType,
  ReportSummarySection as ReportSummarySectionType,
  ReportTextSection as ReportTextSectionType,
} from './reportViewer/reportTypes'

interface RenderedSection {
  key: string | number
  component: Component
  props: Record<string, unknown>
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
  data: unknown
  exportMode?: boolean
}>()

const exportRootRef = useTemplateRef<HTMLElement>('exportRootRef')

const {
  report,
  sections,
  supplements,
  isShapReport,
  featureSearch,
  expandedDependence,
  visibleDependence,
  hasMoreDependence,
  getChartSelectedValue,
  setChartSelectedValue,
  getLabelTruncateLength,
  setLabelTruncateLength,
  resolveChartOption,
} = useReportSections(() => props.data)

const {
  isFullReportPreviewOpen,
  previewScale,
  isPreviewDragging,
  previewImageTransform,
  resetFullReportPreview,
  openFullReportPreview,
  closeFullReportPreview,
  zoomInPreview,
  zoomOutPreview,
  handlePreviewWheel,
  handlePreviewMouseDown,
} = useReportPreview(() => supplements.value.fullReportImage as string | undefined)

const { isExporting, exportCurrentReport, exportOriginalImage } = useReportExport({
  exportRootRef,
  reportTitle: () => report.value.title || '分析报告',
  fullReportImage: () => supplements.value.fullReportImage as string | undefined,
})

const isExportMode = computed(() => props.exportMode === true)

const sectionComponentMap: Partial<Record<ReportSectionType, Component>> = {
  summary: ReportSummarySection,
  chart: ReportChartSection,
  dependence: ReportDependenceSection,
  text: ReportTextSection,
  'risk-list': ReportRiskListSection,
  image: ReportImageSection,
} satisfies Partial<Record<ReportSectionType, Component>>

const resolveSectionComponent = (section: ReportSection) =>
  section.type ? sectionComponentMap[section.type as ReportSectionType] ?? null : null

const resolveSectionProps = (section: ReportSection, index: number): Record<string, unknown> => {
  if (section.type === 'summary') {
    return {
      section: section as ReportSummarySectionType,
      isShapReport: isShapReport.value,
    }
  }

  if (section.type === 'chart') {
    return {
      section: section as ReportChartSectionType,
      selectedValue: getChartSelectedValue(section as ReportChartSectionType, index),
      labelTruncateLength: getLabelTruncateLength(section as ReportChartSectionType, index),
      option: resolveChartOption(section as ReportChartSectionType, index),
      onUpdateSelectedValue: (value: string) =>
        setChartSelectedValue(section as ReportChartSectionType, index, value),
      onUpdateLabelTruncateLength: (value: number) =>
        setLabelTruncateLength(section as ReportChartSectionType, index, value),
    }
  }

  if (section.type === 'dependence') {
    return {
      section: section as ReportDependenceSectionType,
      items: visibleDependence.value,
      featureSearch: featureSearch.value,
      hasMore: hasMoreDependence.value,
      onUpdateFeatureSearch: (value: string) => {
        featureSearch.value = value
      },
      onShowAll: () => {
        expandedDependence.value = true
      },
    }
  }

  if (section.type === 'text') {
    return {
      section: section as ReportTextSectionType,
    }
  }

  if (section.type === 'risk-list') {
    return {
      section: section as ReportRiskListSectionType,
    }
  }

  if (section.type === 'image') {
    return {
      section: section as ReportImageSectionType,
    }
  }

  return {}
}

const renderedSections = computed<RenderedSection[]>(() =>
  sections.value.flatMap((section, index) => {
    const component = resolveSectionComponent(section)
    if (!component) return []

    return [
      {
        key: section.key || index,
        component,
        props: resolveSectionProps(section, index),
      },
    ]
  }),
)
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
        <component
          :is="renderedSection.component"
          v-for="renderedSection in renderedSections"
          :key="renderedSection.key"
          v-bind="renderedSection.props"
        />

        <ReportSupplementSection
          :full-report-image="supplements.fullReportImage as string | undefined"
          :beeswarm-image="supplements.beeswarmImage as string | undefined"
          @export-original-image="exportOriginalImage"
          @open-preview="openFullReportPreview"
        />
      </div>
    </div>

    <ReportPreviewDialog
      v-if="supplements.fullReportImage"
      :visible="isFullReportPreviewOpen"
      :image-src="supplements.fullReportImage as string"
      :preview-scale="previewScale"
      :is-preview-dragging="isPreviewDragging"
      :preview-image-transform="previewImageTransform"
      @close="closeFullReportPreview"
      @zoom-in="zoomInPreview"
      @zoom-out="zoomOutPreview"
      @reset="resetFullReportPreview"
      @wheel="handlePreviewWheel"
      @mouse-down="handlePreviewMouseDown"
    />
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
