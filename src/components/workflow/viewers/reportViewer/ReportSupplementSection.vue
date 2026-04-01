<script setup lang="ts">
defineProps<{
  fullReportImage?: string
  beeswarmImage?: string
}>()

const emit = defineEmits<{
  exportOriginalImage: []
  openPreview: []
}>()
</script>

<template>
  <section
    v-if="fullReportImage || beeswarmImage"
    class="rounded-2xl border border-slate-200 bg-slate-50 p-5"
  >
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h2 class="text-lg font-bold text-slate-800">后端原始整图</h2>
        <p class="mt-1 text-sm leading-relaxed text-slate-500">
          这是后端 Python 侧生成的原始整图，用于补充对照与归档，不替代前端主报告。
        </p>
      </div>
      <button
        v-if="fullReportImage"
        class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
        @click="emit('exportOriginalImage')"
      >
        导出原始整图
      </button>
      <button
        v-if="fullReportImage"
        data-test="open-full-report-preview"
        class="rounded-xl border border-slate-200 bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
        @click="emit('openPreview')"
      >
        放大查看
      </button>
    </div>
    <div v-if="fullReportImage" class="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
      <img
        data-test="full-report-image"
        :src="fullReportImage"
        alt="后端原始整图"
        class="mx-auto max-w-full cursor-zoom-in rounded-xl shadow-sm"
        @click="emit('openPreview')"
      />
    </div>
  </section>
</template>
