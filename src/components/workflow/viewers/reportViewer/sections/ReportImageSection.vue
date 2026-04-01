<script setup lang="ts">
import type { ReportImageSection } from '../reportTypes'

defineProps<{
  section: ReportImageSection
}>()
</script>

<template>
  <section class="space-y-3">
    <h2 v-if="section.title" class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
    <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <img :src="section.url" :alt="section.alt" class="mx-auto max-w-full rounded-xl shadow-sm" />
    </div>
  </section>
</template>
