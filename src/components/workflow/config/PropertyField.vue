<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent } from 'vue'
import { HelpCircle, Trash2, Settings, FileType, Search, LoaderCircle } from 'lucide-vue-next'
import { type NodeProperty } from '@/nodes/types'
import { useWorkflowStore } from '@/stores/workflowStore'
import { FilterService } from '@primevue/core/api'

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

const MonacoEditor = defineAsyncComponent(() => import('../MonacoEditor.vue'))

const REGEX_FILTER_MODE = 'custom_regex'
const primeFilterService = FilterService as typeof FilterService & {
  filters: Record<string, unknown>
  register: (rule: string, fn: (value: unknown, filter: unknown) => boolean) => void
}

if (!(REGEX_FILTER_MODE in primeFilterService.filters)) {
  primeFilterService.register(REGEX_FILTER_MODE, (value: unknown, filter: unknown) => {
    if (filter === undefined || filter === null || filter === '') {
      return true
    }
    if (value === undefined || value === null) {
      return false
    }

    try {
      return new RegExp(String(filter), 'i').test(String(value))
    } catch {
      return false
    }
  })
}

defineOptions({
  name: 'PropertyField',
})

const props = defineProps<{
  prop: NodeProperty
  modelValue: any
  upstreamFactors: Array<{
    name: string
    value: string
    dataType?: string
    nullable?: boolean
  }>
  configContext?: Record<string, any>
  nodeId?: string | null
  inputData?: unknown
}>()

const emit = defineEmits(['update:modelValue', 'save'])
const store = useWorkflowStore()
const autoCompleteRef = ref<any>(null)
const filteredFactors = ref<string[]>([])
const treeFilterQuery = ref('')
const optionsRegexEnabled = ref(false)
const optionsFilterQuery = ref('')
const multiOptionsRegexEnabled = ref(false)
const multiOptionsFilterQuery = ref('')
const remoteOptions = ref<any[]>([])
const isOptionsLoading = ref(false)
const optionsError = ref('')
const multiOptionsFilterError = ref('')

const configValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const isHeroSelectButton = computed(
  () => props.prop.type === 'select-button' && props.prop.name === 'fetchMode',
)

