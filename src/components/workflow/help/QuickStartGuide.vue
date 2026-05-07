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
  <div class="grid gap-6 lg:grid-cols-3 relative">
    <div
      v-for="(step, index) in resolvedSteps"
      :key="step.step"
      class="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/5"
    >
      <!-- Step Number (IA Style) -->
      <div class="flex items-baseline justify-between border-b border-slate-100 pb-4">
        <div class="text-4xl font-black italic tracking-tighter text-slate-900 opacity-10 transition-opacity group-hover:opacity-20">
          0{{ step.step }}
        </div>
        <div class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
          Quick Start Phase
        </div>
      </div>

      <h3 class="mt-6 text-xl font-extrabold tracking-tight text-slate-900">{{ step.title }}</h3>
      
      <div class="mt-4 flex-1">
        <div class="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Mission / 任务目标</div>
        <p class="mt-2 text-sm font-medium leading-relaxed text-slate-600">{{ step.goal }}</p>
      </div>

      <!-- Nodes -->
      <div class="mt-6 pt-6 border-t border-slate-50">
        <div class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-3">Recommended / 推荐节点</div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="node in step.nodes"
            :key="node"
            class="rounded bg-slate-900 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-wider"
          >
            {{ node }}
          </span>
        </div>
      </div>

      <!-- Pitfalls (Critical) -->
      <div class="mt-6 rounded-lg bg-blue-600 p-4 text-white">
        <div class="text-[10px] font-black uppercase tracking-[0.16em] opacity-80 mb-2">Checklist / 核心建议</div>
        <ul class="space-y-2">
          <li v-for="pitfall in step.pitfalls" :key="pitfall" class="text-xs font-bold leading-normal flex gap-2">
            <span class="shrink-0">➔</span>
            <span>{{ pitfall }}</span>
          </li>
        </ul>
      </div>

      <!-- Arrow Connector (Desktop only) -->
      <div 
        v-if="index < resolvedSteps.length - 1" 
        class="hidden xl:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm"
      >
        ➔
      </div>
    </div>
  </div>
</template>
