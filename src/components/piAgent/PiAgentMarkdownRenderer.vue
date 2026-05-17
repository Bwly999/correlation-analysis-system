<script setup lang="ts">
import { computed } from 'vue'
import { renderPiAgentMarkdown } from './piAgentMarkdown'

const props = defineProps<{
  content: string
}>()

const renderedHtml = computed(() =>
  renderPiAgentMarkdown(props.content),
)
</script>

<template>
  <div class="min-w-0">
    <div
      class="min-w-0 text-[13px] leading-7 text-slate-900 [&_*]:min-w-0"
      v-html="renderedHtml"
    />
  </div>
</template>
