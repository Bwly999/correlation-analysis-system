<script setup lang="ts">
import { Download, FileDown, CheckCircle } from 'lucide-vue-next'

const props = defineProps<{
  data: any
}>()

const handleDownload = () => {
  if (props.data.exportInfo?.url) {
    const a = document.createElement('a')
    a.href = props.data.exportInfo.url
    a.download = props.data.exportInfo.filename || 'export.csv'
    a.click()
  }
}
</script>

<template>
  <div class="h-full w-full flex items-center justify-center p-6 bg-slate-50">
    <div class="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center max-w-md text-center">
      <div class="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
        <CheckCircle size="40" class="text-emerald-500" />
      </div>
      
      <h2 class="text-2xl font-black text-slate-800 mb-2">数据导出就绪</h2>
      <p class="text-slate-500 mb-8 leading-relaxed">
        文件 <strong>{{ data.exportInfo?.filename || 'export.csv' }}</strong> 已经成功生成，可以进行下载。
      </p>
      
      <button 
        @click="handleDownload"
        class="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all"
      >
        <Download size="20" />
        <span>立即下载文件</span>
      </button>
    </div>
  </div>
</template>
