<script setup lang="ts">
import { computed } from 'vue'
import { HelpCircle } from 'lucide-vue-next'
import type { ReportSectionHelp } from './reportTypes'

const props = defineProps<{
  help?: ReportSectionHelp
  sectionKey: string
  title?: string
}>()

const tooltipText = computed(() => {
  const lines: string[] = []

  if (props.help?.summary) {
    lines.push(props.help.summary)
  }

  if (props.help?.howToRead?.length) {
    lines.push(...props.help.howToRead.map((item) => `怎么看：${item}`))
  }

  if (props.help?.cautions?.length) {
    lines.push(...props.help.cautions.map((item) => `注意：${item}`))
  }

  return lines.join('\n')
})
</script>

<template>
  <button
    v-if="tooltipText"
    v-tooltip.bottom="tooltipText"
    :data-test="`report-section-help-${sectionKey}`"
    :aria-label="`查看${title || '该区块'}说明`"
    class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
    type="button"
  >
    <HelpCircle :size="15" />
  </button>
</template>
