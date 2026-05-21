<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertCircle, HelpCircle, Settings } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import PropertyField from './config/PropertyField.vue'
import { applyDependencyReset } from './config/configDependencies'
import { type WorkflowNode } from '@/utils/storage'
import { getNodeDefinition } from '@/nodes/registry'
import { useWorkflowStore } from '@/stores/workflowStore'

const props = defineProps<{
  visible: boolean
  node: WorkflowNode | null
}>()

const emit = defineEmits(['close', 'confirm'])
const config = ref<Record<string, any>>({})
const reuseLastRuntimeInputs = ref(false)
const store = useWorkflowStore()

const nodeDefinition = computed(() => (props.node ? getNodeDefinition(props.node.data.type) : null))
const runtimeProperties = computed(
  () => nodeDefinition.value?.properties.filter((property) => property.isRuntimeInput) || [],
)
const isGlobalContinuation = computed(() => store.pendingExecution?.executionScope === 'global')
const globalPromptProgressText = computed(() => {
  if (!isGlobalContinuation.value) return ''
  const current = store.pendingExecution?.promptIndex
  const total = store.pendingExecution?.promptTotal
  if (!current || !total || total <= 1) return ''
  return `${current}/${total}`
})
const currentNodeLabel = computed(() => props.node?.data.label || '当前节点')
const currentFileImportTask = computed(() =>
  props.node ? (store.fileImportTasks[props.node.id] ?? null) : null,
)
const fileImportPhaseTextMap = {
  reading: '正在读取文件',
  parsing: '正在解析文件内容',
  cleaning: '正在清洗并识别字段',
  finalizing: '正在整理结果',
} as const
const currentFileImportPhaseText = computed(() => {
  const phase = currentFileImportTask.value?.phase
  return phase ? fileImportPhaseTextMap[phase] : ''
})
const runtimeInputHelpText = computed(() =>
  [
    `请为节点 ${currentNodeLabel.value} 补充本次运行所需的动态参数。`,
    isGlobalContinuation.value
      ? '提交后系统会自动继续执行；若还有其他启动节点缺少参数，将继续弹出下一项。'
      : '',
    hasMissingRequiredInputs.value ? missingRequiredHint.value : '',
  ]
    .filter(Boolean)
    .join('\n'),
)
const reuseToggleHint = computed(() =>
  reuseLastRuntimeInputs.value
    ? '开启后，下次启动会默认沿用当前确认过的运行时参数。'
    : '关闭后，每次启动都会要求重新输入本次运行参数。',
)

const isValueValid = (value: any, type: string) => {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (type === 'file') {
    return value instanceof File || (typeof value === 'object' && value.name)
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0
  }
  return true
}

const visibleRequiredRuntimeProperties = computed(() =>
  runtimeProperties.value.filter(
    (property) =>
      property.required && (!property.displayIf || property.displayIf(config.value)),
  ),
)

const missingRequiredRuntimeProperties = computed(() =>
  visibleRequiredRuntimeProperties.value.filter(
    (property) => !isValueValid(config.value[property.name], property.type),
  ),
)

const hasMissingRequiredInputs = computed(() => missingRequiredRuntimeProperties.value.length > 0)
const missingRequiredHint = computed(() => {
  if (!hasMissingRequiredInputs.value) return ''
  const names = missingRequiredRuntimeProperties.value.map((property) => property.displayName)
  const preview = names.slice(0, 2).join('、')
  const suffix = names.length > 2 ? ` 等 ${names.length} 项` : ''
  return `仍需填写：${preview}${suffix}`
})

const confirmLabel = computed(() => {
  if (!isGlobalContinuation.value) return '确认并开始运行'
  const current = store.pendingExecution?.promptIndex
  const total = store.pendingExecution?.promptTotal
  if (current && total && current >= total) return '确认并执行工作流'
  return '确认并继续下一项'
})

const buildRuntimeConfig = (node: WorkflowNode, reusePreviousValues: boolean) => {
  const nextConfig = { ...node.data.config }
  const shouldResetRuntimeValues =
    !reusePreviousValues && (node.data.persistRuntimeInputs ?? true) === false

  runtimeProperties.value.forEach((property) => {
    if (shouldResetRuntimeValues) {
      nextConfig[property.name] = property.default ?? null
      return
    }

    if (nextConfig[property.name] === undefined) {
      nextConfig[property.name] = property.default
    }
  })
  return nextConfig
}

