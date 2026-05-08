<script setup lang="ts">
import { computed } from 'vue'
import MultiSelect from 'primevue/multiselect'
import { CircleX } from 'lucide-vue-next'
import { useRegexFilter } from '../config/propertyField/useRegexFilter'

type SelectOption = string | { value?: string; name?: string; label?: string }
type MultiSelectFilterEvent = { value?: string } | undefined

const props = withDefaults(defineProps<{
  modelValue: string[]
  options: SelectOption[]
  appendTo?: string | HTMLElement
  placeholder?: string
  maxSelectedLabels?: number
  selectClass?: string
  selectTestId?: string
  clearButtonTestId?: string
  allowRegexSearch?: boolean
}>(), {
  placeholder: '',
  maxSelectedLabels: 3,
  selectClass: '',
  selectTestId: 'search-append-multi-select',
  clearButtonTestId: 'search-append-multi-select-clear',
  allowRegexSearch: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const resolveOptionValue = (option: SelectOption) => {
  if (typeof option === 'string') return option
  return option.value ?? option.name ?? option.label ?? ''
}

const resolveOptionLabel = (option: SelectOption) => {
  if (typeof option === 'string') return option
  return option.name ?? option.label ?? option.value ?? ''
}

const {
  query,
  enabled,
  errorMessage,
  filterMatchMode,
  filterInputProps,
  passThrough,
  setQuery,
  toggleRegexMode,
  getToggleClass,
} = useRegexFilter({
  inputTestId: 'search-append-multi-select-filter-input',
  defaultEnabled: false,
})

const filteredOptionValues = computed(() => {
  const keyword = query.value.trim()
  if (!keyword) {
    return props.options
      .map(resolveOptionValue)
      .filter((value): value is string => Boolean(value))
  }

  return props.options
    .filter((option) => {
      const label = resolveOptionLabel(option)
      if (enabled.value) {
        try {
          return new RegExp(keyword, 'i').test(label)
        } catch {
          return false
        }
      }

      return label.toLowerCase().includes(keyword.toLowerCase())
    })
    .map(resolveOptionValue)
    .filter((value): value is string => Boolean(value))
})

const mergeSelectionOnFilteredSelectAll = (nextValues: string[]) => {
  if (!query.value.trim()) return nextValues
  if (nextValues.length === 0) return nextValues

  const filteredValues = filteredOptionValues.value
  const nextValueSet = new Set(nextValues)
  const filteredValueSet = new Set(filteredValues)
  const allFilteredSelected =
    filteredValues.length > 0
    && filteredValues.every((value) => nextValueSet.has(value))
    && nextValues.every((value) => filteredValueSet.has(value))

  if (!allFilteredSelected) return nextValues

  const merged = [...props.modelValue]
  nextValues.forEach((value) => {
    if (!merged.includes(value)) merged.push(value)
  })
  return merged
}

const handleSelectionChange = (value: string[]) => {
  emit('update:modelValue', mergeSelectionOnFilteredSelectAll(value))
}

const clearAllSelection = () => {
  emit('update:modelValue', [])
}

const handleFilter = (event: MultiSelectFilterEvent) => {
  setQuery(event?.value ?? '')
}
</script>

<template>
  <div class="search-append-multi-select">
    <MultiSelect
      :model-value="modelValue"
      :options="options"
      :append-to="appendTo"
      :placeholder="placeholder"
      :class="selectClass"
      :filter="true"
      :filter-match-mode="filterMatchMode"
      :filter-input-props="filterInputProps"
      :empty-filter-message="errorMessage || undefined"
      :empty-message="errorMessage || undefined"
      :pt="passThrough"
      :max-selected-labels="maxSelectedLabels"
      :data-test="selectTestId"
      @update:model-value="handleSelectionChange"
      @filter="handleFilter"
    >
      <template
        v-if="allowRegexSearch"
        #filtericon
      >
        <button
          type="button"
          :data-testid="`${selectTestId}-regex-toggle`"
          :class="getToggleClass(enabled)"
          title="切换正则搜索"
          aria-label="切换正则搜索"
          @mousedown.prevent
          @click="toggleRegexMode"
        >
          .*
        </button>
      </template>
    </MultiSelect>
    <button
      v-if="modelValue.length > 0"
      type="button"
      :data-test="clearButtonTestId"
      class="search-append-multi-select__clear"
      aria-label="清空所有选中项"
      @click="clearAllSelection"
    >
      <CircleX :size="14" />
    </button>
  </div>
</template>

<style scoped>
.search-append-multi-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.search-append-multi-select__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  cursor: pointer;
}
</style>
