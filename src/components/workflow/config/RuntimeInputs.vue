<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { type NodeProperty } from '@/nodes/types'
import PropertyField from './PropertyField.vue'

const props = defineProps<{
  properties: NodeProperty[]
  config: any
  upstreamFactors: Array<{ name: string; value: string }>
}>()

const emit = defineEmits(['update:config'])

const updateConfig = (propName: string, value: any) => {
  const newConfig = { ...props.config, [propName]: value }
  emit('update:config', newConfig)
}
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col border-t border-slate-200 bg-[#f1f5f9] overflow-hidden">
    <div class="px-4 py-3 flex items-center justify-between">
      <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] flex items-center gap-2">
        <Zap size="12" class="text-amber-500" /> 节点启动输入
      </span>
    </div>
    <div class="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
      <div
        v-if="properties.length === 0"
        class="h-full flex flex-col items-center justify-center text-slate-400 italic text-[11px]"
      >
        无需额外输入参数
      </div>
      <div v-else class="space-y-6">
        <div
          v-for="prop in properties"
          v-show="!prop.displayIf || prop.displayIf(config)"
          :key="prop.name"
        >
          <PropertyField
            :prop="prop"
            :model-value="config[prop.name]"
            :upstream-factors="upstreamFactors"
            @update:model-value="(val) => updateConfig(prop.name, val)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
</style>
