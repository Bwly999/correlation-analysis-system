<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import InputNumber from 'primevue/inputnumber'
import { Activity, BarChart3, Database, ListFilter, Sigma } from 'lucide-vue-next'
import { useDataQualityProfile, type DataQualityFieldProfile } from './useDataQualityProfile'

const props = defineProps<{
  data: unknown
}>()

const thresholdPercent = shallowRef(30)
const { fieldProfiles, summary, missingBuckets, hasProfileData, fieldsAtOrAboveMissingRate } =
  useDataQualityProfile(computed(() => props.data))

const filteredFields = computed(() => fieldsAtOrAboveMissingRate.value(thresholdPercent.value))
const maxBucketCount = computed(() =>
  missingBuckets.value.reduce((max, bucket) => Math.max(max, bucket.count), 0),
)

watch(
  thresholdPercent,
  (value) => {
    const normalized = Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 30
    if (normalized !== value) thresholdPercent.value = normalized
  },
  { immediate: true },
)

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`
const formatNumber = (value?: number) =>
  value === undefined ? '-' : Number(value.toFixed(4)).toLocaleString('zh-CN')

const fieldTypeLabel = (type: DataQualityFieldProfile['type']) => {
  if (type === 'number') return '数值'
  if (type === 'string') return '文本'
  if (type === 'boolean') return '布尔'
  if (type === 'date') return '日期'
  if (type === 'json') return '对象'
  return '未知'
}

const summaryCards = computed(() => [
  {
    label: '总行数',
    value: summary.value.rowCount.toLocaleString('zh-CN'),
    icon: Database,
  },
  {
    label: '字段数',
    value: summary.value.fieldCount.toLocaleString('zh-CN'),
    icon: BarChart3,
  },
  {
    label: '存在缺少字段',
    value: summary.value.missingFieldCount.toLocaleString('zh-CN'),
    icon: ListFilter,
  },
  {
    label: '最高缺少率',
    value: formatPercent(summary.value.highestMissingRate),
    icon: Activity,
  },
  {
    label: '数值字段',
    value: summary.value.numericFieldCount.toLocaleString('zh-CN'),
    icon: Sigma,
  },
])
</script>

<template>
  <div
    data-test="data-quality-pivot"
    class="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50"
  >
    <div
      v-if="hasProfileData"
      class="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4"
    >
      <section
        data-test="data-quality-summary"
        class="grid gap-3 md:grid-cols-5"
      >
        <article
          v-for="card in summaryCards"
          :key="card.label"
          class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {{ card.label }}
            </span>
            <component
              :is="card.icon"
              :size="16"
              class="text-blue-600"
            />
          </div>
          <div class="text-2xl font-black tracking-tight text-slate-900">
            {{ card.value }}
          </div>
        </article>
      </section>

      <section class="grid min-h-[220px] gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h3 class="text-sm font-black text-slate-800">缺少分布</h3>
              <p class="mt-1 text-xs font-medium text-slate-400">
                按字段缺少率分桶统计字段数量
              </p>
            </div>
            <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
              {{ summary.fieldCount }} 个字段
            </span>
          </div>
          <div class="space-y-3">
            <div
              v-for="bucket in missingBuckets"
              :key="bucket.label"
              class="grid grid-cols-[64px_1fr_48px] items-center gap-3"
            >
              <span class="text-xs font-bold text-slate-500">{{ bucket.label }}</span>
              <div class="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  class="h-full rounded-full bg-blue-600 transition-all"
                  :style="{
                    width:
                      maxBucketCount === 0
                        ? '0%'
                        : `${Math.max(8, (bucket.count / maxBucketCount) * 100)}%`,
                  }"
                ></div>
              </div>
              <span class="text-right text-xs font-black text-slate-700">{{ bucket.count }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-black text-slate-800">缺少率字段全集</h3>
              <p class="mt-1 text-xs font-medium text-slate-400">
                展示缺少率大于等于阈值的全部字段
              </p>
            </div>
            <label class="flex items-center gap-2 text-xs font-bold text-slate-500">
              阈值
              <InputNumber
                v-model="thresholdPercent"
                input-id="data-quality-missing-threshold"
                :min="0"
                :max="100"
                suffix="%"
                :use-grouping="false"
                class="data-quality-threshold-input"
              />
            </label>
          </div>
          <div
            data-test="data-quality-threshold-list"
            class="max-h-44 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3"
          >
            <div
              v-if="filteredFields.length === 0"
              class="py-8 text-center text-xs font-bold text-slate-400"
            >
              当前阈值下没有命中字段
            </div>
            <template v-else>
              <div
                v-for="field in filteredFields"
                :key="field.field"
                class="mb-2 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 last:mb-0"
              >
                <span class="truncate text-sm font-bold text-slate-800">{{ field.field }}</span>
                <span class="shrink-0 text-xs font-black text-blue-600">
                  {{ formatPercent(field.missingRate) }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </section>

      <section class="min-h-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-100 px-5 py-4">
          <h3 class="text-sm font-black text-slate-800">字段统计明细</h3>
        </div>
        <div class="max-h-[360px] overflow-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th class="px-4 py-3">字段</th>
                <th class="px-4 py-3">类型</th>
                <th class="px-4 py-3 text-right">缺少数</th>
                <th class="px-4 py-3 text-right">缺少率</th>
                <th class="px-4 py-3 text-right">非缺少数</th>
                <th class="px-4 py-3 text-right">最小值</th>
                <th class="px-4 py-3 text-right">最大值</th>
                <th class="px-4 py-3 text-right">均值</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="field in fieldProfiles"
                :key="field.field"
                class="bg-white hover:bg-slate-50"
              >
                <td class="px-4 py-3 font-bold text-slate-800">{{ field.field }}</td>
                <td class="px-4 py-3 text-slate-500">{{ fieldTypeLabel(field.type) }}</td>
                <td class="px-4 py-3 text-right font-semibold text-slate-700">
                  {{ field.missingCount }}
                </td>
                <td class="px-4 py-3 text-right font-semibold text-slate-700">
                  {{ formatPercent(field.missingRate) }}
                </td>
                <td class="px-4 py-3 text-right text-slate-500">{{ field.nonMissingCount }}</td>
                <td class="px-4 py-3 text-right text-slate-500">{{ formatNumber(field.min) }}</td>
                <td class="px-4 py-3 text-right text-slate-500">{{ formatNumber(field.max) }}</td>
                <td class="px-4 py-3 text-right text-slate-500">{{ formatNumber(field.mean) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div
      v-else
      class="flex h-full items-center justify-center p-8 text-center text-sm font-bold text-slate-400"
    >
      当前结果缺少可体检的表格数据
    </div>
  </div>
</template>

<style scoped>
:deep(.data-quality-threshold-input .p-inputnumber-input) {
  width: 76px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}
</style>