const dependencyKey = computed(() =>
  JSON.stringify({
    dependencies: (props.prop.dependencies || []).map((key) => props.configContext?.[key] ?? null),
    nodeId: props.nodeId ?? null,
    inputData: props.inputData ?? null,
  }),
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
        nodeId: props.nodeId,
        inputData: props.inputData,
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

const requiresNumericAnalysisField = computed(() =>
  ['xFields', 'yFields', 'targetField', 'factorNames'].includes(props.prop.name),
)

const normalizedOptionSource = computed(() => {
  const rawOptions = Array.isArray(optionSource.value) ? optionSource.value : []
  return rawOptions.map((option) => {
    if (!option || typeof option !== 'object') return option

    const normalizedOption = { ...(option as Record<string, any>) }
    if (
      requiresNumericAnalysisField.value &&
      props.prop.useUpstreamFactors &&
      normalizedOption.dataType &&
      normalizedOption.dataType !== 'number'
    ) {
      normalizedOption.disabled = true
      normalizedOption.hint = normalizedOption.hint || '仅支持数值字段参与当前分析'
    }

    return normalizedOption
  })
})

const normalizedMultiOptionsSource = computed(() => {
  const baseOptions = Array.isArray(normalizedOptionSource.value) ? [...normalizedOptionSource.value] : []
  const selectedValues = Array.isArray(configValue.value) ? configValue.value : []
  const existingValues = new Set(
    baseOptions.map((option) =>
      option && typeof option === 'object' && 'value' in option ? option.value : option,
    ),
  )

  selectedValues.forEach((value) => {
    if (existingValues.has(value)) return
    baseOptions.push({
      name: String(value),
      value,
    })
    existingValues.add(value)
  })

  return baseOptions
})

const nonAnalyzableUpstreamFactors = computed(() => {
  if (!requiresNumericAnalysisField.value || !props.prop.useUpstreamFactors) return []

  return normalizedOptionSource.value.filter(
    (option) =>
      option &&
      typeof option === 'object' &&
      'disabled' in option &&
      Boolean((option as Record<string, any>).disabled),
  ) as Array<Record<string, any>>
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

const reopenAutoComplete = (delay = 0) => {
  window.setTimeout(() => autoCompleteRef.value?.show?.(), delay)
}

const onTagsFocus = (event: Event) => {
  if (!(event.target instanceof HTMLInputElement)) return
  if (props.prop.useUpstreamFactors && props.upstreamFactors.length > 0) {
    searchFactors({ query: event.target.value || '' })
    reopenAutoComplete(50)
  }
}

const onTagsEnter = (event: KeyboardEvent) => {
  const target = event.target as HTMLInputElement | null
  const value = target?.value?.trim()
  if (!value) return
  const nextTags = Array.isArray(configValue.value) ? [...configValue.value] : []
  if (!nextTags.includes(value)) {
    nextTags.push(value)
    configValue.value = nextTags
  }
  if (target) target.value = ''
  event.preventDefault()
  searchFactors({ query: '' })
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

const confirmEditableMultiOption = (event?: KeyboardEvent) => {
  const target = event?.target as HTMLInputElement | null
  const value = (target?.value ?? multiOptionsFilterQuery.value).trim()
  if (!value) return

  const nextValues = Array.isArray(configValue.value) ? [...configValue.value] : []
  if (!nextValues.includes(value)) {
    nextValues.push(value)
    configValue.value = nextValues
  }

  multiOptionsFilterQuery.value = ''
  multiOptionsFilterError.value = ''
  if (target) target.value = ''
  event?.preventDefault()
}

const updateRegexError = (query: string, enabled: boolean, setter: (value: string) => void) => {
  if (!enabled || !query.trim()) {
    setter('')
    return
  }

  try {
    void new RegExp(query, 'i')
    setter('')
  } catch {
    setter('正则表达式无效，请检查输入格式')
  }
}

const onOptionsFilterInput = (event: Event) => {
  const value = (event.target as HTMLInputElement | null)?.value ?? ''
  optionsFilterQuery.value = value
  updateRegexError(value, optionsRegexEnabled.value, (next) => {
    optionsError.value = next
  })
}

const onMultiOptionsFilterInput = (event: Event) => {
  const value = (event.target as HTMLInputElement | null)?.value ?? ''
  multiOptionsFilterQuery.value = value
  updateRegexError(value, multiOptionsRegexEnabled.value, (next) => {
    multiOptionsFilterError.value = next
  })
}

const optionsFilterInputProps = computed(() => {
  return {
    onInput: onOptionsFilterInput,
    'data-testid': 'options-filter-input',
  }
})

const multiOptionsFilterInputProps = computed(() => {
  return {
    onInput: onMultiOptionsFilterInput,
    'data-testid': 'multi-options-filter-input',
  }
})

const multiOptionsPassThrough = computed(() => ({
  pcFilter: {
    root: {
      onKeydown: (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          confirmEditableMultiOption(event)
        }
      },
    },
  },
}))

const optionFilterMatchMode = computed(() =>
  optionsRegexEnabled.value ? REGEX_FILTER_MODE : 'contains',
)

const multiOptionsFilterMatchMode = computed(() =>
  multiOptionsRegexEnabled.value ? REGEX_FILTER_MODE : 'contains',
)

const multiOptionsForceInputHint = computed(() => {
  if (multiOptionsFilterError.value) return multiOptionsFilterError.value
  if (!props.prop.forceInput) return undefined
  if (optionSource.value.length > 0) return undefined
  return '暂无可选项，可直接输入后按回车添加'
})

const showUpstreamEmptyHint = computed(() => {
  return (
    props.prop.useUpstreamFactors &&
    requiresNumericAnalysisField.value &&
    optionSource.value.length === 0
  )
})

const nonAnalyzableHintText = computed(() => {
  if (nonAnalyzableUpstreamFactors.value.length === 0) return ''
  return `以下字段暂不支持当前分析：${nonAnalyzableUpstreamFactors.value.map((item) => item.name).join('、')}`
})

const upstreamEmptyHintText = '当前没有可选字段，请先连接上游数据或使用左侧输入数据。'

const toggleOptionsRegexMode = (event?: Event) => {
  event?.preventDefault()
  event?.stopPropagation()
  optionsRegexEnabled.value = !optionsRegexEnabled.value
  updateRegexError(optionsFilterQuery.value, optionsRegexEnabled.value, (next) => {
    optionsError.value = next
  })
}

const toggleMultiOptionsRegexMode = (event?: Event) => {
  event?.preventDefault()
  event?.stopPropagation()
  multiOptionsRegexEnabled.value = !multiOptionsRegexEnabled.value
  updateRegexError(multiOptionsFilterQuery.value, multiOptionsRegexEnabled.value, (next) => {
    multiOptionsFilterError.value = next
  })
}

const getRegexToggleClass = (enabled: boolean) => [
  'flex',
  'h-6',
  'w-6',
  'items-center',
  'justify-center',
  'rounded-md',
  'border',
  'text-[10px]',
  'font-bold',
  'transition-all',
  enabled
    ? '!border-blue-300 !bg-blue-50 !text-blue-600 shadow-sm'
    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50',
]
</script>

<template>
  <div class="flex flex-col gap-3 shrink-0">
    <label v-if="prop.type !== 'collection' && !isHeroSelectButton" class="ndv-label shrink-0">
      {{ prop.displayName }}
      <span v-if="prop.required" class="ml-1 text-rose-500">*</span>
      <HelpCircle
        v-if="prop.description"
        v-tooltip.top="prop.description"
        :size="12"
        class="ml-1 cursor-help text-slate-300"
      />
    </label>

    <div v-if="prop.type === 'collection'" class="space-y-4">
      <div
        v-for="(item, idx) in configValue"
        :key="idx"
        class="group/item relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
      >
        <div class="mb-4 flex items-center justify-between border-b border-slate-50 pb-3">
          <div class="flex items-center gap-2">
            <div
              class="flex h-6 w-6 items-center justify-center rounded bg-slate-50 text-slate-400 group-hover/item:bg-blue-50 group-hover/item:text-blue-500"
            >
              <Settings :size="12" />
            </div>
            <span
              class="text-[10px] font-bold uppercase tracking-wider text-slate-500 group-hover/item:text-blue-600"
            >
              {{ prop.displayName }} #{{ Number(idx) + 1 }}
            </span>
          </div>
          <button
            class="cursor-pointer rounded-md p-1.5 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500"
            @click="removeCollectionItem(Number(idx))"
          >
            <Trash2 :size="14" />
          </button>
        </div>

        <div class="space-y-5">
          <PropertyField
            v-for="subProp in prop.properties"
            :key="subProp.name"
            :prop="subProp"
            :model-value="item[subProp.name]"
            :upstream-factors="upstreamFactors"
            :config-context="item"
            :node-id="nodeId"
            :input-data="inputData"
            @update:model-value="(val) => updateSubItem(Number(idx), subProp.name, val)"
            @save="emit('save')"
          />
        </div>
      </div>

      <Button
        outlined
        :label="`添加${prop.displayName}`"
        icon="pi pi-plus"
        class="w-full !border-2 !border-dashed !border-slate-300 !bg-white py-3 text-[12px] font-bold !text-slate-600 shadow-sm hover:!border-blue-400 hover:!bg-blue-50 hover:!text-blue-600 active:scale-[0.98]"
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
      :options="normalizedOptionSource"
      option-label="name"
      option-value="value"
      option-disabled="disabled"
      :filter="true"
      :filter-match-mode="optionFilterMatchMode"
      :filter-input-props="optionsFilterInputProps"
      :editable="prop.editable"
      :empty-filter-message="optionsError || undefined"
      :placeholder="prop.placeholder"
      class="w-full ndv-input"
    >
      <template v-if="prop.allowRegexSearch" #filtericon>
        <button
          type="button"
          data-testid="options-regex-toggle"
          :class="getRegexToggleClass(optionsRegexEnabled)"
          @mousedown.prevent
          @click="toggleOptionsRegexMode"
        >
          .*
        </button>
      </template>
    </Select>

    <MultiSelect
      v-else-if="prop.type === 'multi-options'"
      v-model="configValue"
      :options="normalizedMultiOptionsSource"
      option-label="name"
      option-value="value"
      option-disabled="disabled"
      :filter="true"
      :filter-match-mode="multiOptionsFilterMatchMode"
      :filter-input-props="multiOptionsFilterInputProps"
      :empty-filter-message="multiOptionsForceInputHint"
      :empty-message="multiOptionsForceInputHint"
      :pt="multiOptionsPassThrough"
      display="chip"
      :placeholder="prop.placeholder"
      class="w-full text-xs ndv-input ndv-multi-options"
    >
      <template v-if="prop.allowRegexSearch" #filtericon>
        <button
          type="button"
          data-testid="multi-options-regex-toggle"
          :class="getRegexToggleClass(multiOptionsRegexEnabled)"
          @mousedown.prevent
          @click="toggleMultiOptionsRegexMode"
        >
          .*
        </button>
      </template>
    </MultiSelect>

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
      :rows="8"
      class="w-full ndv-input max-h-[240px] overflow-y-auto custom-textarea"
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
          class:
            'rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600 gap-1.5',
        },
        tokenLabel: { class: 'text-[11px]' },
        removeTokenIcon: { class: 'text-[10px] hover:text-rose-500' },
      }"
      @complete="searchFactors"
      @focus="onTagsFocus"
      @item-select="() => reopenAutoComplete()"
      @keydown.enter="onTagsEnter"
    />

    <MonacoEditor
      v-else-if="prop.type === 'json'"
      v-model="configValue"
      :height="prop.editorHeight || '400px'"
      :language="prop.editorLanguage || 'json'"
      :declarations="prop.editorDeclarations"
    />

    <ToggleSwitch v-else-if="prop.type === 'boolean'" v-model="configValue" />

    <div
      v-else-if="prop.type === 'tree'"
      class="rounded-xl border border-slate-200 bg-white p-0 shadow-sm overflow-hidden"
    >
      <div v-if="prop.filterable" class="relative border-b border-slate-100 p-2 bg-slate-50/50">
        <Search
          :size="14"
          class="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <InputText
          v-model="treeFilterQuery"
          class="w-full !border-slate-200 !bg-white !rounded-lg !pl-9 !text-xs !h-9"
          :placeholder="prop.placeholder || '搜索...'"
        />
      </div>

      <div class="p-2">
        <div
          v-if="isOptionsLoading"
          class="flex items-center justify-center gap-2 py-8 text-xs text-slate-400"
        >
          <LoaderCircle :size="16" class="animate-spin text-blue-500" /> 加载中...
        </div>
        <div
          v-else-if="optionsError"
          class="rounded-lg border border-rose-100 bg-rose-50 p-4 text-xs text-rose-500 text-center"
        >
          {{ optionsError }}
        </div>
        <div
          v-else-if="filteredTreeOptions.length === 0"
          class="py-12 text-center text-xs text-slate-300 italic"
        >
          {{ prop.emptyMessage || '暂无数据' }}
        </div>
        <Tree
          v-else
          v-model:selection-keys="configValue"
          :value="filteredTreeOptions"
          selection-mode="checkbox"
          class="ndv-tree max-h-[360px] overflow-auto"
          :pt="{
            root: { class: 'p-0' },
            node: { class: 'p-0' },
            content: { class: 'p-1 hover:bg-blue-50/50 rounded-lg transition-colors' },
            label: { class: 'text-[12px] text-slate-600 font-medium' },
            checkbox: { class: 'mr-2' },
          }"
        />
      </div>
    </div>

    <DatePicker
      v-else-if="prop.type === 'datetime-range'"
      v-model="configValue"
      selection-mode="range"
      :show-time="!prop.dateOnly"
      :manual-input="false"
      date-format="yy-mm-dd"
      class="w-full ndv-datepicker"
      :pt="{
        input: { class: 'w-full ndv-input text-xs' },
      }"
    />

    <div v-else-if="prop.type === 'select-button'" class="space-y-3">
      <div
        v-if="isHeroSelectButton"
        class="select-button-hero rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)]"
      >
        <div class="flex items-center gap-2">
          <span class="select-button-hero__eyebrow">查询策略</span>
          <div class="text-[15px] font-semibold tracking-[0.01em] text-slate-900">
            {{ prop.displayName }}
          </div>
          <span v-if="prop.required" class="text-[12px] font-semibold text-rose-500">*</span>
        </div>

        <div class="mt-3 rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] p-2">
          <SelectButton
            v-model="configValue"
            :options="optionSource"
            option-label="name"
            option-value="value"
            class="w-full select-button-custom select-button-custom--hero"
          />
        </div>
      </div>

      <SelectButton
        v-else
        v-model="configValue"
        :options="optionSource"
        option-label="name"
        option-value="value"
        class="w-full select-button-custom"
      />
    </div>

    <div v-if="nonAnalyzableUpstreamFactors.length > 0 || showUpstreamEmptyHint" class="flex flex-wrap items-center gap-2">
      <div
        v-if="nonAnalyzableUpstreamFactors.length > 0"
        v-tooltip.top="nonAnalyzableHintText"
        class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700"
      >
        <HelpCircle :size="12" />
        <span>字段受限</span>
      </div>

      <div
        v-if="showUpstreamEmptyHint"
        v-tooltip.top="upstreamEmptyHintText"
        class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700"
      >
        <HelpCircle :size="12" />
        <span>缺少上游</span>
      </div>
    </div>
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

