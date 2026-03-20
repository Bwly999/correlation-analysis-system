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
    .slice(0, props.compact ? 3 : 6)
    .map((property) => ({
      property: property.name,
      title: property.displayName,
      content: property.description ?? '',
    }))
})

const sectionClass = computed(() =>
  props.compact
    ? 'rounded-xl border border-slate-200 bg-white/90 p-3'
    : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
)
</script>

<template>
  <div class="space-y-3">
    <div v-if="!nodeDefinition" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
      <div class="font-semibold text-amber-900">未找到节点定义</div>
      <p class="mt-1 leading-6">暂时无法展示帮助，请先检查节点类型是否有效。</p>
    </div>

    <div
      v-else-if="!helpDoc"
      class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
    >
      <div class="font-semibold text-slate-900">{{ nodeDefinition.displayName }}</div>
      <p class="mt-1 leading-6">{{ nodeDefinition.description }}</p>
      <p class="mt-2 text-xs text-slate-500">该节点帮助正在补充中，可先结合参数说明继续使用。</p>
    </div>

    <template v-else>
      <div class="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
        <div class="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">使用帮助</div>
        <div class="mt-2 flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-slate-900">{{ nodeDefinition.displayName }}</h3>
            <p class="mt-1 text-sm leading-6 text-slate-600">{{ helpDoc.summary }}</p>
          </div>
          <span
            class="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500"
          >
            {{ nodeDefinition.category }}
          </span>
        </div>
      </div>

      <div :class="sectionClass">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">适用场景</div>
        <ul class="mt-2 space-y-2 text-sm leading-6 text-slate-700">
          <li v-for="item in helpDoc.whenToUse" :key="item">• {{ item }}</li>
        </ul>
      </div>

      <div :class="sectionClass">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">输入要求</div>
        <ul class="mt-2 space-y-2 text-sm leading-6 text-slate-700">
          <li v-for="item in helpDoc.inputGuide" :key="item">• {{ item }}</li>
        </ul>
      </div>

      <div v-if="parameterGuide.length > 0" :class="sectionClass">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">关键参数</div>
        <div class="mt-3 space-y-3">
          <div
            v-for="item in parameterGuide"
            :key="`${item.property}-${item.title}`"
            class="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
          >
            <div class="text-sm font-semibold text-slate-900">{{ item.title }}</div>
            <p class="mt-1 text-sm leading-6 text-slate-600">{{ item.content }}</p>
          </div>
        </div>
      </div>

      <div :class="sectionClass">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">输出与下一步</div>
        <ul class="mt-2 space-y-2 text-sm leading-6 text-slate-700">
          <li v-for="item in helpDoc.outputGuide" :key="item">• {{ item }}</li>
        </ul>
        <div v-if="helpDoc.nextSteps?.length" class="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <div class="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">推荐下一步</div>
          <ul class="mt-2 space-y-2 text-sm leading-6 text-emerald-800">
            <li v-for="item in helpDoc.nextSteps" :key="item">• {{ item }}</li>
          </ul>
        </div>
      </div>

      <div v-if="helpDoc.commonIssues?.length" :class="sectionClass">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">常见问题</div>
        <div class="mt-3 space-y-3">
          <div
            v-for="item in helpDoc.commonIssues"
            :key="item.title"
            class="rounded-xl border border-amber-100 bg-amber-50 p-3"
          >
            <div class="text-sm font-semibold text-amber-900">{{ item.title }}</div>
            <p class="mt-1 text-sm leading-6 text-amber-800">{{ item.resolution }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
