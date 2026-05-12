<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { Maximize, Zap, FileJson, Pin } from 'lucide-vue-next'
import ToggleSwitch from 'primevue/toggleswitch'
import { isPlainObject } from '@/nodes/result'
import StructuredDataPreview from './StructuredDataPreview.vue'
import {
  DEFAULT_STRUCTURED_PREVIEW_OPTIONS,
  createStructuredPreview,
} from './previewSerialization'
import { getResultSchemaFields } from './resultView'

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

const emit = defineEmits<{
  openDetail: []
  generateMock: []
}>()

const previewColumnLimit = computed(() => {
  const schemaCount = getResultSchemaFields(props.data).length
  if (schemaCount > 0) {
    return Math.max(DEFAULT_STRUCTURED_PREVIEW_OPTIONS.maxColumns, schemaCount)
  }

  if (Array.isArray(props.data)) {
    const columnCount = new Set(
      props.data
        .filter((row): row is Record<string, unknown> => isPlainObject(row))
        .flatMap((row) => Object.keys(row)),
    ).size

    if (columnCount > 0) {
      return Math.max(DEFAULT_STRUCTURED_PREVIEW_OPTIONS.maxColumns, columnCount)
    }
  }

  if (isPlainObject(props.data) && Array.isArray(props.data.payload)) {
    const columnCount = new Set(
      props.data.payload
        .filter((row): row is Record<string, unknown> => isPlainObject(row))
        .flatMap((row) => Object.keys(row)),
    ).size

    if (columnCount > 0) {
      return Math.max(DEFAULT_STRUCTURED_PREVIEW_OPTIONS.maxColumns, columnCount)
    }
  }

  return DEFAULT_STRUCTURED_PREVIEW_OPTIONS.maxColumns
})

const structuredPreview = computed(() =>
  createStructuredPreview(props.data, {
    ...DEFAULT_STRUCTURED_PREVIEW_OPTIONS,
    maxRows: 3,
    maxColumns: previewColumnLimit.value,
    maxStringLength: 20,
    maxGroups: 3,
    maxGroupRows: 2,
    maxObjectEntries: 6,
    maxTextLength: 2400,
  }),
)
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
        <StructuredDataPreview
          :preview="structuredPreview"
          :text-max-length="2400"
          prefix="data-preview"
          allow-text-toggle
        />
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
