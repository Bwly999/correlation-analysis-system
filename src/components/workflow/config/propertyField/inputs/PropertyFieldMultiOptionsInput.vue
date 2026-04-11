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

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

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
    display="chip"
    :placeholder="prop.placeholder"
    class="w-full ndv-input ndv-multi-options"
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
