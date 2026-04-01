<script setup lang="ts">
import { computed } from 'vue'
import { HelpCircle, Settings, Trash2 } from 'lucide-vue-next'
import Button from 'primevue/button'
import { type NodeProperty } from '@/nodes/types'
import PropertyFieldInputRenderer from './propertyField/PropertyFieldInputRenderer.vue'
import { usePropertyFieldOptions } from './propertyField/usePropertyFieldOptions'
import type { PropertyFieldProps } from './propertyField/types'

defineOptions({
  name: 'PropertyField',
})

const props = defineProps<PropertyFieldProps>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  save: []
}>()

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const {
  isHeroSelectButton,
  optionSource,
  normalizedOptionSource,
  normalizedMultiOptionsSource,
  nonAnalyzableUpstreamFactors,
  showUpstreamEmptyHint,
  nonAnalyzableHintText,
  upstreamEmptyHintText,
  isOptionsLoading,
  optionsError,
} = usePropertyFieldOptions(props)

const addCollectionItem = () => {
  const nextValue = [...((props.modelValue as unknown[]) || [])]
  const newItem: Record<string, unknown> = {}
  props.prop.properties?.forEach((property: NodeProperty) => {
    newItem[property.name] = property.default
  })
  nextValue.push(newItem)
  emit('update:modelValue', nextValue)
}

const removeCollectionItem = (index: number) => {
  const nextValue = [...((props.modelValue as unknown[]) || [])]
  nextValue.splice(index, 1)
  emit('update:modelValue', nextValue)
}

const updateSubItem = (index: number, subPropName: string, value: unknown) => {
  const nextValue = [...((props.modelValue as Record<string, unknown>[]) || [])]
  nextValue[index] = { ...nextValue[index], [subPropName]: value }
  emit('update:modelValue', nextValue)
}
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
            @update:model-value="(value) => updateSubItem(Number(idx), subProp.name, value)"
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

    <PropertyFieldInputRenderer
      v-else
      v-model="configValue"
      :prop="prop"
      :upstream-factors="upstreamFactors"
      :option-source="optionSource"
      :normalized-option-source="normalizedOptionSource"
      :normalized-multi-options-source="normalizedMultiOptionsSource"
      :is-options-loading="isOptionsLoading"
      :options-error="optionsError"
      :is-hero-select-button="isHeroSelectButton"
    />

    <div
      v-if="nonAnalyzableUpstreamFactors.length > 0 || showUpstreamEmptyHint"
      class="flex flex-wrap items-center gap-2"
    >
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
</style>