watch(
  () => props.node,
  (node) => {
    if (!node) {
      config.value = {}
      reuseLastRuntimeInputs.value = false
      return
    }

    reuseLastRuntimeInputs.value = node.data.reuseLastRuntimeInputs ?? false
    config.value = buildRuntimeConfig(node, reuseLastRuntimeInputs.value)
  },
  { immediate: true },
)

const updateConfig = (propName: string, value: any) => {
  config.value = applyDependencyReset({
    properties: runtimeProperties.value,
    previousConfig: config.value,
    propName,
    value,
  })
}

const handleConfirm = () => {
  emit('confirm', {
    config: config.value,
    reuseLastRuntimeInputs: reuseLastRuntimeInputs.value,
  })
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('close')"
    modal
    dismissableMask
    :style="{ width: '560px' }"
    :pt="{
      mask: {
        class: 'runtime-input-dialog-mask',
      },
    }"
    :closable="true"
    class="runtime-input-dialog"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Settings :size="18" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold text-slate-900">运行时输入</span>
          <span
            v-if="globalPromptProgressText"
            class="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700"
          >
            {{ globalPromptProgressText }}
          </span>
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-4 py-2">
      <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 shadow-sm shrink-0">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-900">{{ currentNodeLabel }}</div>
          <div class="mt-1 text-[12px] text-slate-500">确认本次运行所需的动态参数</div>
        </div>
        <div class="flex items-center gap-2">
          <div
            v-if="hasMissingRequiredInputs"
            class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600"
          >
            <AlertCircle :size="12" />
            <span>{{ missingRequiredHint }}</span>
          </div>
          <button
            v-tooltip.left="runtimeInputHelpText"
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-blue-200 hover:text-blue-600"
          >
            <HelpCircle :size="15" />
          </button>
        </div>
      </div>

      <div
        v-if="currentFileImportTask"
        class="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="font-semibold">正在后台解析文件</div>
          <div class="text-[12px] font-semibold text-blue-700">
            {{ currentFileImportTask.progress }}%
          </div>
        </div>
        <div class="mt-1 text-[12px] text-blue-700">
          {{ currentFileImportTask.fileName }} · {{ currentFileImportPhaseText }}
        </div>
      </div>

      <div
        v-if="runtimeProperties.length === 0"
        class="flex flex-col items-center justify-center py-10 text-center"
      >
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300"
        >
          <Settings :size="24" />
        </div>
        <p class="text-sm font-medium text-slate-400">当前节点没有需要填写的运行时参数</p>
      </div>

      <div v-else class="flex flex-col min-h-0">
        <div class="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div class="flex items-center justify-between gap-4">
            <div class="flex min-w-0 items-center gap-2">
              <div class="text-sm font-semibold text-slate-900">沿用上次启动参数</div>
              <button
                v-tooltip.bottom="reuseToggleHint"
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition hover:border-blue-200 hover:bg-white hover:text-blue-600"
              >
                <HelpCircle :size="14" />
              </button>
            </div>
            <ToggleSwitch v-model="reuseLastRuntimeInputs" class="shrink-0 !scale-[0.72]" />
          </div>
        </div>

        <div class="space-y-6">
          <div
            v-for="prop in runtimeProperties"
            v-show="!prop.displayIf || prop.displayIf(config)"
            :key="prop.name"
            class="runtime-prop-item"
          >
            <PropertyField
              :prop="prop"
              :model-value="config[prop.name]"
              :upstream-factors="[]"
              :config-context="config"
              @update:model-value="(val) => updateConfig(prop.name, val)"
            />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-3 pt-2">
        <Button
          label="取消"
          severity="secondary"
          variant="text"
          class="px-6 font-bold !text-slate-500 hover:!bg-slate-100"
          @click="emit('close')"
        />
        <Button
          :label="confirmLabel"
          severity="primary"
          class="rounded-xl px-8 font-bold shadow-lg shadow-blue-200"
          :disabled="hasMissingRequiredInputs"
          @click="handleConfirm"
        />
      </div>
    </template>
  </Dialog>
</template>

<style>
.runtime-input-dialog-mask {
  align-items: flex-start !important;
  padding-top: clamp(2rem, 8vh, 5rem);
}

.runtime-input-dialog .p-dialog-header {
  border-bottom: 1px solid #f1f5f9;
  padding: 1.5rem;
}

.runtime-input-dialog .p-dialog-content {
  padding: 1.5rem;
}

.runtime-input-dialog .p-dialog-footer {
  border-top: 1px solid #f1f5f9;
  padding: 1.25rem 1.5rem;
}

.runtime-prop-item {
  animation: slide-up 0.3s ease-out forwards;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
