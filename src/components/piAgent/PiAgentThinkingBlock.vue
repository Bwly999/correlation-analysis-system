<script setup lang="ts">
/**
 * Pi Agent 思考块 - 可折叠的思考过程展示
 */
import { Brain, ChevronRight } from 'lucide-vue-next'
defineProps<{
  thinking: string
}>()

import { ref } from 'vue'

const expanded = ref(false)
</script>

<template>
  <div
    v-if="thinking"
    class="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/85 shadow-[0_16px_28px_-28px_rgba(15,23,42,0.45)]"
  >
    <button
      class="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12px] text-slate-500 transition hover:bg-slate-100/90"
      @click="expanded = !expanded"
    >
      <span class="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-slate-500">
        <Brain :size="14" />
      </span>
      <span class="flex-1 font-semibold text-slate-600">推理摘要</span>
      <ChevronRight
        :size="14"
        class="text-slate-400 transition"
        :class="expanded ? 'rotate-90' : ''"
      />
    </button>
    <div
      v-if="expanded"
      class="max-h-[220px] overflow-y-auto border-t border-slate-200 px-3.5 py-3 text-[12px] leading-6 text-slate-600 whitespace-pre-wrap"
    >
      {{ thinking }}
    </div>
  </div>
</template>
