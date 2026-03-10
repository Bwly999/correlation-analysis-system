<script setup lang="ts">
import Button from 'primevue/button'

const emit = defineEmits(['close', 'save'])
</script>

<template>
  <div class="h-16 border-t flex items-center justify-end px-8 gap-3 bg-white">
    <div class="mr-auto flex items-center gap-2 text-slate-400">
      <kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold">
        Enter
      </kbd>
      <span class="text-[11px] font-medium tracking-tight">确认标签 / 快速保存</span>
    </div>
    <Button
      label="取消"
      severity="secondary"
      text
      class="cursor-pointer"
      @click="emit('close')"
    />
    <Button label="应用并保存" class="cursor-pointer" @click="emit('save')" />
  </div>
</template>