:deep(.ndv-multi-options) {
  min-height: 42px;
}

:deep(.ndv-multi-options .p-multiselect-label-container) {
  min-height: 42px;
  display: flex;
  align-items: center;
}

:deep(.ndv-multi-options .p-multiselect-label) {
  min-height: 42px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  font-size: 12px;
}

:deep(.ndv-multi-options .p-multiselect-dropdown) {
  width: 42px;
}

.custom-textarea::-webkit-scrollbar {
  width: 4px;
}
.custom-textarea::-webkit-scrollbar-track {
  background: transparent;
}
.custom-textarea::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
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

.select-button-hero {
  position: relative;
  overflow: hidden;
}

.select-button-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 38%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.02), transparent 50%);
  pointer-events: none;
}

.select-button-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(248, 250, 252, 0.9);
  padding: 0.2rem 0.5rem;
  color: #2563eb;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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

:deep(.select-button-custom--hero) {
  gap: 8px;
  background: transparent;
  padding: 0;
}

:deep(.select-button-custom--hero .p-togglebutton) {
  min-height: 58px;
  border: 1px solid rgba(148, 163, 184, 0.28) !important;
  background: rgba(255, 255, 255, 0.92) !important;
  color: #475569 !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  letter-spacing: 0.01em;
  border-radius: 16px !important;
  box-shadow: 0 12px 24px -24px rgba(15, 23, 42, 0.55);
}

:deep(.select-button-custom--hero .p-togglebutton:hover) {
  border-color: rgba(37, 99, 235, 0.24) !important;
  background: rgba(255, 255, 255, 1) !important;
  color: #0f172a !important;
}

:deep(.select-button-custom--hero .p-togglebutton.p-togglebutton-selected) {
  border-color: rgba(37, 99, 235, 0.4) !important;
  background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%) !important;
  color: #0f172a !important;
  box-shadow:
    0 18px 32px -24px rgba(37, 99, 235, 0.65),
    inset 0 0 0 1px rgba(37, 99, 235, 0.1) !important;
}
</style>
