<script setup lang="ts">
import { computed } from 'vue'
import { HelpCircle } from 'lucide-vue-next'
import { type NodeProperty } from '@/nodes/types'
import PropertyField from './PropertyField.vue'
import { applyDependencyReset } from './configDependencies'

type UpstreamFactorOption = {
  name: string
  value: string
  dataType?: string
  nullable?: boolean
}

const props = defineProps<{
  properties: NodeProperty[]
  resetProperties?: NodeProperty[]
  config: any
  upstreamFactors: UpstreamFactorOption[]
  nodeId?: string | null
  inputData?: unknown
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, unknown>]
  save: []
}>()

const PRIMARY_PROPERTY_NAMES = new Set(['xFields', 'yFields', 'targetField', 'factorNames', 'topN'])

const sortedProperties = computed(() => {
  return [...props.properties].sort((left, right) => {
    const leftPriority =
      (left.required ? 4 : 0) +
      (PRIMARY_PROPERTY_NAMES.has(left.name) ? 3 : 0) +
      (left.useUpstreamFactors ? 2 : 0)
    const rightPriority =
      (right.required ? 4 : 0) +
      (PRIMARY_PROPERTY_NAMES.has(right.name) ? 3 : 0) +
      (right.useUpstreamFactors ? 2 : 0)

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority
    }

    return 0
  })
})

const primaryProperties = computed(() =>
  sortedProperties.value.filter(
    (property) =>
      property.required || property.useUpstreamFactors || PRIMARY_PROPERTY_NAMES.has(property.name),
  ),
)

const secondaryProperties = computed(() =>
  sortedProperties.value.filter(
    (property) =>
      !property.required && !property.useUpstreamFactors && !PRIMARY_PROPERTY_NAMES.has(property.name),
  ),
)

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
    <section v-if="primaryProperties.length > 0" class="space-y-6">
      <div class="flex items-center gap-2">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">核心参数</div>
        <HelpCircle
          v-tooltip.right="'先完成这些配置，通常就能跑通当前节点。'"
          :size="14"
          class="cursor-help text-slate-300"
        />
      </div>

      <div
        v-for="prop in primaryProperties"
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
    </section>

    <section v-if="secondaryProperties.length > 0" class="space-y-6">
      <div class="flex items-center gap-2">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">补充参数</div>
        <HelpCircle
          v-tooltip.right="'这些参数用于微调展示或执行细节，可按需调整。'"
          :size="14"
          class="cursor-help text-slate-300"
        />
      </div>

      <div
        v-for="prop in secondaryProperties"
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
    </section>
  </div>
</template>
