<script setup lang="ts">
import { computed } from 'vue'
import type { NodeDefinition } from '@/nodes/types'

const props = defineProps<{
  nodeDefinition: NodeDefinition | null
  compact?: boolean
}>()

const helpDoc = computed(() => props.nodeDefinition?.help ?? null)

const parameterGuide = computed(() => {
  if (helpDoc.value?.parameterGuide?.length) {
    return helpDoc.value.parameterGuide
  }

  return (props.nodeDefinition?.properties ?? [])
    .filter((property) => Boolean(property.description))
    .slice(0, props.compact ? 3 : 8)
    .map((property) => ({
      property: property.name,
      title: property.displayName,
      content: property.description ?? '',
    }))
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div v-if="!nodeDefinition" class="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
      <div class="text-sm font-black uppercase tracking-widest text-slate-400">Error / 001</div>
      <div class="mt-2 text-lg font-extrabold text-slate-900">未找到节点定义</div>
    </div>

    <div
      v-else-if="!helpDoc"
      class="rounded-lg border border-slate-200 bg-white p-6"
    >
      <div class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-2">Node Info</div>
      <h3 class="text-2xl font-black tracking-tight text-slate-900">{{ nodeDefinition.displayName }}</h3>
      <p class="mt-4 text-sm font-medium leading-relaxed text-slate-500">{{ nodeDefinition.description }}</p>
      <div class="mt-6 border-t border-slate-100 pt-6 text-[11px] font-bold text-slate-400">
        HELP CONTENT PENDING / 文档完善中
      </div>
    </div>

    <template v-else>
      <!-- Hero Section -->
      <div class="bg-slate-900 p-8 text-white rounded-xl">
        <div class="flex items-center justify-between mb-4">
          <div class="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Node Documentation</div>
          <span class="rounded bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
            {{ nodeDefinition.category }}
          </span>
        </div>
        <h3 class="text-4xl font-black tracking-tighter">{{ nodeDefinition.displayName }}</h3>
        <p class="mt-4 text-lg font-medium leading-snug text-slate-300 max-w-2xl">{{ helpDoc.summary }}</p>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- When to Use -->
        <div class="flex flex-col border border-slate-200 bg-white p-6">
          <div class="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-3 mb-4">
            Application / 适用场景
          </div>
          <ul class="space-y-3">
            <li v-for="item in helpDoc.whenToUse" :key="item" class="flex gap-3 text-sm font-bold text-slate-700">
              <span class="text-blue-600">➔</span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>

        <!-- Input Requirements -->
        <div class="flex flex-col border border-slate-200 bg-white p-6">
          <div class="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-3 mb-4">
            Requirements / 输入要求
          </div>
          <ul class="space-y-3">
            <li v-for="item in helpDoc.inputGuide" :key="item" class="flex gap-3 text-sm font-bold text-slate-700">
              <span class="text-blue-600">➔</span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>

        <!-- Output Guide -->
        <div class="lg:col-span-2 flex flex-col border border-slate-200 bg-white p-6">
          <div class="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-3 mb-4">
            Output & Next / 输出与下一步
          </div>
          <div class="grid gap-8 md:grid-cols-2">
            <ul class="space-y-3">
              <li v-for="item in helpDoc.outputGuide" :key="item" class="flex gap-3 text-sm font-bold text-slate-700">
                <span class="text-blue-600">➔</span>
                <span>{{ item }}</span>
              </li>
            </ul>
            <div v-if="helpDoc.nextSteps?.length" class="bg-slate-50 p-4 rounded-lg">
              <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Workflow Sequence</div>
              <div class="flex flex-wrap gap-2">
                <span v-for="item in helpDoc.nextSteps" :key="item" class="rounded bg-white border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                  {{ item }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Parameters (Spec Style) -->
        <div v-if="parameterGuide.length > 0" class="lg:col-span-2 flex flex-col border border-slate-900 bg-white">
          <div class="bg-slate-900 px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white">
            Technical Specification / 关键参数说明
          </div>
          <div class="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0 md:divide-x">
            <div
              v-for="item in parameterGuide"
              :key="`${item.property}-${item.title}`"
              class="p-6 transition-colors hover:bg-slate-50"
            >
              <div class="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">{{ item.property }}</div>
              <div class="text-base font-black text-slate-900 mb-2">{{ item.title }}</div>
              <p class="text-sm font-medium leading-relaxed text-slate-500">{{ item.content }}</p>
            </div>
          </div>
        </div>

        <!-- Common Issues -->
        <div v-if="helpDoc.commonIssues?.length" class="lg:col-span-2 flex flex-col border border-amber-200 bg-amber-50 p-6">
          <div class="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700 border-b border-amber-200 pb-3 mb-4">
            Troubleshooting / 常见问题
          </div>
          <div class="grid gap-6 md:grid-cols-2">
            <div v-for="item in helpDoc.commonIssues" :key="item.title">
              <div class="text-sm font-black text-amber-900 mb-2">Q: {{ item.title }}</div>
              <div class="text-sm font-medium leading-relaxed text-amber-800">A: {{ item.resolution }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
