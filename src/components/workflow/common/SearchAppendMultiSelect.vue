<script setup lang="ts">
import { computed, ref } from 'vue'
import MultiSelect from 'primevue/multiselect'
import { CircleX } from 'lucide-vue-next'

type SelectOption = string | { value?: string; name?: string; label?: string }

const props = withDefaults(defineProps<{
  modelValue: string[]
  options: SelectOption[]
  appendTo?: string | HTMLElement
  placeholder?: string
  maxSelectedLabels?: number
  selectClass?: string
  selectTestId?: string
  clearButtonTestId?: string
}>(), {
  placeholder: '',
  maxSelectedLabels: 3,
  selectClass: '',
  selectTestId: 'search-append-multi-select',
  clearButtonTestId: 'search-append-multi-select-clear',
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const filterQuery = ref('')

const resolveOptionValue = (option: SelectOption) => {
  if (typeof option === 'string') return option
  return option.value ?? option.name ?? option.label ?? ''
}

const resolveOptionLabel = (option: SelectOption) => {
  if (typeof option === 'string') return option
  return option.name ?? option.label ?? option.value ?? ''
}

const filteredOptionValues = computed(() => {
  const keyword = filterQuery.value.trim().toLowerCase()
  if (!keyword) {
    return props.options
      .map(resolveOptionValue)
      .filter((value): value is string => Boolean(value))
  }

  return props.options
    .filter((option) => resolveOptionLabel(option).toLowerCase().includes(keyword))
    .map(resolveOptionValue)
    .filter((value): value is string => Boolean(value))
})

const mergeSelectionOnFilteredSelectAll = (nextValues: string[]) => {
  if (!filterQuery.value.trim()) return nextValues
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

const handleFilter = (event: { value?: string } | undefined) => {
  filterQuery.value = (event?.value ?? '').trim()
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
      :max-selected-labels="maxSelectedLabels"
      :data-test="selectTestId"
      @update:model-value="handleSelectionChange"
      @filter="handleFilter"
    />
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
