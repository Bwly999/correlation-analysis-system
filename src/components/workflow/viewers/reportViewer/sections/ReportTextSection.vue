<script setup lang="ts">
import ReportSectionHelpButton from '../ReportSectionHelpButton.vue'
import type { ReportTextSection } from '../reportTypes'

defineProps<{
  section: ReportTextSection
}>()
</script>

<template>
  <section class="space-y-2">
    <div v-if="section.title" class="flex items-center gap-2">
      <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
      <ReportSectionHelpButton
        :help="section.help"
        :section-key="String(section.key || 'text')"
        :title="section.title"
      />
    </div>
    <p class="text-sm leading-relaxed whitespace-pre-wrap text-slate-600">{{ section.content }}</p>
  </section>
</template>
