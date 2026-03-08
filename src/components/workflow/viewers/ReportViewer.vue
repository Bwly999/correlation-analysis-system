<script setup lang="ts">
import { ref, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
} from 'echarts/components'
import html2pdf from 'html2pdf.js'
import html2canvas from 'html2canvas'
import { FileText, Image as ImageIcon } from 'lucide-vue-next'

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
])

const props = defineProps<{
  data: any
}>()

const activeTab = ref(0)

const isTabsMode = computed(() => {
  return props.data.report?.tabs && props.data.report.tabs.length > 0
})

const currentSections = computed(() => {
  if (isTabsMode.value) {
    return props.data.report.tabs[activeTab.value].sections
  }
  return props.data.report?.sections || []
})

const reportRef = ref<HTMLElement | null>(null)

/**
 * 修复 html2canvas 不支持 oklch 颜色的问题
 * 遍历元素并将计算出的 oklch 样式转换为 rgb
 */
const fixOklchColors = (container: HTMLElement) => {
  const elements = [container, ...Array.from(container.getElementsByTagName('*'))]
  const colorProps = ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke', 'stopColor']
  
  // 创建一个辅助元素用于将任何颜色字符串转换为 rgb 格式
  const helper = document.createElement('div')
  helper.style.display = 'none'
  document.body.appendChild(helper)

  elements.forEach((el: any) => {
    const style = window.getComputedStyle(el)
    
    colorProps.forEach(prop => {
      const val = style.getPropertyValue(prop)
      // 如果颜色包含 oklch 或者是现代 CSS 变量颜色，强制转换为 RGB
      if (val && (val.includes('oklch') || val.includes('var('))) {
        try {
          // 浏览器会自动将计算后的样式转换为 rgb/rgba
          // 但有时 html2canvas 依然会读取到原始定义的变量
          helper.style.setProperty('color', val, 'important')
          const rgb = window.getComputedStyle(helper).color
          if (rgb && !rgb.includes('oklch')) {
            el.style.setProperty(prop, rgb, 'important')
          } else {
            // 极端兜底：如果是黑色或白色文字/背景，给个硬编码值
            if (prop === 'color') el.style.setProperty(prop, '#1e293b', 'important')
            if (prop === 'backgroundColor' && val.includes('white')) el.style.setProperty(prop, '#ffffff', 'important')
          }
        } catch (e) {
          // ignore
        }
      }
    })
  })
  document.body.removeChild(helper)
}

const exportToPDF = () => {
  if (!reportRef.value) return
  
  // 导出前修复颜色
  fixOklchColors(reportRef.value)
  
  const element = reportRef.value
  const opt = {
    margin: 10,
    filename: `分析报告_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }
  html2pdf().set(opt).from(element).save()
}

const exportToImage = async () => {
  if (isTabsMode.value && activeTab.value === 1) {
    // 全量视图：如果只有一张大图，直接下载
    const imgSection = currentSections.value.find((s: any) => s.type === 'image')
    if (imgSection) {
      const a = document.createElement('a')
      a.href = imgSection.url
      a.download = `分析大图_${Date.now()}.png`
      a.click()
      return
    }
  }
  
  // 否则使用 html2canvas 捕获整个区域
  if (!reportRef.value) return
  
  // 导出前修复颜色
  fixOklchColors(reportRef.value)
  
  try {
    const canvas = await html2canvas(reportRef.value, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    })
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `分析视图_${Date.now()}.png`
    a.click()
  } catch (err) {
    console.error('导出图片失败:', err)
  }
}
</script>

<template>
  <div class="report-viewer h-full overflow-y-auto p-6 bg-slate-50 custom-scrollbar relative">
    <div class="max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-100 relative">
      <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
        <h1 class="text-2xl font-black text-slate-800">
          {{ data.report?.title || '分析报告' }}
        </h1>
        <div class="flex gap-2">
          <button
            @click="exportToPDF"
            class="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all border border-slate-200"
            title="导出为 PDF"
          >
            <FileText size="16" />
            PDF 导出
          </button>
          <button
            @click="exportToImage"
            class="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md"
            title="导出为图片"
          >
            <ImageIcon size="16" />
            图片导出
          </button>
        </div>
      </div>

      <div v-if="isTabsMode" class="flex gap-6 mb-8 border-b border-slate-100">
        <button
          v-for="(tab, index) in data.report.tabs"
          :key="index"
          @click="activeTab = index"
          :class="[
            'pb-3 px-2 text-sm font-bold transition-all border-b-2 -mb-[2px]',
            activeTab === index 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          ]"
        >
          {{ tab.name }}
        </button>
      </div>

      <div ref="reportRef" class="pdf-container">
        <div v-for="(section, idx) in currentSections" :key="idx" class="mb-8">
          <h2 v-if="section.title" class="text-lg font-bold text-slate-700 mb-4">
            {{ section.title }}
          </h2>

          <p
            v-if="section.type === 'text'"
            class="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap"
          >
            {{ section.content }}
          </p>

          <div
            v-else-if="section.type === 'image'"
            class="flex justify-center my-4 bg-slate-50 rounded-xl p-4 border border-slate-100"
          >
            <img :src="section.url" :alt="section.alt" class="max-w-full rounded shadow-sm" />
          </div>

          <div
            v-else-if="section.type === 'chart'"
            class="h-[400px] w-full my-4 bg-white border border-slate-100 rounded-xl p-4 shadow-sm"
          >
            <VChart :option="section.option" autoresize />
          </div>
        </div>
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
