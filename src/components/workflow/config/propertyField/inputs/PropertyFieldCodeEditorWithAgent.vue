<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { MessageSquarePlus, X } from 'lucide-vue-next'
import type {
  JsTransformAgentContext,
  JsTransformAgentSafeDebugResult,
} from '@/ai/types'
import JsTransformAgentPanel from '@/components/workflow/JsTransformAgentPanel.vue'
import { usePiAgentConfigStore } from '@/stores/piAgentConfigStore'

const MonacoEditor = defineAsyncComponent(() => import('@/components/workflow/MonacoEditor.vue'))

const props = defineProps<{
  modelValue: unknown
  height?: string
  language?: string
  declarations?: string
  nodeId?: string | null
  contextBuilder?: (() => JsTransformAgentContext) | undefined
  outputData?: unknown
  errorMessage?: string
  onDebugNode?: (mode: 'reuse_cached_upstream' | 'rerun_upstream') => Promise<JsTransformAgentSafeDebugResult>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const isPanelVisible = shallowRef(false)
const piAgentConfigStore = usePiAgentConfigStore()
const toggleButtonRef = ref<HTMLButtonElement | null>(null)
const panelStyle = ref<Record<string, string>>({
  top: '8px',
  right: '20px',
  width: '560px',
  maxHeight: '620px',
})

const isAgentFeatureEnabled = computed(() =>
  Boolean(props.nodeId && props.contextBuilder && props.onDebugNode),
)

const selectedProfile = computed(() => piAgentConfigStore.selectedProfile)
const isAgentReady = computed(() => Boolean(isAgentFeatureEnabled.value && selectedProfile.value))

const agentContext = computed(() => props.contextBuilder?.() ?? null)

const agentPanelProps = computed(() => {
  if (
    !isAgentReady.value ||
    !agentContext.value ||
    !selectedProfile.value ||
    !props.onDebugNode ||
    !props.nodeId
  ) {
    return null
  }

  return {
    nodeId: props.nodeId,
    code: codeValue.value,
    context: agentContext.value,
    profile: selectedProfile.value,
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

const syncPanelPosition = () => {
  const trigger = toggleButtonRef.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const panelWidth = 560
  const viewportWidth = window.innerWidth
  const safeGap = 8
  const preferredTop = Math.max(safeGap, Math.round(rect.top - 84))
  const availableRightSpace = viewportWidth - rect.right - safeGap
  const canDockOnRight = availableRightSpace >= panelWidth + 24

  if (canDockOnRight) {
    panelStyle.value = {
      top: `${preferredTop}px`,
      left: `${Math.round(rect.right + 24)}px`,
      width: `${panelWidth}px`,
      height: '780px',
      maxHeight: '780px',
    }
    return
  }

  panelStyle.value = {
    top: `${safeGap}px`,
    right: `${safeGap}px`,
    width: `${Math.min(panelWidth, viewportWidth - safeGap * 2)}px`,
    height: '780px',
    maxHeight: '780px',
  }
}

const openPanel = async () => {
  if (!isAgentFeatureEnabled.value) return

  if (!selectedProfile.value) {
    await piAgentConfigStore.loadProfiles()
  }

  if (!selectedProfile.value) return
  isPanelVisible.value = true
  await nextTick()
  syncPanelPosition()
  window.addEventListener('resize', syncPanelPosition)
  window.addEventListener('scroll', syncPanelPosition, true)
}

const closePanel = () => {
  isPanelVisible.value = false
  window.removeEventListener('resize', syncPanelPosition)
  window.removeEventListener('scroll', syncPanelPosition, true)
}

const applyCode = (code: string) => {
  emit('update:modelValue', code)
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncPanelPosition)
  window.removeEventListener('scroll', syncPanelPosition, true)
})
</script>

<template>
  <div class="relative">
    <div class="mb-3 flex items-center justify-end">
      <button
        v-if="isAgentFeatureEnabled"
        ref="toggleButtonRef"
        v-tooltip.top="'打开 AI 助手'"
        type="button"
        data-testid="js-transform-agent-toggle"
        class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        @click="void openPanel()"
      >
        <MessageSquarePlus :size="15" />
      </button>
    </div>

    <div class="relative overflow-visible">
      <MonacoEditor
        v-model="codeValue"
        :height="height"
        :language="language"
        :declarations="declarations"
      />
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="agentPanelProps"
      v-show="isPanelVisible"
      data-testid="js-transform-agent-dock"
      class="fixed z-[3000] overflow-hidden"
      :style="panelStyle"
    >
      <div class="relative h-full">
        <button
          type="button"
          data-testid="js-transform-agent-close"
          class="absolute right-4 top-4 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          @click="closePanel"
        >
          <X :size="14" />
        </button>
        <JsTransformAgentPanel
          v-bind="agentPanelProps"
        />
      </div>
    </div>
  </Teleport>
</template>
