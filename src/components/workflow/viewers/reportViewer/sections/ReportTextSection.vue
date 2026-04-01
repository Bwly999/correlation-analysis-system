<script setup lang="ts">
import type { ReportTextSection } from '../reportTypes'

defineProps<{
  section: ReportTextSection
}>()
</script>

<template>
  <section class="space-y-2">
    <h2 v-if="section.title" class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
    <p class="text-sm leading-relaxed whitespace-pre-wrap text-slate-600">{{ section.content }}</p>
  </section>
</template>
