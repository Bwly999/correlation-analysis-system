<script setup lang="ts">
import { Pin, X } from 'lucide-vue-next'
import NodeIcon from '../nodes/NodeIcon.vue'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'

const _props = defineProps<{
  nodeType: string
  nodeLabel: string
  isPinned: boolean
}>()

const emit = defineEmits(['update:nodeLabel', 'update:isPinned', 'close', 'save'])
</script>

<template>
  <div class="flex items-center justify-between w-full px-1">
    <div class="flex items-center gap-3">
      <NodeIcon :type="nodeType" :size="32" />
      <div class="flex flex-col">
        <input
          :value="nodeLabel"
          class="ndv-title-input h-8 font-bold text-lg p-0 px-2 text-[#1a1f36] rounded transition-all"
          placeholder="输入节点名称..."
          @input="(e) => emit('update:nodeLabel', (e.target as HTMLInputElement).value)"
        />
        <span class="text-[10px] uppercase font-bold text-slate-400 px-2 tracking-widest">{{
          nodeType
        }}</span>
      </div>
    </div>
    <div class="flex items-center gap-4">
      <div
        v-tooltip.bottom="'开启后，该节点在运行流程时将跳过计算，直接使用上次生成的输出数据'"
        class="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200"
      >
        <Pin
          :size="14"
          :class="isPinned ? 'text-amber-500' : 'text-slate-400'"
          :fill="isPinned ? 'currentColor' : 'none'"
        />
        <span
          class="text-[11px] font-bold uppercase tracking-wider"
          :class="isPinned ? 'text-amber-600' : 'text-slate-500'"
        >
          {{ isPinned ? '数据已冻结' : '冻结数据' }}
        </span>
        <ToggleSwitch
          :model-value="isPinned"
          class="scale-75 origin-right"
          @update:model-value="(val) => emit('update:isPinned', val)"
        />
      </div>
      <Button severity="secondary" text class="cursor-pointer" @click="emit('close')">
        <X :size="20" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.ndv-title-input {
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none !important;
  outline: none !important;
}
.ndv-title-input:hover {
  border-color: #e2e8f0;
}
.ndv-title-input:focus {
  border-color: #6366f1;
  background: white;
}
</style>
