<script setup lang="ts">
import type { ReportRiskListSection } from '../reportTypes'

defineProps<{
  section: ReportRiskListSection
}>()

const getRiskItemClasses = (level: string | undefined) => {
  if (level === 'danger') return 'border-rose-200 bg-rose-50'
  if (level === 'warning') return 'border-amber-200 bg-amber-50'
  return 'border-slate-200 bg-slate-50'
}

const getRiskBadgeClasses = (level: string | undefined) => {
  if (level === 'danger') return 'bg-rose-100 text-rose-700'
  if (level === 'warning') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

const getRiskLevelText = (level: string | undefined) => {
  if (level === 'danger') return '高风险'
  if (level === 'warning') return '需关注'
  return '提示'
}
</script>

<template>
  <section class="space-y-4">
    <div>
      <h2 v-if="section.title" class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
      <p class="mt-1 text-sm text-slate-500">
        这些提示用于帮助判断结果是否足够稳定，不替代业务结论。
      </p>
    </div>
    <div class="grid gap-3">
      <article
        v-for="(item, riskIndex) in section.items || []"
        :key="`${section.key || 'risk'}-${riskIndex}`"
        data-test="report-risk-item"
        class="rounded-2xl border px-4 py-4"
        :class="getRiskItemClasses(item.level)"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-slate-800">{{ item.title }}</h3>
            <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ item.message }}</p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold"
            :class="getRiskBadgeClasses(item.level)"
          >
            {{ getRiskLevelText(item.level) }}
          </span>
        </div>
      </article>
    </div>
  </section>
</template>
