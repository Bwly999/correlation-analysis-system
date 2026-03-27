<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { type NodeProperty } from '@/nodes/types'
import PropertyField from './PropertyField.vue'
import { applyDependencyReset } from './configDependencies'

const props = defineProps<{
  properties: NodeProperty[]
  resetProperties?: NodeProperty[]
  config: any
  upstreamFactors: Array<{ name: string; value: string }>
  nodeId?: string | null
  inputData?: unknown
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, unknown>]
}>()

const updateConfig = (propName: string, value: any) => {
  emit(
    'update:config',
    applyDependencyReset({
      properties: props.resetProperties || props.properties,
      previousConfig: props.config,
      propName,
      value,
    }),
  )
}
</script>

<template>
  <div
    data-testid="runtime-inputs-root"
    class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
  >
    <div
      data-testid="runtime-inputs-card"
      class="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]"
    >
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span
          class="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500"
        >
          <Zap :size="12" class="text-amber-500" /> 运行时输入
        </span>
      </div>
      <div
        data-testid="runtime-inputs-scroll"
        class="custom-scrollbar flex-1 overflow-y-auto px-4 pb-8 pt-4"
      >
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
              :node-id="nodeId"
              :input-data="inputData"
              @update:model-value="(val) => updateConfig(prop.name, val)"
            />
          </div>
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
