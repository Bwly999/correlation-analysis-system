<script setup lang="ts">
import { ref, computed } from 'vue'
import { HelpCircle, Trash2, Settings, FileType } from 'lucide-vue-next'
import { type NodeProperty } from '@/nodes/types'
import { useWorkflowStore } from '@/stores/workflowStore'
import MonacoEditor from '../MonacoEditor.vue'

// PrimeVue Components
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import AutoComplete from 'primevue/autocomplete'
import Tree from 'primevue/tree'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'

const props = defineProps<{
  prop: NodeProperty
  modelValue: any
  upstreamFactors: Array<{ name: string; value: string }>
}>()

const emit = defineEmits(['update:modelValue', 'save'])
const store = useWorkflowStore()

const configValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

// AutoComplete 逻辑
const filteredFactors = ref<string[]>([])
const searchFactors = (event: any) => {
  const query = event.query.toLowerCase()
  filteredFactors.value = props.upstreamFactors
    .filter((f) => f.name.toLowerCase().includes(query))
    .map((f) => f.name)
}

// Collection 操作
const addCollectionItem = () => {
  const newValue = [...(props.modelValue || [])]
  const newItem: any = {}
  props.prop.properties?.forEach((p) => (newItem[p.name] = p.default))
  newValue.push(newItem)
  emit('update:modelValue', newValue)
}

const removeCollectionItem = (index: number) => {
  const newValue = [...(props.modelValue || [])]
  newValue.splice(index, 1)
  emit('update:modelValue', newValue)
}

const updateSubItem = (index: number, subPropName: string, val: any) => {
  const newValue = [...(props.modelValue || [])]
  newValue[index] = { ...newValue[index], [subPropName]: val }
  emit('update:modelValue', newValue)
}

