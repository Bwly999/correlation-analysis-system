<script setup lang="ts">
import { computed } from 'vue'
import { getNodeDefinition } from '@/nodes/registry'
import type { HelpCenterContent } from '@/help/types'

const props = defineProps<{
  steps: HelpCenterContent['quickStart']
}>()

const resolvedSteps = computed(() =>
  props.steps.map((step) => ({
    ...step,
    nodes: step.recommendedNodes.map((name) => getNodeDefinition(name)?.displayName ?? name),
  })),
)
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-3">
    <article
      v-for="step in resolvedSteps"
      :key="step.step"
      class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.45)]"
    >
      <div class="flex items-center justify-between">
        <span class="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold tracking-[0.16em] text-white">
          STEP {{ step.step }}
        </span>
        <span class="text-xs font-semibold text-slate-400">3 分钟上手</span>
      </div>
      <h3 class="mt-4 text-lg font-semibold text-slate-900">{{ step.title }}</h3>
      <p class="mt-2 text-sm leading-6 text-slate-600">{{ step.goal }}</p>

      <div class="mt-4">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">推荐节点</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="node in step.nodes"
            :key="node"
            class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
          >
            {{ node }}
          </span>
        </div>
      </div>

      <div class="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">常见误区</div>
        <ul class="mt-2 space-y-2 text-sm leading-6 text-amber-900">
          <li v-for="pitfall in step.pitfalls" :key="pitfall">• {{ pitfall }}</li>
        </ul>
      </div>
    </article>
  </div>
</template>
