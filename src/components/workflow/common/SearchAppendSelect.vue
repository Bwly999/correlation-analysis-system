<script setup lang="ts">
import { computed } from 'vue'
import Select from 'primevue/select'
import { CircleX } from 'lucide-vue-next'
import { useRegexFilter } from '../config/propertyField/useRegexFilter'

type SelectOption = string | { value?: string; name?: string; label?: string }

const props = withDefaults(defineProps<{
  modelValue: string | null
  options: SelectOption[]
  appendTo?: string | HTMLElement
  placeholder?: string
  selectClass?: string
  selectTestId?: string
  clearButtonTestId?: string
  allowRegexSearch?: boolean
}>(), {
  placeholder: '',
  selectClass: '',
  selectTestId: 'search-append-select',
  clearButtonTestId: 'search-append-select-clear',
  allowRegexSearch: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const normalizedOptions = computed(() =>
  props.options.map((option) => {
    if (typeof option === 'string') {
      return { label: option, value: option }
    }

    const value = option.value ?? option.name ?? option.label ?? ''
    const label = option.name ?? option.label ?? option.value ?? ''

    return { label, value }
  }).filter((option) => option.value),
)

const {
  enabled,
  filterMatchMode,
  filterInputProps,
  passThrough,
  toggleRegexMode,
  getToggleClass,
} = useRegexFilter({
  inputTestId: 'search-append-select-filter-input',
  defaultEnabled: false,
})

const clearSelection = () => {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="search-append-select">
    <Select
      :model-value="modelValue"
      :options="normalizedOptions"
      :append-to="appendTo"
      :placeholder="placeholder"
      option-label="label"
      option-value="value"
      :class="selectClass"
      :filter="true"
      :filter-match-mode="filterMatchMode"
      :filter-input-props="filterInputProps"
      :pt="passThrough"
      :data-test="selectTestId"
      show-clear
      @update:model-value="emit('update:modelValue', $event ?? null)"
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
    </Select>

    <button
      v-if="modelValue"
      type="button"
      :data-test="clearButtonTestId"
      class="search-append-select__clear"
      aria-label="清空当前选项"
      @click="clearSelection"
    >
      <CircleX :size="14" />
    </button>
  </div>
</template>

<style scoped>
.search-append-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.search-append-select__clear {
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