const onFileSelect = (event: any) => {
  const file = event.target.files[0]
  if (file) {
    emit('update:modelValue', file)
    store.addLog(`已选择文件: ${file.name}`, 'info')
  }
  event.target.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 字段标签 -->
    <label v-if="prop.type !== 'collection'" class="ndv-label">
      {{ prop.displayName }}
      <HelpCircle
        v-if="prop.description"
        v-tooltip.top="prop.description"
        size="12"
        class="text-slate-300 ml-1 cursor-help"
      />
    </label>

    <!-- Collection 类型 (递归渲染) -->
    <div v-if="prop.type === 'collection'" class="space-y-6">
      <div
        v-for="(item, idx) in configValue"
        :key="idx"
        class="p-6 bg-[#fcfcfd] border border-slate-200 rounded-2xl shadow-sm relative group/item hover:border-indigo-300 transition-all"
      >
        <div class="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
          <span
            class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest"
          >
            <Settings size="12" /> 配置组 #{{ idx + 1 }}
          </span>
          <button
            class="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
            @click="removeCollectionItem(idx)"
          >
            <Trash2 size="14" />
          </button>
        </div>

        <div class="space-y-6">
          <PropertyField
            v-for="subProp in prop.properties"
            :key="subProp.name"
            :prop="subProp"
            :model-value="item[subProp.name]"
            :upstream-factors="upstreamFactors"
            @update:model-value="(val) => updateSubItem(idx, subProp.name, val)"
            @save="emit('save')"
          />
        </div>
      </div>

      <Button
        :label="`添加${prop.displayName}`"
        icon="pi pi-plus"
        class="w-full !bg-slate-900 hover:!bg-slate-800 !border-none !ring-0 rounded-2xl py-4 transition-all font-sans font-bold text-[12px] uppercase tracking-wide !text-white shadow-xl shadow-slate-200 hover:shadow-slate-300 active:scale-[0.97] cursor-pointer"
        @click="addCollectionItem"
      />
    </div>

    <!-- 基础类型 -->
    <div v-else-if="prop.type === 'file'" class="space-y-2">
      <label
        class="flex flex-col items-center justify-center border-2 border-dashed rounded-xl h-24 transition-all cursor-pointer bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30"
        @dragover.prevent
        @drop.prevent="
          (e) => {
            const f = e.dataTransfer?.files[0]
            if (f) {
              emit('update:modelValue', f)
              store.addLog(`已选择文件: ${f.name}`, 'info')
            }
          }
        "
      >
        <input type="file" class="hidden" @change="onFileSelect" />
        <FileType
          size="20"
          :class="modelValue ? 'text-emerald-500' : 'text-slate-300'"
          class="mb-1"
        />
        <span
          class="text-[9px] font-bold text-slate-400 text-center px-2 uppercase truncate w-full"
        >
          {{ modelValue ? modelValue.name : '点击或拖拽上传' }}
        </span>
      </label>
    </div>

    <Select
      v-else-if="prop.type === 'options'"
      v-model="configValue"
      :options="
        prop.name === 'factorName' || prop.name === 'targetField' || !prop.options
          ? upstreamFactors
          : prop.options
      "
      option-label="name"
      option-value="value"
      class="w-full ndv-input"
    />

    <MultiSelect
      v-else-if="prop.type === 'multi-options'"
      v-model="configValue"
      :options="
        prop.name === 'factorName' || prop.name === 'targetField' || !prop.options
          ? upstreamFactors
          : prop.options
      "
      option-label="name"
      option-value="value"
      display="chip"
      class="w-full text-xs ndv-input"
    />

    <InputNumber
      v-else-if="prop.type === 'number'"
      v-model="configValue"
      class="w-full ndv-input"
    />

    <InputText
      v-else-if="prop.type === 'string'"
      v-model="configValue"
      class="w-full ndv-input"
      :placeholder="prop.placeholder"
    />

    <AutoComplete
      v-else-if="prop.type === 'tags'"
      v-model="configValue"
      multiple
      :suggestions="filteredFactors"
      class="w-full"
      :placeholder="prop.placeholder"
      :dropdown="!!upstreamFactors.length"
      :min-query-length="0"
      :empty-message="null"
      :pt="{
        root: { class: 'w-full' },
        input: { class: 'w-full ndv-input text-xs min-h-[42px] p-autocomplete-input' },
        token: {
          class:
            'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 rounded-lg py-0.5 px-2',
        },
      }"
      @complete="searchFactors"
      @focus="
        (e: any) => {
          if (upstreamFactors.length > 0) {
            searchFactors({ query: e.target.value || '' })
          }
        }
      "
      @keydown.enter="
        (e: any) => {
          const val = e.target.value?.trim()
          if (val) {
            let currentTags = Array.isArray(configValue) ? [...configValue] : []
            if (!currentTags.includes(val)) {
              currentTags.push(val)
              configValue = currentTags
            }
            e.target.value = ''
            e.preventDefault()
          }
        }
      "
    />

    <MonacoEditor v-else-if="prop.type === 'json'" v-model="configValue" height="400px" />

    <ToggleSwitch v-else-if="prop.type === 'boolean'" v-model="configValue" />

    <div
      v-else-if="prop.type === 'tree'"
      class="border rounded-lg bg-[#f8fafc] p-2 max-h-[300px] overflow-auto shadow-inner"
    >
      <Tree
        v-model:selection-keys="configValue"
        :value="prop.options"
        selection-mode="checkbox"
        class="ndv-tree"
      />
    </div>

    <DatePicker
      v-else-if="prop.type === 'datetime-range'"
      v-model="configValue"
      selection-mode="range"
      show-time
      class="w-full text-xs"
    />

    <SelectButton
      v-else-if="prop.type === 'select-button'"
      v-model="configValue"
      :options="prop.options"
      option-label="name"
      option-value="value"
      class="w-full select-button-custom"
    />
  </div>
</template>

<style scoped>
.ndv-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
}
.ndv-input {
  border-color: #e2e8f0 !important;
  background-color: #ffffff !important;
  border-radius: 8px !important;
}
.ndv-tree {
  background: transparent !important;
  border: none !important;
  font-size: 12px;
}

:deep(.select-button-custom) {
  display: flex;
  gap: 2px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 10px;
}
:deep(.select-button-custom .p-togglebutton) {
  flex: 1;
  border: none !important;
  background: transparent !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  border-radius: 7px !important;
  padding: 8px 4px !important;
  transition: all 0.2s ease !important;
}
:deep(.select-button-custom .p-togglebutton.p-togglebutton-selected) {
  background: white !important;
  color: #1e293b !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05) !important;
}
:deep(.select-button-custom .p-togglebutton::before) {
  display: none !important;
}
:deep(.select-button-custom .p-togglebutton:not(.p-togglebutton-selected):hover) {
  background: rgba(255, 255, 255, 0.5) !important;
  color: #475569 !important;
}
</style>
