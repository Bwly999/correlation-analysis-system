<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Info, Settings } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import PropertyField from './config/PropertyField.vue'
import { type WorkflowNode } from '@/utils/storage'
import { getNodeDefinition } from '@/nodes/registry'
import { useWorkflowStore } from '@/stores/workflowStore'

const props = defineProps<{
  visible: boolean
  node: WorkflowNode | null
}>()

const emit = defineEmits(['close', 'confirm'])
const config = ref<Record<string, any>>({})
const store = useWorkflowStore()

// 分割线逻辑
const topHeight = ref(100)
const isResizing = ref(false)

const startResizing = (e: MouseEvent) => {
  isResizing.value = true
  const startY = e.clientY
  const startHeight = topHeight.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizing.value) return
    const deltaY = moveEvent.clientY - startY
    // 限制高度范围：80px 到 400px
    topHeight.value = Math.max(80, Math.min(400, startHeight + deltaY))
  }

  const onMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const nodeDefinition = computed(() => (props.node ? getNodeDefinition(props.node.data.type) : null))
const runtimeProperties = computed(
  () => nodeDefinition.value?.properties.filter((property) => property.isRuntimeInput) || [],
)

// 将属性拆分为首个属性（启动方式）和其余属性
const firstProperty = computed(() => runtimeProperties.value[0] || null)
const otherProperties = computed(() => runtimeProperties.value.slice(1))
const isGlobalContinuation = computed(() => store.pendingExecution?.executionScope === 'global')
const globalPromptProgressText = computed(() => {
  if (!isGlobalContinuation.value) return ''
  const current = store.pendingExecution?.promptIndex
  const total = store.pendingExecution?.promptTotal
  if (!current || !total || total <= 1) return ''
  return `${current}/${total}`
})
const currentNodeLabel = computed(() => props.node?.data.label || '当前节点')

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

watch(
  () => props.node,
  (node) => {
    if (!node) {
      config.value = {}
      return
    }

    const nextConfig = { ...node.data.config }
    runtimeProperties.value.forEach((property) => {
      if (nextConfig[property.name] === undefined) {
        nextConfig[property.name] = property.default
      }
    })
    config.value = nextConfig
  },
  { immediate: true },
)

const updateConfig = (propName: string, value: any) => {
  config.value = { ...config.value, [propName]: value }
}

const handleConfirm = () => {
  emit('confirm', config.value)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('close')"
    modal
    dismissableMask
    :style="{ width: '560px' }"
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

    <div class="flex flex-col gap-4 py-2" :class="{ 'cursor-row-resize select-none': isResizing }">
      <div class="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm shrink-0">
        <Info class="shrink-0 text-blue-500" :size="18" />
        <p class="text-[13px] font-medium leading-relaxed text-slate-600">
          请为节点
          <span class="font-bold text-blue-700">{{ currentNodeLabel }}</span>
          补充本次运行所需的动态参数。这些设置仅对本次运行有效。
          <span v-if="isGlobalContinuation" class="mt-1 block text-[12px] text-blue-700">
            提交后系统会自动继续执行；若还有其他启动节点缺少参数，将继续弹出下一项。
          </span>
          <span v-if="hasMissingRequiredInputs" class="mt-1 block text-[12px] text-rose-600">
            {{ missingRequiredHint }}
          </span>
        </p>
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
        <!-- 顶部固定区域：通常是启动方式 -->
        <div
          v-if="firstProperty"
          class="shrink-0 mb-2 overflow-hidden"
          :style="{ height: topHeight + 'px' }"
        >
          <PropertyField
            :prop="firstProperty"
            :model-value="config[firstProperty.name]"
            :upstream-factors="[]"
            :config-context="config"
            @update:model-value="(val) => updateConfig(firstProperty.name, val)"
          />
        </div>

        <!-- 可调节分割线 -->
        <div
          v-if="otherProperties.length > 0"
          class="group flex items-center justify-center h-4 cursor-row-resize select-none my-1"
          @mousedown="startResizing"
        >
          <div class="w-12 h-1 bg-slate-200 rounded-full group-hover:bg-blue-400 transition-colors" />
        </div>

        <!-- 底部滚动区域：其余属性 -->
        <div class="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div
            v-for="prop in otherProperties"
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
