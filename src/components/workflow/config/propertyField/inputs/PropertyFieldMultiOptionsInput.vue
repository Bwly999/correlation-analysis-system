<script setup lang="ts">
import { computed } from 'vue'
import MultiSelect from 'primevue/multiselect'
import type { NodeProperty } from '@/nodes/types'
import { useRegexFilter } from '../useRegexFilter'

const props = defineProps<{
  modelValue: unknown
  prop: NodeProperty
  options: any[]
  sourceOptionCount: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

interface MultiSelectFilterEvent {
  value?: string
}

interface MultiSelectAllChangeEvent {
  checked: boolean
}

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const selectedValues = computed(() =>
  Array.isArray(configValue.value) ? configValue.value.filter((value): value is string => typeof value === 'string') : [],
)

const getOptionLabel = (option: any) => String(option?.name ?? option?.label ?? option?.value ?? option ?? '')
const getOptionValue = (option: any) => String(option?.value ?? option)
const isOptionDisabled = (option: any) => Boolean(option?.disabled)

const matchesCurrentFilter = (option: any) => {
  const normalizedQuery = query.value.trim()
  if (!normalizedQuery) return true

  const label = getOptionLabel(option)
  if (enabled.value) {
    try {
      return new RegExp(normalizedQuery, 'i').test(label)
    } catch {
      return false
    }
  }

  return label.toLowerCase().includes(normalizedQuery.toLowerCase())
}

const visibleSelectableOptionValues = computed(() =>
  props.options
    .filter((option) => !isOptionDisabled(option) && matchesCurrentFilter(option))
    .map((option) => getOptionValue(option)),
)

const isAllVisibleSelected = computed(() =>
  visibleSelectableOptionValues.value.length > 0
  && visibleSelectableOptionValues.value.every((value) => selectedValues.value.includes(value)),
)

const confirmEditableMultiOption = (event?: KeyboardEvent) => {
  const target = event?.target as HTMLInputElement | null
  const value = (target?.value ?? query.value).trim()
  if (!value) return

  const nextValues = Array.isArray(configValue.value) ? [...configValue.value] : []
  if (!nextValues.includes(value)) {
    nextValues.push(value)
    configValue.value = nextValues
  }

  clearQuery()
  if (target) target.value = ''
  event?.preventDefault()
}

const {
  query,
  enabled,
  errorMessage,
  filterMatchMode,
  filterInputProps,
  passThrough,
  clearQuery,
  setQuery,
  toggleRegexMode,
  getToggleClass,
} = useRegexFilter({
  inputTestId: 'multi-options-filter-input',
  onEnter: confirmEditableMultiOption,
  defaultEnabled: false,
})

const multiOptionsForceInputHint = computed(() => {
  if (errorMessage.value) return errorMessage.value
  if (!props.prop.forceInput) return undefined
  if (props.sourceOptionCount > 0) return undefined
  return '暂无可选项，可直接输入后按回车添加'
})

const handleFilter = (event: MultiSelectFilterEvent) => {
  setQuery(event.value ?? '')
}

const handleSelectAllChange = (event: MultiSelectAllChangeEvent) => {
  const visibleValues = visibleSelectableOptionValues.value
  if (visibleValues.length === 0) return

  if (event.checked) {
    const nextValues = [...selectedValues.value]
    visibleValues.forEach((value) => {
      if (!nextValues.includes(value)) {
        nextValues.push(value)
      }
    })
    configValue.value = nextValues
    return
  }

  const visibleValueSet = new Set(visibleValues)
  configValue.value = selectedValues.value.filter((value) => !visibleValueSet.has(value))
}
</script>

<template>
  <MultiSelect
    v-model="configValue"
    :options="options"
    option-label="name"
    option-value="value"
    option-disabled="disabled"
    :filter="true"
    :filter-match-mode="filterMatchMode"
    :filter-input-props="filterInputProps"
    :empty-filter-message="multiOptionsForceInputHint"
    :empty-message="multiOptionsForceInputHint"
    :pt="passThrough"
    :select-all="isAllVisibleSelected"
    display="chip"
    :placeholder="prop.placeholder"
    class="w-full ndv-input ndv-multi-options"
    @filter="handleFilter"
    @selectall-change="handleSelectAllChange"
  >
    <template v-if="prop.allowRegexSearch !== false" #filtericon>
      <button
        type="button"
        data-testid="multi-options-regex-toggle"
        :class="getToggleClass(enabled)"
        @mousedown.prevent
        @click="toggleRegexMode"
      >
        .*
      </button>
    </template>
  </MultiSelect>
</template>

<style scoped>
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
}

:deep(.ndv-multi-options .p-multiselect-dropdown) {
  width: 42px;
}
</style>
