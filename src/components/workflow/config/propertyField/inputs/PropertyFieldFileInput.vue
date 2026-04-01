<script setup lang="ts">
import { FileType } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'

const props = defineProps<{
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const store = useWorkflowStore()

const updateFileValue = (file: File) => {
  emit('update:modelValue', file)
  store.addLog(`已选择文件: ${file.name}`, 'info')
}

const onFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    updateFileValue(file)
  }
  target.value = ''
}

const onFileDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files[0]
  if (file) {
    updateFileValue(file)
  }
}
</script>

<template>
  <div class="space-y-2">
    <label
      class="flex h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white transition-all hover:border-blue-400 hover:bg-blue-50/30"
      @dragover.prevent
      @drop.prevent="onFileDrop"
    >
      <input type="file" class="hidden" @change="onFileSelect" />
      <FileType
        :size="20"
        class="mb-1"
        :class="modelValue ? 'text-emerald-500' : 'text-slate-300'"
      />
      <span class="w-full truncate px-2 text-center text-[10px] font-bold text-slate-400">
        {{ modelValue ? (modelValue as File).name : '点击或拖拽上传文件' }}
      </span>
    </label>
  </div>
</template>
