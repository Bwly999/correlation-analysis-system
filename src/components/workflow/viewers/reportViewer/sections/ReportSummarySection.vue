<script setup lang="ts">
import ReportSectionHelpButton from '../ReportSectionHelpButton.vue'
import type { ReportSummarySection } from '../reportTypes'

defineProps<{
  section: ReportSummarySection
  isShapReport: boolean
}>()
</script>

<template>
  <section class="space-y-4">
    <div>
      <div v-if="section.title" class="flex items-center gap-2">
        <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
        <ReportSectionHelpButton
          :help="section.help"
          :section-key="String(section.key || 'summary')"
          :title="section.title"
        />
      </div>
      <p v-if="isShapReport" class="mt-2 text-sm text-slate-500 leading-relaxed">
        快速查看本次 SHAP 建模的核心上下文。
      </p>
      <p
        v-else-if="section.content"
        class="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-500"
      >
        {{ section.content }}
      </p>
    </div>
    <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      <article
        v-for="card in section.cards"
        :key="card.label"
        class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
      >
        <p class="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          {{ card.label }}
        </p>
        <p class="mt-2 text-lg font-black text-slate-800">{{ card.value }}</p>
      </article>
    </div>
  </section>
</template>
