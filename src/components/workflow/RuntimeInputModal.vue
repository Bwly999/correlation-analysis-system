<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Info } from 'lucide-vue-next'
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
    header="运行时输入"
    :style="{ width: '520px' }"
    :closable="false"
    class="runtime-input-dialog"
  >
    <div class="flex flex-col gap-6 py-4">
      <div class="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
        <Info class="shrink-0 text-blue-500" :size="18" />
        <p class="text-xs font-medium leading-relaxed text-blue-700">
          请为 <b>{{ node?.data.label }}</b> 补充本次运行所需的动态参数。
        </p>
      </div>

      <div v-if="runtimeProperties.length === 0" class="text-sm text-slate-500">
        当前节点没有需要填写的运行时参数。
      </div>

      <div
        v-for="prop in runtimeProperties"
        v-show="!prop.displayIf || prop.displayIf(config)"
        :key="prop.name"
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

    <template #footer>
      <div class="flex w-full gap-2">
        <Button
          label="取消"
          severity="secondary"
          text
          class="flex-1 cursor-pointer"
          @click="emit('close')"
        />
        <Button
          label="确认并继续"
          severity="primary"
          class="flex-1 cursor-pointer"
          @click="handleConfirm"
        />
      </div>
    </template>
  </Dialog>
</template>

<style>
.runtime-input-dialog .p-dialog-header {
  border-bottom: none;
  padding-bottom: 0;
}

.runtime-input-dialog .p-dialog-footer {
  border-top: none;
}
</style>
