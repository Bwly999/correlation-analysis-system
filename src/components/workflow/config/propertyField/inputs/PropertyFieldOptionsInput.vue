<script setup lang="ts">
import { computed } from 'vue'
import Select from 'primevue/select'
import type { NodeProperty } from '@/nodes/types'
import { PROPERTY_FIELD_OPTION_ITEM_SIZE } from '../constants'
import { useRegexFilter } from '../useRegexFilter'

const props = defineProps<{
  modelValue: unknown
  prop: NodeProperty
  options: any[]
  optionsError?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const confirmEditableOption = (event?: KeyboardEvent) => {
  const target = event?.target as HTMLInputElement | null
  const value = (target?.value ?? query.value).trim()
  if (!value) return

  configValue.value = value
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
  toggleRegexMode,
  getToggleClass,
} = useRegexFilter({
  inputTestId: 'options-filter-input',
  onEnter: confirmEditableOption,
})

const optionsForceInputHint = computed(() => {
  if (errorMessage.value) return errorMessage.value
  if (!props.prop.forceInput) return props.optionsError || undefined
  if (props.options.length > 0) return props.optionsError || undefined
  return '暂无可选项，可直接输入后按回车添加'
})

const virtualScrollerOptions = {
  itemSize: PROPERTY_FIELD_OPTION_ITEM_SIZE,
}
</script>

<template>
  <Select
    v-model="configValue"
    :options="options"
    option-label="name"
    option-value="value"
    option-disabled="disabled"
    :filter="true"
    :filter-match-mode="filterMatchMode"
    :filter-input-props="filterInputProps"
    :editable="prop.editable"
    :empty-filter-message="optionsForceInputHint"
    :empty-message="optionsForceInputHint"
    :pt="passThrough"
    :placeholder="prop.placeholder"
    :virtual-scroller-options="virtualScrollerOptions"
    class="w-full ndv-input"
  >
    <template v-if="prop.allowRegexSearch" #filtericon>
      <button
        type="button"
        data-testid="options-regex-toggle"
        :class="getToggleClass(enabled)"
        @mousedown.prevent
        @click="toggleRegexMode"
      >
        .*
      </button>
    </template>
  </Select>
</template>
