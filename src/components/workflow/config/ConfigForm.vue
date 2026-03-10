<script setup lang="ts">
import { type NodeProperty } from '@/nodes/types'
import PropertyField from './PropertyField.vue'

const props = defineProps<{
  properties: NodeProperty[]
  config: any
  upstreamFactors: Array<{ name: string; value: string }>
}>()

const emit = defineEmits(['update:config', 'save'])

const updateConfig = (propName: string, value: any) => {
  const newConfig = { ...props.config, [propName]: value }
  emit('update:config', newConfig)
}
</script>

<template>
  <div class="space-y-10 max-w-2xl mx-auto py-4">
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
        @save="emit('save')"
      />
    </div>
  </div>
</template>
