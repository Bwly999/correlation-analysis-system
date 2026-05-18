<script setup lang="ts">
import { computed, defineAsyncComponent, shallowRef } from 'vue'
import { MessageSquarePlus, X } from 'lucide-vue-next'
import type {
  JsTransformAgentContext,
  JsTransformAgentSafeDebugResult,
  WorkflowAiModelProfile,
} from '@/ai/types'
import JsTransformAgentPanel from '@/components/workflow/JsTransformAgentPanel.vue'

const MonacoEditor = defineAsyncComponent(() => import('@/components/workflow/MonacoEditor.vue'))

const props = defineProps<{
  modelValue: unknown
  height?: string
  language?: string
  declarations?: string
  nodeId?: string | null
  contextBuilder?: (() => JsTransformAgentContext) | undefined
  profile?: WorkflowAiModelProfile | null
  outputData?: unknown
  errorMessage?: string
  onDebugNode?: (mode: 'reuse_cached_upstream' | 'rerun_upstream') => Promise<JsTransformAgentSafeDebugResult>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const isPanelVisible = shallowRef(false)

const isAgentFeatureEnabled = computed(() =>
  Boolean(props.nodeId && props.contextBuilder && props.onDebugNode),
)

const isAgentReady = computed(() => Boolean(isAgentFeatureEnabled.value && props.profile))

const agentContext = computed(() => props.contextBuilder?.() ?? null)

const agentPanelProps = computed(() => {
  if (
    !isAgentReady.value ||
    !agentContext.value ||
    !props.profile ||
    !props.onDebugNode ||
    !props.nodeId
  ) {
    return null
  }

  return {
    nodeId: props.nodeId,
    code: codeValue.value,
    context: agentContext.value,
    profile: props.profile,
    outputData: props.outputData,
    errorMessage: props.errorMessage,
    onApplyCode: applyCode,
    onDebugNode: props.onDebugNode,
  }
})

const codeValue = computed({
  get: () => (typeof props.modelValue === 'string' ? props.modelValue : ''),
  set: (value: string) => emit('update:modelValue', value),
})

const openPanel = () => {
  if (!isAgentReady.value) return
  isPanelVisible.value = true
}

const closePanel = () => {
  isPanelVisible.value = false
}

const applyCode = (code: string) => {
  emit('update:modelValue', code)
}
</script>

<template>
  <div class="relative">
    <div class="relative overflow-visible pr-[464px]">
      <button
        v-if="isAgentFeatureEnabled"
        v-tooltip.top="isAgentReady ? '打开 AI 助手' : '请先选择模型配置'"
        type="button"
        data-testid="js-transform-agent-toggle"
        class="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        :class="{ 'cursor-not-allowed opacity-45 hover:border-slate-200 hover:bg-white hover:text-slate-500': !isAgentReady }"
        :disabled="!isAgentReady"
        @click="openPanel"
      >
        <MessageSquarePlus :size="16" />
      </button>

      <MonacoEditor
        v-model="codeValue"
        :height="height"
        :language="language"
        :declarations="declarations"
      />

      <div
        v-if="agentPanelProps"
        v-show="isPanelVisible"
        data-testid="js-transform-agent-dock"
        class="absolute right-0 top-0 z-20 w-[420px] translate-x-[calc(100%+20px)]"
      >
        <div class="relative">
          <button
            type="button"
            data-testid="js-transform-agent-close"
            class="absolute right-4 top-4 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            @click="closePanel"
          >
            <X :size="14" />
          </button>
          <JsTransformAgentPanel
            v-bind="agentPanelProps"
          />
        </div>
      </div>
    </div>
  </div>
</template>
