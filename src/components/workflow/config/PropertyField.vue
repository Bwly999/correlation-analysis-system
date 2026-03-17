<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { HelpCircle, Trash2, Settings, FileType, Search, LoaderCircle } from 'lucide-vue-next'
import { type NodeProperty } from '@/nodes/types'
import { useWorkflowStore } from '@/stores/workflowStore'
import MonacoEditor from '../MonacoEditor.vue'

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
import Textarea from 'primevue/textarea'

defineOptions({
  name: 'PropertyField',
})

const props = defineProps<{
  prop: NodeProperty
  modelValue: any
  upstreamFactors: Array<{ name: string; value: string }>
  configContext?: Record<string, any>
}>()

const emit = defineEmits(['update:modelValue', 'save'])
const store = useWorkflowStore()
const autoCompleteRef = ref<any>(null)
const filteredFactors = ref<string[]>([])
const treeFilterQuery = ref('')
const remoteOptions = ref<any[]>([])
const isOptionsLoading = ref(false)
const optionsError = ref('')

const configValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const dependencyKey = computed(() =>
  JSON.stringify((props.prop.dependencies || []).map((key) => props.configContext?.[key] ?? null)),
)

const loadOptions = async () => {
  if (!props.prop.resolveOptions) {
    remoteOptions.value = props.prop.options || []
    optionsError.value = ''
    return
  }

  isOptionsLoading.value = true
  optionsError.value = ''
  try {
    remoteOptions.value =
      (await props.prop.resolveOptions({
        config: props.configContext || {},
        property: props.prop,
      })) || []
  } catch (error: any) {
    remoteOptions.value = []
    optionsError.value = error?.message || '选项加载失败'
  } finally {
    isOptionsLoading.value = false
  }
}

watch(
  () => [props.prop.name, dependencyKey.value],
  () => {
    void loadOptions()
  },
  { immediate: true },
)

const optionSource = computed(() => {
  if (props.prop.useUpstreamFactors) return props.upstreamFactors
  if (props.prop.resolveOptions) return remoteOptions.value
  return props.prop.options || []
})

const searchFactors = (event: any) => {
  const query = String(event.query || '').toLowerCase()
  filteredFactors.value = props.upstreamFactors
    .filter((factor) => factor.name.toLowerCase().includes(query))
    .map((factor) => factor.name)
}

const addCollectionItem = () => {
  const newValue = [...(props.modelValue || [])]
  const newItem: Record<string, any> = {}
  props.prop.properties?.forEach((property) => {
    newItem[property.name] = property.default
  })
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

const onFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('update:modelValue', file)
    store.addLog(`已选择文件: ${file.name}`, 'info')
  }
  target.value = ''
}

const filterTreeNodes = (nodes: any[], query: string): any[] => {
  if (!query.trim()) return nodes

  const normalizedQuery = query.trim().toLowerCase()

  return nodes
    .map((node) => {
      const searchText = String(node.data?.searchText || node.label || '').toLowerCase()
      const matchedChildren = filterTreeNodes(node.children || [], query)
      if (searchText.includes(normalizedQuery) || matchedChildren.length > 0) {
        return {
          ...node,
          children: matchedChildren,
        }
      }
      return null
    })
    .filter(Boolean)
}

