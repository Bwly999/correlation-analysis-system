<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue'
import DatePicker from 'primevue/datepicker'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import type { NodeProperty } from '@/nodes/types'
import { type NonCollectionPropertyType } from './constants'
import PropertyFieldFileInput from './inputs/PropertyFieldFileInput.vue'
import PropertyFieldMultiOptionsInput from './inputs/PropertyFieldMultiOptionsInput.vue'
import PropertyFieldOptionsInput from './inputs/PropertyFieldOptionsInput.vue'
import PropertyFieldSelectButton from './inputs/PropertyFieldSelectButton.vue'
import PropertyFieldTagsInput from './inputs/PropertyFieldTagsInput.vue'
import PropertyFieldTreeInput from './inputs/PropertyFieldTreeInput.vue'
import type { PropertyFieldUpstreamFactor } from './types'

const MonacoEditor = defineAsyncComponent(() => import('../../MonacoEditor.vue'))

interface PropertyFieldInputRendererDefinition {
  component: Component
  buildProps: () => Record<string, unknown>
}

const props = defineProps<{
  prop: NodeProperty
  modelValue: unknown
  upstreamFactors: PropertyFieldUpstreamFactor[]
  optionSource: any[]
  normalizedOptionSource: any[]
  normalizedMultiOptionsSource: any[]
  isOptionsLoading: boolean
  optionsError: string
  isHeroSelectButton: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const normalizeDateValue = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

const normalizeDatePickerModelValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDateValue(item))
      .filter((item): item is Date => item !== null)
  }

  return normalizeDateValue(value)
}

const modelValueProxy = computed({
  get: () =>
    props.prop.type === 'datetime-range'
      ? normalizeDatePickerModelValue(props.modelValue)
      : props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const rendererDefinitions = computed<Record<NonCollectionPropertyType, PropertyFieldInputRendererDefinition>>(
  () => ({
    file: {
      component: PropertyFieldFileInput,
      buildProps: () => ({}),
    },
    options: {
      component: PropertyFieldOptionsInput,
      buildProps: () => ({
        prop: props.prop,
        options: props.normalizedOptionSource,
        optionsError: props.optionsError,
      }),
    },
    'multi-options': {
      component: PropertyFieldMultiOptionsInput,
      buildProps: () => ({
        prop: props.prop,
        options: props.normalizedMultiOptionsSource,
        sourceOptionCount: props.optionSource.length,
      }),
    },
    number: {
      component: InputNumber,
      buildProps: () => ({
        class: 'w-full ndv-input',
      }),
    },
    string: {
      component: InputText,
      buildProps: () => ({
        class: 'w-full ndv-input',
        placeholder: props.prop.placeholder,
      }),
    },
    textarea: {
      component: Textarea,
      buildProps: () => ({
        rows: 8,
        class: 'w-full ndv-input max-h-[240px] overflow-y-auto custom-textarea',
        placeholder: props.prop.placeholder,
      }),
    },
    tags: {
      component: PropertyFieldTagsInput,
      buildProps: () => ({
        prop: props.prop,
        upstreamFactors: props.upstreamFactors,
      }),
    },
    json: {
      component: MonacoEditor,
      buildProps: () => ({
        height: props.prop.editorHeight || '400px',
        language: props.prop.editorLanguage || 'json',
        declarations: props.prop.editorDeclarations,
      }),
    },
    boolean: {
      component: ToggleSwitch,
      buildProps: () => ({}),
    },
    tree: {
      component: PropertyFieldTreeInput,
      buildProps: () => ({
        prop: props.prop,
        options: props.optionSource,
        isOptionsLoading: props.isOptionsLoading,
        optionsError: props.optionsError,
      }),
    },
    'datetime-range': {
      component: DatePicker,
      buildProps: () => ({
        selectionMode: 'range',
        showTime: !props.prop.dateOnly,
        manualInput: false,
        dateFormat: 'yy-mm-dd',
        class: 'w-full ndv-datepicker',
        pt: {
          input: { class: 'w-full ndv-input text-xs' },
        },
      }),
    },
    'select-button': {
      component: PropertyFieldSelectButton,
      buildProps: () => ({
        prop: props.prop,
        options: props.optionSource,
        isHero: props.isHeroSelectButton,
      }),
    },
  }),
)

const resolvedRenderer = computed(() => rendererDefinitions.value[props.prop.type as NonCollectionPropertyType] ?? null)
const resolvedComponent = computed(() => resolvedRenderer.value?.component ?? null)
const resolvedProps = computed(() => resolvedRenderer.value?.buildProps() ?? {})
</script>

<template>
  <component
    :is="resolvedComponent"
    v-if="resolvedComponent"
    v-model="modelValueProxy"
    v-bind="resolvedProps"
  />
</template>

<style scoped>
.ndv-input {
  border-color: #e2e8f0 !important;
  background-color: #ffffff !important;
  border-radius: 12px !important;
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
</style>
