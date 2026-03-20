<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { Maximize, Zap, FileJson, Pin } from 'lucide-vue-next'
import ToggleSwitch from 'primevue/toggleswitch'
import {
  getResultChartOption,
  getResultFileInfo,
  getResultGroups,
  getResultKindLabel,
  getResultPreviewSummary,
  getResultReport,
  getResultRows,
  getResultSchemaFields,
  normalizeWorkflowResult,
} from './resultView'

const MonacoEditor = defineAsyncComponent(() => import('./MonacoEditor.vue'))

const props = defineProps<{
  title: string
  data: any
  type: 'input' | 'output'
  allowMock?: boolean
  isPinned?: boolean
}>()

const useManualInput = defineModel<boolean>('useManualInput', { default: false })
const manualInputStr = defineModel<string>('manualInputStr', { default: '' })

const emit = defineEmits(['openDetail', 'generateMock'])

const normalizedResult = computed(() => normalizeWorkflowResult(props.data))

const smartPreview = computed(() => {
  if (!props.data) return '暂无数据可用。'

  if (normalizedResult.value?.kind === 'table') {
    const rows = getResultRows(normalizedResult.value)
    const fields = getResultSchemaFields(normalizedResult.value).map((field) => field.name)
    return [
      `// ${getResultKindLabel(normalizedResult.value)}`,
      `// ${getResultPreviewSummary(normalizedResult.value)}`,
      fields.length > 0 ? `// 字段：${fields.join(', ')}` : '',
      '',
      JSON.stringify(rows.slice(0, 5), null, 2),
      rows.length > 5 ? '\n// ... 已截断更多行' : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (normalizedResult.value?.kind === 'tableCollection') {
    const groups = getResultGroups(normalizedResult.value)
    const summary = groups
      .map((group) => `  - ${group.name}: ${group.data.length} 行`)
      .join('\n')
    const previewGroups = groups.map((group) => ({
      name: group.name,
      data: group.data.slice(0, 2),
      rowCount: group.data.length,
    }))

    return [
      `// ${getResultKindLabel(normalizedResult.value)}`,
      `// ${getResultPreviewSummary(normalizedResult.value)}`,
      summary,
      '',
      JSON.stringify(previewGroups, null, 2),
      groups.some((group) => group.data.length > 2) ? '\n// ... 已截断更多分组样本' : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (normalizedResult.value?.kind === 'report') {
    const report = getResultReport(normalizedResult.value)
    return JSON.stringify(
      {
        kind: normalizedResult.value.kind,
        title: report?.title,
        summary: getResultPreviewSummary(normalizedResult.value),
        sections: Array.isArray(report?.sections)
          ? report.sections.map((section: any) => ({
              type: section.type,
              title: section.title,
            }))
          : [],
      },
      null,
      2,
    )
  }

  if (normalizedResult.value?.kind === 'chart') {
    const option = getResultChartOption(normalizedResult.value)
    return JSON.stringify(
      {
        kind: normalizedResult.value.kind,
        summary: getResultPreviewSummary(normalizedResult.value),
        chartKeys: option ? Object.keys(option) : [],
      },
      null,
      2,
    )
  }

  if (normalizedResult.value?.kind === 'file') {
    const fileInfo = getResultFileInfo(normalizedResult.value)
    return JSON.stringify(
      {
        kind: normalizedResult.value.kind,
        filename: fileInfo?.filename,
        format: fileInfo?.format,
        summary: getResultPreviewSummary(normalizedResult.value),
      },
      null,
      2,
    )
  }

  const legacyRows = getResultRows(props.data)
  const legacyGroups = getResultGroups(props.data)
  if (legacyRows.length > 0) {
    return `// 表格预览\n${JSON.stringify(legacyRows.slice(0, 5), null, 2)}`
  }
  if (legacyGroups.length > 0) {
    return `// 分组集合预览\n${JSON.stringify(legacyGroups.slice(0, 3), null, 2)}`
  }

  const str = JSON.stringify(props.data, null, 2)
  return str.length > 1200 ? `${str.slice(0, 1200)}\n\n// ... 已截断` : str
})
</script>

<template>
  <div
    class="flex flex-col h-full overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm"
  >
    <div class="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <FileJson :size="12" class="text-slate-400" />
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">{{
          title
        }}</span>
        <div
          v-if="isPinned"
          class="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-200 rounded text-[9px] text-amber-600 font-bold ml-1 animate-pulse"
        >
          <Pin :size="8" fill="currentColor" /> 冻结
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div v-if="allowMock" class="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
          <span class="text-[9px] font-bold text-slate-400 uppercase">模拟输入</span>
          <ToggleSwitch v-model="useManualInput" class="!scale-[0.6]" />
        </div>
        <button
          class="p-1.5 hover:bg-slate-200 rounded-lg transition-all text-slate-400 hover:text-slate-600 cursor-pointer"
          title="打开深度分析窗口"
          @click="emit('openDetail')"
        >
          <Maximize :size="12" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-hidden relative bg-[#fcfcfd] min-h-0">
      <div
        v-if="!useManualInput"
        class="h-full overflow-y-auto p-4 font-mono text-[11px] text-slate-600 custom-scrollbar"
      >
        <pre class="whitespace-pre-wrap break-all leading-relaxed">{{ smartPreview }}</pre>
      </div>

      <div v-else class="h-full flex flex-col p-2 min-h-0">
        <MonacoEditor v-model="manualInputStr" height="100%" class="flex-1" />
        <div class="flex justify-end p-2 border-t border-slate-100 mt-1 shrink-0">
          <button
            class="text-[9px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 uppercase tracking-tighter cursor-pointer"
            @click="emit('generateMock')"
          >
            <Zap :size="10" /> 生成模板
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}
</style>
