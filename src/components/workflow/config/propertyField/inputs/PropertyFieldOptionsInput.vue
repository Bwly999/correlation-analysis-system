<script setup lang="ts">
import { computed } from 'vue'
import Select from 'primevue/select'
import type { NodeProperty } from '@/nodes/types'
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

const {
  enabled,
  errorMessage,
  filterMatchMode,
  filterInputProps,
  toggleRegexMode,
  getToggleClass,
} = useRegexFilter({
  inputTestId: 'options-filter-input',
})
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
    :empty-filter-message="errorMessage || props.optionsError || undefined"
    :placeholder="prop.placeholder"
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
