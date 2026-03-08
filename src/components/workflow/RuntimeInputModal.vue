<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Play, FileType, Info, HelpCircle, RefreshCw } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import DatePicker from 'primevue/datepicker'
import MonacoEditor from './MonacoEditor.vue'
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflowStore'
import { getNodeDefinition } from '@/nodes/registry'

const props = defineProps<{
  visible: boolean
  node: WorkflowNode | null
}>()

const emit = defineEmits(['close', 'confirm'])
const store = useWorkflowStore()
const config = ref<any>({})
const isDragging = ref<Record<string, boolean>>({})

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

const handleFile = (file: File, propName: string) => {
  if (file) {
    config.value[propName] = file
  }
}

const onFileSelect = (event: any, propName: string) => {
  const file = event.target.files[0]
  handleFile(file, propName)
  event.target.value = ''
}

const onDrop = (event: DragEvent, propName: string) => {
  event.preventDefault()
  isDragging.value[propName] = false
  const file = event.dataTransfer?.files[0]
  if (file) handleFile(file, propName)
}

const onDragOver = (event: DragEvent, propName: string) => {
  event.preventDefault()
  isDragging.value[propName] = true
}

const onDragLeave = (event: DragEvent, propName: string) => {
  isDragging.value[propName] = false
}

const handleConfirm = () => {
  if (props.node) {
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
      <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex gap-3 shadow-sm">
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
        <MonacoEditor v-else-if="prop.type === 'json'" v-model="config[prop.name]" height="200px" />
        
        <div v-else-if="prop.type === 'file'" class="space-y-2">
           <label 
             class="flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-all cursor-pointer group relative overflow-hidden"
             :class="[
               isDragging[prop.name] ? 'bg-indigo-100 border-indigo-500 scale-[1.02]' : 
               (config[prop.name] ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 py-6' : 'bg-slate-50 border-slate-200 hover:border-indigo-400 p-8')
             ]"
             @dragover="onDragOver($event, prop.name)"
             @dragleave="onDragLeave($event, prop.name)"
             @drop="onDrop($event, prop.name)"
           >
              <input type="file" class="hidden" @change="onFileSelect($event, prop.name)" />
              
              <template v-if="config[prop.name] && !isDragging[prop.name]">
                 <FileType size="24" class="text-emerald-600 mb-2" />
                 <span class="text-[11px] font-bold text-emerald-800 truncate px-4 w-full text-center">{{ config[prop.name].name }}</span>
                 <span class="mt-2 text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1 opacity-60 group-hover:opacity-100">
                    <RefreshCw size="10" /> Click to replace
                 </span>
              </template>

              <template v-else>
                 <FileType size="24" :class="[isDragging[prop.name] ? 'text-indigo-600' : 'text-slate-300 group-hover:text-indigo-400']" class="mb-2" />
                 <span class="text-[10px] font-bold uppercase" :class="[isDragging[prop.name] ? 'text-indigo-700' : 'text-slate-400 group-hover:text-indigo-500']">
                   {{ isDragging[prop.name] ? 'Drop file' : 'Select file or drop' }}
                 </span>
              </template>
           </label>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2 w-full">
        <Button label="取消" severity="secondary" text @click="emit('close')" class="flex-1 cursor-pointer" />
        <Button label="确认并启动" severity="primary" @click="handleConfirm" class="flex-1 cursor-pointer" />
      </div>
    </template>
  </Dialog>
</template>

<style>
.runtime-input-dialog .p-dialog-header { border-bottom: none; padding-bottom: 0; }
.runtime-input-dialog .p-dialog-footer { border-top: none; }
</style>
