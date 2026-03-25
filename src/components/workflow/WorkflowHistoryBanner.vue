<script setup lang="ts">
import { AlertTriangle, Undo2 } from 'lucide-vue-next'
import Button from 'primevue/button'

const emit = defineEmits<{
  exit: []
}>()
</script>

<template>
  <div
    class="absolute top-0 left-0 right-0 z-[110] bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300"
  >
    <div class="flex items-center gap-3">
      <div class="p-1.5 bg-white/20 rounded-lg">
        <AlertTriangle :size="18" class="text-white" />
      </div>
      <div class="flex flex-col">
        <span class="font-bold text-[13px] tracking-tight">历史记录查看模式</span>
        <span class="text-[11px] opacity-90">当前工作流处于只读状态，编辑与运行功能已禁用</span>
      </div>
    </div>
    <Button
      severity="secondary"
      class="h-8 px-4 text-[11px] font-bold bg-white/20 hover:bg-white/30 border-none text-white rounded-lg flex items-center gap-2 transition-all active:scale-95"
      @click="emit('exit')"
    >
      <Undo2 :size="14" />
      返回编辑模式
    </Button>
  </div>
</template>
