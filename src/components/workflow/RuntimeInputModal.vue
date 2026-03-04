<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Play, FileType, Info, HelpCircle } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflowStore'
import { getNodeDefinition } from '@/nodes/registry'

const props = defineProps<{
  visible: boolean
  node: WorkflowNode | null
}>()

const emit = defineEmits(['close', 'confirm'])
const store = useWorkflowStore()
const config = ref<any>({})

const nodeDefinition = computed(() => props.node ? getNodeDefinition(props.node.data.type) : null)
const runtimeProperties = computed(() => nodeDefinition.value?.properties.filter(p => p.isRuntimeInput) || [])

watch(() => props.node, (newNode) => {
  if (newNode) {
    const baseConfig = { ...newNode.data.config }
    runtimeProperties.value.forEach(p => {
      if (baseConfig[p.name] === undefined) {
        baseConfig[p.name] = p.default
      }
    })
    config.value = baseConfig
  }
}, { immediate: true })

const onFileSelect = (event: any, propName: string) => {
  const file = event.target.files[0]
  if (file) config.value[propName] = file
}

const handleConfirm = () => {
  if (props.node) {
    // 将运行时参数写回节点配置
    props.node.data.config = { ...props.node.data.config, ...config.value }
  }
  emit('confirm', config.value)
}
</script>

<template>
  <Dialog 
    :visible="visible" 
    modal 
    header="运行时参数设置" 
    :style="{ width: '450px' }"
    :closable="false"
    class="runtime-input-dialog"
  >
    <div class="flex flex-col gap-6 py-4">
      <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex gap-3">
         <Info class="text-indigo-500 shrink-0" size="18" />
         <p class="text-xs text-indigo-700 leading-relaxed font-medium">
           节点 <b>{{ node?.data.label }}</b> 需要您提供即时输入参数以启动分析流程。
         </p>
      </div>

      <div v-for="prop in runtimeProperties" :key="prop.name" class="flex flex-col gap-2">
        <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
          {{ prop.displayName }}
          <HelpCircle v-if="prop.description" size="12" class="ml-1 opacity-50" />
        </label>

        <!-- 根据类型渲染 -->
        <DatePicker v-if="prop.type === 'datetime-range'" v-model="config[prop.name]" selectionMode="range" showTime class="w-full" />
        
        <div v-else-if="prop.type === 'file'" class="space-y-2">
           <div v-if="config[prop.name]" class="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-800 truncate">{{ config[prop.name].name }}</span>
              <Button icon="pi pi-times" severity="danger" text size="small" @click="config[prop.name] = null" />
           </div>
           <label v-else class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl hover:border-indigo-400 cursor-pointer transition-all">
              <input type="file" class="hidden" @change="onFileSelect($event, prop.name)" />
              <FileType size="24" class="text-slate-300 mb-2" />
              <span class="text-[10px] font-bold text-slate-400 uppercase">选择文件</span>
           </label>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2 w-full">
        <Button label="取消" severity="secondary" text @click="emit('close')" class="flex-1" />
        <Button label="确认并启动" severity="primary" @click="handleConfirm" class="flex-1" />
      </div>
    </template>
  </Dialog>
</template>

<style>
.runtime-input-dialog .p-dialog-header { border-bottom: none; padding-bottom: 0; }
.runtime-input-dialog .p-dialog-footer { border-top: none; }
</style>
