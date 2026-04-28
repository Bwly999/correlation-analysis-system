<script setup lang="ts">
import ReportSectionHelpButton from '../ReportSectionHelpButton.vue'
import type { ReportImageSection } from '../reportTypes'

defineProps<{
  section: ReportImageSection
}>()
</script>

<template>
  <section class="space-y-3">
    <div v-if="section.title" class="flex items-center gap-2">
      <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
      <ReportSectionHelpButton
        :help="section.help"
        :section-key="String(section.key || 'image')"
        :title="section.title"
      />
    </div>
    <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <img :src="section.url" :alt="section.alt" class="mx-auto max-w-full rounded-xl shadow-sm" />
    </div>
  </section>
</template>
