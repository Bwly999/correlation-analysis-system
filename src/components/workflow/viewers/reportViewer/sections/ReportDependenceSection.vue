<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import VChart from 'vue-echarts'
import type { ReportDependenceItem, ReportDependenceSection } from '../reportTypes'

defineProps<{
  section: ReportDependenceSection
  items: ReportDependenceItem[]
  featureSearch: string
  hasMore: boolean
}>()

const emit = defineEmits<{
  updateFeatureSearch: [value: string]
  showAll: []
}>()

const handleFeatureSearchInput = (event: Event) => {
  emit('updateFeatureSearch', String((event.target as HTMLInputElement).value))
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
        <p class="mt-1 text-sm text-slate-500">
          默认展示高重要性因子，支持搜索和展开全部，保证所有因子都可访问。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="hasMore"
          data-test="shap-show-all"
          class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
          @click="emit('showAll')"
        >
          显示全部因子
        </button>
        <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
          <Search :size="14" />
          <input
            data-test="shap-feature-search"
            type="text"
            class="min-w-[200px] border-0 bg-transparent p-0 text-sm text-slate-700 outline-none"
            placeholder="搜索因子，如 f3"
            :value="featureSearch"
            @input="handleFeatureSearchInput"
          />
        </label>
      </div>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="item in items"
        :key="`dependence-${item.feature}`"
        class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
      >
        <h3 data-test="shap-dependence-card-title" class="text-sm font-bold text-slate-700">{{ item.title }}</h3>
        <div class="mt-3 h-[280px] rounded-xl border border-slate-100 bg-white p-3">
          <VChart :option="item.option" autoresize />
        </div>
      </article>
    </div>
  </section>
</template>
