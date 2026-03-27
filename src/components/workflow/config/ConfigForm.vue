<script setup lang="ts">
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
  save: []
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
  <div class="mx-auto max-w-2xl space-y-10 py-4">
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
        @save="emit('save')"
      />
    </div>
  </div>
</template>
