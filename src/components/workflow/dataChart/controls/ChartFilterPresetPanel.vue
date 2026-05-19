<script setup lang="ts">
import { computed } from 'vue'
import { Bookmark, Check, Trash2 } from 'lucide-vue-next'
import type { ChartFilterPreset } from '../types'

const props = defineProps<{
  presets: ChartFilterPreset[]
  selectedPresetId: string | null
  defaultPresetId: string | 'none' | null
}>()

const presetName = defineModel<string>('presetName', { required: true })

const emit = defineEmits<{
  save: []
  apply: [preset: ChartFilterPreset]
  delete: [presetId: string]
  markDefault: []
  noDefault: []
}>()

const sortedPresets = computed(() => [...props.presets].sort((left, right) => right.updatedAt - left.updatedAt))

const presetSummaryText = (preset: ChartFilterPreset) => {
  const lower = preset.lowerBound === null ? '无下限' : `>= ${preset.lowerBound}`
  const upper = preset.upperBound === null ? '无上限' : `<= ${preset.upperBound}`
  return `${lower}，${upper}`
}
</script>

<template>
  <aside
    data-test="chart-preset-panel"
    class="chart-preset-popover absolute left-full top-0 z-20 ml-3 w-[320px] max-h-[min(75vh,640px)] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col"
  >
    <div class="px-4 py-4 border-b border-slate-100">
      <div class="flex items-center gap-2 text-slate-700">
        <Bookmark :size="15" />
        <h3 class="text-sm font-black">过滤条件</h3>
      </div>
      <p class="mt-2 text-xs text-slate-500">保存、应用和设置默认过滤条件。默认也可以设为不过滤。</p>
    </div>

    <div class="px-4 py-4 border-b border-slate-100 space-y-3">
      <input
        v-model="presetName"
        data-test="chart-preset-name"
        type="text"
        class="preset-name-input"
        placeholder="输入名称，可留空自动生成"
      />

      <button
        data-test="chart-preset-save"
        class="preset-primary-button w-full"
        type="button"
        @click="emit('save')"
      >
        保存当前条件
      </button>

      <div class="flex gap-2">
        <button
          data-test="chart-preset-mark-default"
          class="preset-secondary-button flex-1"
          :class="{ 'preset-secondary-button--active': defaultPresetId === selectedPresetId && selectedPresetId !== null }"
          type="button"
          :disabled="!selectedPresetId"
          @click="emit('markDefault')"
        >
          默认应用当前条件
        </button>
        <button
          data-test="chart-preset-set-no-default"
          class="preset-secondary-button flex-1"
          :class="{ 'preset-secondary-button--active': defaultPresetId === 'none' }"
          type="button"
          @click="emit('noDefault')"
        >
          默认不过滤
        </button>
      </div>
    </div>

    <div
      data-test="chart-preset-scroll"
      class="flex-1 min-h-0 overflow-y-auto preset-scroll px-4 py-4 space-y-3"
    >
      <div
        v-for="preset in sortedPresets"
        :key="preset.id"
        class="preset-card"
        :class="{ 'preset-card--active': defaultPresetId === preset.id }"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <span class="text-sm font-bold text-slate-800 truncate block">{{ preset.name }}</span>
            <p class="mt-1 text-xs text-slate-500">{{ presetSummaryText(preset) }}</p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button data-test="chart-preset-apply" class="preset-action-button" type="button" @click="emit('apply', preset)">
              <Check :size="14" />
            </button>
            <button class="preset-action-button" type="button" @click.stop="emit('delete', preset.id)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <div
          v-if="selectedPresetId === preset.id"
          class="mt-3 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full px-2 py-1 inline-flex"
        >
          当前已应用
        </div>
      </div>

      <div v-if="sortedPresets.length === 0" class="text-xs text-slate-400 leading-6">
        还没有保存的过滤条件。设置好上下限后即可在这里保存。
      </div>
    </div>
  </aside>
</template>

<style scoped>
.chart-preset-popover {
  margin-top: 2px;
}

.preset-name-input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 12px;
  color: #334155;
  background: #fff;
}

.preset-primary-button,
.preset-secondary-button {
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.preset-primary-button {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
  padding: 9px 12px;
}

.preset-secondary-button {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  padding: 9px 12px;
}

.preset-secondary-button--active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}

.preset-secondary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preset-scroll::-webkit-scrollbar {
  width: 6px;
}

.preset-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}

.preset-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 12px;
  background: #fff;
}

.preset-card--active {
  border-color: #2563eb;
  background: #eff6ff;
}

.preset-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #94a3b8;
  cursor: pointer;
}
</style>
