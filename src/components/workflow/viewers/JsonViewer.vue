<script setup lang="ts">
import { computed } from 'vue'
import { createSafeJsonPreview, stringifySafePreview } from '../previewSerialization'

const props = defineProps<{
  data: unknown
}>()

const previewText = computed(() => stringifySafePreview(createSafeJsonPreview(props.data)))
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
    <div
      class="h-full w-full overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-100 custom-scrollbar"
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
