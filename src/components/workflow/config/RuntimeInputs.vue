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
  emit('update:config', { ...props.config, [propName]: value })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-slate-200 bg-[#f1f5f9]">
    <div class="flex items-center justify-between px-4 py-3">
      <span
        class="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500"
      >
        <Zap :size="12" class="text-amber-500" /> 运行时输入
      </span>
    </div>
    <div class="custom-scrollbar flex-1 overflow-y-auto px-4 pb-4">
      <div
        v-if="properties.length === 0"
        class="flex h-full flex-col items-center justify-center text-[11px] italic text-slate-400"
      >
        当前节点没有可配置的运行时输入
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
            :config-context="config"
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
