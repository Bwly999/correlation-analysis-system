<script setup lang="ts">
import { computed } from 'vue'
import SelectButton from 'primevue/selectbutton'
import type { NodeProperty } from '@/nodes/types'

const props = defineProps<{
  modelValue: unknown
  prop: NodeProperty
  options: readonly any[]
  isHero: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const selectOptions = computed(() => [...props.options])
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="isHero"
      class="select-button-hero rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)]"
    >
      <div class="flex items-center gap-2">
        <span class="select-button-hero__eyebrow">查询策略</span>
        <div class="text-[15px] font-semibold tracking-[0.01em] text-slate-900">
          {{ prop.displayName }}
        </div>
        <span v-if="prop.required" class="text-[12px] font-semibold text-rose-500">*</span>
      </div>

      <div class="mt-3 rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] p-2">
        <SelectButton
          v-model="configValue"
          :options="selectOptions"
          :allow-empty="false"
          option-label="name"
          option-value="value"
          class="w-full select-button-custom select-button-custom--hero"
        />
      </div>
    </div>

    <SelectButton
      v-else
      v-model="configValue"
      :options="selectOptions"
      :allow-empty="false"
      option-label="name"
      option-value="value"
      class="w-full select-button-custom"
    />
  </div>
</template>

<style scoped>
:deep(.select-button-custom) {
  display: flex;
  gap: 4px;
  border-radius: 12px;
  background: #f1f5f9;
  padding: 4px;
}

.select-button-hero {
  position: relative;
  overflow: hidden;
}

.select-button-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 38%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.02), transparent 50%);
  pointer-events: none;
}

.select-button-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(248, 250, 252, 0.9);
  padding: 0.2rem 0.5rem;
  color: #2563eb;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:deep(.select-button-custom .p-togglebutton) {
  flex: 1;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  border-radius: 10px !important;
  padding: 7px 5px !important;
  line-height: 1.35 !important;
  transition: all 0.2s ease !important;
}

:deep(.select-button-custom .p-togglebutton.p-togglebutton-checked) {
  border-color: transparent !important;
  background: #e2e8f0 !important;
  color: #0f172a !important;
  box-shadow: none !important;
}

:deep(.select-button-custom .p-togglebutton::before) {
  display: none !important;
}

:deep(.select-button-custom .p-togglebutton .p-togglebutton-content) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}

:deep(.select-button-custom .p-togglebutton .p-togglebutton-label) {
  display: block;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

:deep(.select-button-custom--hero) {
  gap: 6px;
  background: transparent;
  padding: 0;
}

:deep(.select-button-custom--hero .p-togglebutton) {
  min-height: 48px;
  border: 1px solid rgba(148, 163, 184, 0.28) !important;
  background: rgba(255, 255, 255, 0.92) !important;
  color: #475569 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  letter-spacing: 0.01em;
  border-radius: 16px !important;
  box-shadow: 0 12px 24px -24px rgba(15, 23, 42, 0.55);
  padding: 8px 8px !important;
}

:deep(.select-button-custom--hero .p-togglebutton:hover) {
  border-color: rgba(37, 99, 235, 0.24) !important;
  background: rgba(255, 255, 255, 1) !important;
  color: #0f172a !important;
}

:deep(.select-button-custom--hero .p-togglebutton.p-togglebutton-checked) {
  border-color: rgba(37, 99, 235, 0.18) !important;
  background: #dbeafe !important;
  color: #1d4ed8 !important;
  box-shadow: none !important;
}
</style>
