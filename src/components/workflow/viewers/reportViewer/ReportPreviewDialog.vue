<script setup lang="ts">
import { X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'

defineProps<{
  visible: boolean
  imageSrc: string
  previewScale: number
  isPreviewDragging: boolean
  previewImageTransform: string
  appendTo?: HTMLElement | 'body'
}>()

const emit = defineEmits<{
  close: []
  zoomIn: []
  zoomOut: []
  reset: []
  wheel: [event: WheelEvent]
  mouseDown: [event: MouseEvent]
}>()
</script>

<template>
  <Dialog
    :visible="visible"
    :append-to="appendTo"
    modal
    dismissable-mask
    maximizable
    :draggable="false"
    :closable="false"
    :style="{ width: '96vw' }"
    content-class="!p-0 !overflow-hidden"
    mask-class="backdrop-blur-sm"
    @update:visible="(value) => !value && emit('close')"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-4 pr-2">
        <div>
          <h2 data-test="full-report-preview-modal" class="text-lg font-bold text-slate-900">原始整图预览</h2>
          <p class="mt-1 text-sm text-slate-500">支持滚轮缩放和鼠标按住拖动平移。</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            data-test="full-report-zoom-out"
            class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            @click="emit('zoomOut')"
          >
            <ZoomOut :size="16" />
          </button>
          <span class="min-w-16 text-center text-sm font-bold text-slate-700">{{ Math.round(previewScale * 100) }}%</span>
          <button
            data-test="full-report-zoom-in"
            class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            @click="emit('zoomIn')"
          >
            <ZoomIn :size="16" />
          </button>
          <button
            class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            @click="emit('reset')"
          >
            重置
          </button>
          <button
            class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>
      </div>
    </template>

    <div
      data-test="full-report-preview-surface"
      class="relative h-[82vh] cursor-grab overflow-hidden bg-slate-950"
      :class="{ 'cursor-grabbing': isPreviewDragging }"
      @wheel="emit('wheel', $event)"
      @mousedown="emit('mouseDown', $event)"
    >
      <img
        data-test="full-report-preview-image"
        :src="imageSrc"
        alt="原始整图预览"
        class="absolute left-1/2 top-1/2 max-h-none max-w-none select-none"
        :class="{ 'cursor-grabbing': isPreviewDragging }"
        :style="{ transform: `translate(-50%, -50%) ${previewImageTransform}`, transformOrigin: 'center center' }"
        draggable="false"
      />
    </div>
  </Dialog>
</template>
