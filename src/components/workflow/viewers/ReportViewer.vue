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
import { FileText, Image as ImageIcon, Loader2 } from 'lucide-vue-next'
import { useToast } from 'primevue/usetoast'

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

const toast = useToast()
const activeTab = ref(0)
const isExporting = ref(false)
const chartRefs = ref<any[]>([])
const sectionRefs = ref<HTMLElement[]>([])

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
 * 修复颜色
 */
const colorToRgba = (color: string): string => {
  if (!color || color === 'transparent' || color === 'none') return color
  if (!color.includes('oklch') && !color.includes('var(')) return color
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1; canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return color
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`
  } catch (e) { return color }
}

const fixOklchColors = (container: HTMLElement, restore = false) => {
  const elements = [container, ...Array.from(container.getElementsByTagName('*'))]
  const colorProps = ['color', 'background-color', 'border-color', 'fill', 'stroke']
  
  elements.forEach((el: any) => {
    if (restore) {
      // 恢复原始样式
      if (el._originalStyles) {
        Object.keys(el._originalStyles).forEach(prop => {
          el.style.setProperty(prop, el._originalStyles[prop])
        })
        delete el._originalStyles
      }
      return
    }

    const style = window.getComputedStyle(el)
    colorProps.forEach(prop => {
      const val = style.getPropertyValue(prop)
      if (val && (val.includes('oklch') || val.includes('var('))) {
        const rgba = colorToRgba(val)
        if (rgba && !rgba.includes('oklch')) {
          // 记录原始样式以便后续恢复
          el._originalStyles = el._originalStyles || {}
          el._originalStyles[prop] = el.style.getPropertyValue(prop)
          el.style.setProperty(prop, rgba, 'important')
        }
      }
    })
  })
}

const exportToPDF = async () => {
  if (!reportRef.value || isExporting.value) return
  isExporting.value = true
  
  toast.add({ severity: 'info', summary: '正在生成 PDF', detail: '正在优化图表与排版...', life: 2000 })

  // 1. 原地修复颜色，防止 html2canvas 内部解析 oklch 报错
  fixOklchColors(reportRef.value)

  const filename = `分析报告_${Date.now()}.pdf`
  const opt = {
    margin: 10,
    filename,
    image: { type: 'jpeg', quality: 0.8 },
    html2canvas: { 
      scale: 1.2, // 1.2 倍率足以打印，且体积小、速度快
      useCORS: true, 
      logging: false,
      backgroundColor: '#ffffff',
      // 修复截断：指定完整高度
      height: reportRef.value.scrollHeight,
      windowHeight: reportRef.value.scrollHeight,
      onclone: (clonedDoc: Document) => {
        // 在克隆的文档中，将所有图表容器替换为静态图片
        // 这样 html2canvas 就不需要去解析 Canvas 或图表内部的复杂样式了
        const chartElements = clonedDoc.querySelectorAll('[data-chart-index]')
        chartElements.forEach((el: any) => {
          const idx = parseInt(el.getAttribute('data-chart-index'))
          const chartInstance = chartRefs.value[idx]
          if (chartInstance) {
            const imgData = chartInstance.getDataURL({ pixelRatio: 2, backgroundColor: '#fff' })
            const img = clonedDoc.createElement('img')
            img.src = imgData
            img.style.width = '100%'
            img.style.height = 'auto'
            el.innerHTML = ''
            el.appendChild(img)
          }
        })
      }
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }
  }

  try {
    // 2. 执行 html2pdf 转换
    await html2pdf().set(opt).from(reportRef.value).save()
    toast.add({ severity: 'success', summary: '导出成功', detail: 'PDF 已保存', life: 3000 })
  } catch (err) {
    console.error('PDF 导出失败:', err)
    toast.add({ severity: 'error', summary: '导出失败', detail: '生成 PDF 时出现错误', life: 5000 })
  } finally {
    // 3. 恢复原始样式
    fixOklchColors(reportRef.value, true)
    isExporting.value = false
  }
}


const exportToImage = async () => {
  if (isExporting.value) return
  
  if (isTabsMode.value && activeTab.value === 1) {
    const imgSection = currentSections.value.find((s: any) => s.type === 'image')
    if (imgSection) {
      const a = document.createElement('a')
      a.href = imgSection.url; a.download = `分析大图_${Date.now()}.png`; a.click()
      return
    }
  }
  
  if (!reportRef.value) return
  isExporting.value = true
  toast.add({ severity: 'info', summary: '正在生成图片', detail: '正在准备高清截图...', life: 2000 })

  const tempContainer = document.createElement('div')
  tempContainer.style.position = 'fixed'; tempContainer.style.left = '-9999px'
  tempContainer.style.top = '0'; tempContainer.style.width = reportRef.value.offsetWidth + 'px'
  document.body.appendChild(tempContainer)

  try {
    const clone = reportRef.value.cloneNode(true) as HTMLElement
    tempContainer.appendChild(clone)
    fixOklchColors(clone)

    const canvas = await html2canvas(clone, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      height: clone.offsetHeight,
      windowHeight: clone.offsetHeight
    })
    const url = canvas.toDataURL('image/jpeg', 0.9)
    const a = document.createElement('a')
    a.href = url; a.download = `分析视图_${Date.now()}.jpg`; a.click()
    toast.add({ severity: 'success', summary: '导出成功', detail: '图片已下载', life: 3000 })
  } catch (err) {
    console.error('导出图片失败:', err)
    toast.add({ severity: 'error', summary: '导出失败', detail: '生成图片失败', life: 5000 })
  } finally {
    if (tempContainer.parentElement) document.body.removeChild(tempContainer)
    isExporting.value = false
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
            :disabled="isExporting"
            class="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="导出为 PDF"
          >
            <Loader2 v-if="isExporting" class="animate-spin" size="16" />
            <FileText v-else size="16" />
            PDF 导出
          </button>
          <button
            @click="exportToImage"
            :disabled="isExporting"
            class="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            title="导出为图片"
          >
            <Loader2 v-if="isExporting" class="animate-spin" size="16" />
            <ImageIcon v-else size="16" />
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
        <div 
          v-for="(section, idx) in currentSections" 
          :key="idx" 
          ref="sectionRefs"
          class="mb-8"
        >
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
            <VChart 
              ref="chartRefs"
              :option="section.option" 
              autoresize 
            />
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
