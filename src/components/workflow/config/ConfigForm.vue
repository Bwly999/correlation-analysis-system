<script setup lang="ts">
import { computed } from 'vue'
import type {
  JsTransformAgentContext,
  JsTransformAgentSafeDebugResult,
  WorkflowAiModelProfile,
} from '@/ai/types'
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
  agentProfile?: WorkflowAiModelProfile | null
  agentOutputData?: unknown
  agentErrorMessage?: string
  buildJsTransformAgentContext?: (() => JsTransformAgentContext) | undefined
  onAgentDebugNode?: (mode: 'reuse_cached_upstream' | 'rerun_upstream') => Promise<JsTransformAgentSafeDebugResult>
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, unknown>]
  save: []
}>()

const PRIMARY_PROPERTY_NAMES = new Set([
  'xFields',
  'yFields',
  'method',
  'targetField',
  'factorNames',
  'topN',
  'heatmapTopN',
  'rankingTopN',
  'deduplicationMode',
  'deduplicationKeep',
])
const TOP_PROPERTY_NAMES = new Set(['method'])

const sortedProperties = computed(() => {
  return [...props.properties].sort((left, right) => {
    const leftPriority =
      (TOP_PROPERTY_NAMES.has(left.name) ? 100 : 0) +
      (left.required ? 4 : 0) +
      (PRIMARY_PROPERTY_NAMES.has(left.name) ? 3 : 0) +
      (left.useUpstreamFactors ? 2 : 0)
    const rightPriority =
      (TOP_PROPERTY_NAMES.has(right.name) ? 100 : 0) +
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

const secondaryPropertyGroups = computed(() => {
  const groups: Array<{ name: string | null; properties: NodeProperty[] }> = []

  secondaryProperties.value.forEach((property) => {
    const groupName = property.group ?? null
    let group = groups.find((item) => item.name === groupName)
    if (!group) {
      group = { name: groupName, properties: [] }
      groups.push(group)
    }
    group.properties.push(property)
  })

  return groups
})

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

const updateConfigFields = (fields: Record<string, unknown>) => {
  emit('update:config', {
    ...props.config,
    ...fields,
  })
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-10 py-4">
    <section v-if="primaryProperties.length > 0" class="space-y-6">
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
          :agent-profile="agentProfile"
          :agent-output-data="agentOutputData"
          :agent-error-message="agentErrorMessage"
          :build-js-transform-agent-context="buildJsTransformAgentContext"
          :on-agent-debug-node="onAgentDebugNode"
          @update:model-value="(val) => updateConfig(prop.name, val)"
          @update:config-fields="updateConfigFields"
          @save="emit('save')"
        />
      </div>
    </section>

    <section v-if="secondaryProperties.length > 0" class="space-y-8">
      <div v-for="group in secondaryPropertyGroups" :key="group.name ?? '__default__'" class="space-y-6">
        <div
          v-if="group.name"
          class="border-b border-slate-100 pb-2 text-xs font-bold text-slate-500"
        >
          {{ group.name }}
        </div>
        <div
          v-for="prop in group.properties"
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
            :agent-profile="agentProfile"
            :agent-output-data="agentOutputData"
            :agent-error-message="agentErrorMessage"
            :build-js-transform-agent-context="buildJsTransformAgentContext"
            :on-agent-debug-node="onAgentDebugNode"
            @update:model-value="(val) => updateConfig(prop.name, val)"
            @update:config-fields="updateConfigFields"
            @save="emit('save')"
          />
        </div>
      </div>
    </section>
  </div>
</template>
