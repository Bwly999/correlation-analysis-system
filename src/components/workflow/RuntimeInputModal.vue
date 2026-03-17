<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Info, Settings } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import PropertyField from './config/PropertyField.vue'
import { type WorkflowNode } from '@/utils/storage'
import { getNodeDefinition } from '@/nodes/registry'

const props = defineProps<{
  visible: boolean
  node: WorkflowNode | null
}>()

const emit = defineEmits(['close', 'confirm'])
const config = ref<Record<string, any>>({})

const nodeDefinition = computed(() => (props.node ? getNodeDefinition(props.node.data.type) : null))
const runtimeProperties = computed(
  () => nodeDefinition.value?.properties.filter((property) => property.isRuntimeInput) || [],
)

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
    modal
    :style="{ width: '560px' }"
    :closable="true"
    class="runtime-input-dialog"
    @hide="emit('close')"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Settings :size="18" />
        </div>
        <span class="text-lg font-bold text-slate-900">运行时输入</span>
      </div>
    </template>

    <div class="flex flex-col gap-6 py-2">
      <div class="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm">
        <Info class="shrink-0 text-blue-500" :size="18" />
        <p class="text-[13px] font-medium leading-relaxed text-slate-600">
          请为节点 <span class="font-bold text-blue-700">{{ node?.data.label }}</span> 补充本次运行所需的动态参数。这些设置仅对本次运行有效。
        </p>
      </div>

      <div v-if="runtimeProperties.length === 0" class="flex flex-col items-center justify-center py-10 text-center">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300">
          <Settings :size="24" />
        </div>
        <p class="text-sm font-medium text-slate-400">当前节点没有需要填写的运行时参数</p>
      </div>

      <div class="space-y-6 min-h-0 flex-1 overflow-y-auto">
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
          label="确认并开始运行"
          severity="primary"
          class="rounded-xl px-8 font-bold shadow-lg shadow-blue-200"
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
