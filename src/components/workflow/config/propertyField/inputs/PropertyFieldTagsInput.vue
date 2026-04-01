<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import AutoComplete from 'primevue/autocomplete'
import type { NodeProperty } from '@/nodes/types'
import type { PropertyFieldUpstreamFactor } from '../types'

const props = defineProps<{
  modelValue: unknown
  prop: NodeProperty
  upstreamFactors: PropertyFieldUpstreamFactor[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const autoCompleteRef = useTemplateRef<any>('autoCompleteRef')
const filteredFactors = ref<string[]>([])

const searchFactors = (event: { query?: string }) => {
  const query = String(event.query || '').toLowerCase()
  filteredFactors.value = props.upstreamFactors
    .filter((factor) => factor.name.toLowerCase().includes(query))
    .map((factor) => factor.name)
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
</script>

<template>
  <AutoComplete
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
</template>
