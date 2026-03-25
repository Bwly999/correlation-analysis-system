<script setup lang="ts">
import { computed } from 'vue'
import { createSafeJsonPreview, stringifySafePreview } from '../previewSerialization'

const props = defineProps<{
  data: unknown
}>()

const previewText = computed(() => stringifySafePreview(createSafeJsonPreview(props.data)))
</script>

<template>
  <div class="h-full w-full p-4">
    <div
      class="h-full w-full bg-slate-950 text-slate-100 rounded-xl border border-slate-800 overflow-auto p-4 custom-scrollbar"
    >
      <pre class="text-xs leading-6 whitespace-pre-wrap break-all">{{ previewText }}</pre>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #475569;
  border-radius: 999px;
}
</style>