const filteredTreeOptions = computed(() =>
  filterTreeNodes(optionSource.value, treeFilterQuery.value),
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <label v-if="prop.type !== 'collection'" class="ndv-label">
      {{ prop.displayName }}
      <HelpCircle
        v-if="prop.description"
        v-tooltip.top="prop.description"
        :size="12"
        class="ml-1 cursor-help text-slate-300"
      />
    </label>

    <div v-if="prop.type === 'collection'" class="space-y-6">
      <div
        v-for="(item, idx) in configValue"
        :key="idx"
        class="group/item relative rounded-2xl border border-slate-200 bg-[#fcfcfd] p-6 shadow-sm transition-all hover:border-blue-300"
      >
        <div class="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <span
            class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600"
          >
            <Settings :size="12" /> 配置项 #{{ idx + 1 }}
          </span>
          <button
            class="cursor-pointer rounded-lg p-1.5 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500"
            @click="removeCollectionItem(idx)"
          >
            <Trash2 :size="14" />
          </button>
        </div>

        <div class="space-y-6">
          <PropertyField
            v-for="subProp in prop.properties"
            :key="subProp.name"
            :prop="subProp"
            :model-value="item[subProp.name]"
            :upstream-factors="upstreamFactors"
            :config-context="item"
            @update:model-value="(val) => updateSubItem(idx, subProp.name, val)"
            @save="emit('save')"
          />
        </div>
      </div>

      <Button
        :label="`新增${prop.displayName}`"
        icon="pi pi-plus"
        class="w-full cursor-pointer rounded-2xl border-none py-4 text-[12px] font-bold tracking-wide !text-white shadow-xl shadow-slate-200 transition-all hover:shadow-slate-300 active:scale-[0.97] !bg-slate-900 hover:!bg-slate-800"
        @click="addCollectionItem"
      />
    </div>

    <div v-else-if="prop.type === 'file'" class="space-y-2">
      <label
        class="flex h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white transition-all hover:border-blue-400 hover:bg-blue-50/30"
        @dragover.prevent
        @drop.prevent="
          (event) => {
            const file = event.dataTransfer?.files[0]
            if (file) {
              emit('update:modelValue', file)
              store.addLog(`已选择文件: ${file.name}`, 'info')
            }
          }
        "
      >
        <input type="file" class="hidden" @change="onFileSelect" />
        <FileType
          :size="20"
          class="mb-1"
          :class="modelValue ? 'text-emerald-500' : 'text-slate-300'"
        />
        <span class="w-full truncate px-2 text-center text-[10px] font-bold text-slate-400">
          {{ modelValue ? modelValue.name : '点击或拖拽上传文件' }}
        </span>
      </label>
    </div>

    <Select
      v-else-if="prop.type === 'options'"
      v-model="configValue"
      :options="optionSource"
      option-label="name"
      option-value="value"
      :editable="prop.editable"
      :placeholder="prop.placeholder"
      class="w-full ndv-input"
    />

    <MultiSelect
      v-else-if="prop.type === 'multi-options'"
      v-model="configValue"
      :options="optionSource"
      option-label="name"
      option-value="value"
      display="chip"
      :placeholder="prop.placeholder"
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

    <Textarea
      v-else-if="prop.type === 'textarea'"
      v-model="configValue"
      auto-resize
      :rows="5"
      class="w-full ndv-input"
      :placeholder="prop.placeholder"
    />

    <AutoComplete
      v-else-if="prop.type === 'tags'"
      ref="autoCompleteRef"
      v-model="configValue"
      multiple
      :suggestions="filteredFactors"
      class="w-full"
      :placeholder="prop.placeholder"
      :dropdown="prop.useUpstreamFactors && !!upstreamFactors.length"
      :min-query-length="0"
      :empty-message="null"
      :pt="{
        root: { class: 'w-full' },
        input: { class: 'w-full ndv-input text-xs min-h-[42px] p-autocomplete-input' },
        token: {
          class: 'rounded-lg border border-blue-100 bg-blue-50 px-2 py-0.5 font-bold text-blue-700',
        },
      }"
      @complete="searchFactors"
      @focus="
        (event) => {
          if (prop.useUpstreamFactors && upstreamFactors.length > 0) {
            searchFactors({ query: (event.target as HTMLInputElement).value || '' })
            window.setTimeout(() => autoCompleteRef?.show(), 50)
          }
        }
      "
      @item-select="() => window.setTimeout(() => autoCompleteRef?.show(), 0)"
      @keydown.enter="
        (event) => {
          const target = event.target as HTMLInputElement
          const value = target.value?.trim()
          if (!value) return
          const nextTags = Array.isArray(configValue) ? [...configValue] : []
          if (!nextTags.includes(value)) {
            nextTags.push(value)
            configValue = nextTags
          }
          target.value = ''
          event.preventDefault()
          searchFactors({ query: '' })
        }
      "
    />

    <MonacoEditor v-else-if="prop.type === 'json'" v-model="configValue" height="400px" />

    <ToggleSwitch v-else-if="prop.type === 'boolean'" v-model="configValue" />

    <div
      v-else-if="prop.type === 'tree'"
      class="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner"
    >
      <div v-if="prop.filterable" class="relative mb-3">
        <Search
          :size="14"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <InputText
          v-model="treeFilterQuery"
          class="w-full ndv-input pl-9"
          :placeholder="prop.placeholder || '搜索节点'"
        />
      </div>

      <div
        v-if="isOptionsLoading"
        class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-500"
      >
        <LoaderCircle :size="14" class="animate-spin text-blue-500" /> 正在加载选项...
      </div>
      <div
        v-else-if="optionsError"
        class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600"
      >
        {{ optionsError }}
      </div>
      <div
        v-else-if="filteredTreeOptions.length === 0"
        class="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400"
      >
        {{ prop.emptyMessage || '暂无可选项' }}
      </div>
      <Tree
        v-else
        v-model:selection-keys="configValue"
        :value="filteredTreeOptions"
        selection-mode="checkbox"
        class="ndv-tree max-h-[320px] overflow-auto"
      />
    </div>

    <DatePicker
      v-else-if="prop.type === 'datetime-range'"
      v-model="configValue"
      selection-mode="range"
      :show-time="!prop.dateOnly"
      :manual-input="false"
      date-format="yy-mm-dd"
      class="w-full"
    />

    <SelectButton
      v-else-if="prop.type === 'select-button'"
      v-model="configValue"
      :options="optionSource"
      option-label="name"
      option-value="value"
      class="w-full select-button-custom"
    />
  </div>
</template>

<style scoped>
.ndv-label {
  display: flex;
  align-items: center;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.ndv-input {
  border-color: #e2e8f0 !important;
  background-color: #ffffff !important;
  border-radius: 12px !important;
}

.ndv-tree {
  background: transparent !important;
  border: none !important;
  font-size: 12px;
}

:deep(.select-button-custom) {
  display: flex;
  gap: 4px;
  border-radius: 12px;
  background: #f1f5f9;
  padding: 4px;
}

:deep(.select-button-custom .p-togglebutton) {
  flex: 1;
  border: none !important;
  background: transparent !important;
  color: #64748b !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  border-radius: 10px !important;
  padding: 9px 6px !important;
  transition: all 0.2s ease !important;
}

:deep(.select-button-custom .p-togglebutton.p-togglebutton-selected) {
  background: white !important;
  color: #0f172a !important;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08) !important;
}

:deep(.select-button-custom .p-togglebutton::before) {
  display: none !important;
}
</style>
