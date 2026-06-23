<script setup lang="ts">
/**
 * ImagePreview.vue
 *
 * §7.1 图片 viewer：纸面居中展示，径向背景收边。
 *   src 为空（blob URL 尚未生成）时显示加载占位。
 *   点击图片打开大屏弹窗（lightbox），支持滚轮缩放与拖拽平移。
 */
import { onBeforeUnmount, ref } from 'vue'
import { X, ZoomIn, ZoomOut, Maximize } from 'lucide-vue-next'

const props = defineProps<{
  src: string
  alt?: string
}>()

// ===== Lightbox 状态 =====
const isOpen = ref(false)
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

// 拖拽中间状态（无需响应式）
let dragging = false
let lastX = 0
let lastY = 0
let downX = 0
let downY = 0
let moved = false

const openLightbox = () => {
  if (!props.src) return
  scale.value = 1
  tx.value = 0
  ty.value = 0
  isOpen.value = true
  document.addEventListener('keydown', onKeydown)
}

const closeLightbox = () => {
  if (!isOpen.value) return
  isOpen.value = false
  document.removeEventListener('keydown', onKeydown)
}

const onKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value) return
  if (e.key === 'Escape') closeLightbox()
  else if (e.key === '+' || e.key === '=') zoomBy(1.25)
  else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.25)
  else if (e.key === '0') reset()
}

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

// 以 (mx, my)（相对容器中心）为锚点缩放，保持锚点对应图片内容不动
const zoomAt = (mx: number, my: number, mul: number) => {
  const prev = scale.value
  const next = clampScale(prev * mul)
  if (next === prev) return
  const f = next / prev
  tx.value = mx * (1 - f) + f * tx.value
  ty.value = my * (1 - f) + f * ty.value
  scale.value = next
}

const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const mx = e.clientX - rect.left - rect.width / 2
  const my = e.clientY - rect.top - rect.height / 2
  // exp 让缩放节奏在小幅度时细腻、大幅度时不过激；ctrl+wheel（pinch）同样适用
  zoomAt(mx, my, Math.exp(-e.deltaY * 0.0015))
}

const zoomBy = (mul: number) => zoomAt(0, 0, mul)

const reset = () => {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

const onPointerDown = (e: PointerEvent) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  // 阻止浏览器原生图片拖拽 / 文本选区，否则会出现虚影 + 红色禁用光标
  e.preventDefault()
  dragging = true
  moved = false
  lastX = downX = e.clientX
  lastY = downY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

const onPointerMove = (e: PointerEvent) => {
  if (!dragging) return
  tx.value += e.clientX - lastX
  ty.value += e.clientY - lastY
  if (!moved && (Math.abs(e.clientX - downX) > 3 || Math.abs(e.clientY - downY) > 3)) {
    moved = true
  }
  lastX = e.clientX
  lastY = e.clientY
}

const endDrag = (e: PointerEvent) => {
  if (!dragging) return
  dragging = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  // 未发生拖拽 → 视为点击空白处关闭
  if (!moved) closeLightbox()
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
    style="
      background-image:
        radial-gradient(circle at center, transparent 0%, var(--nb-overlay) 100%);
    "
  >
    <img
      v-if="src"
      :src="src"
      :alt="alt ?? ''"
      class="max-h-full max-w-full cursor-zoom-in rounded-[var(--nb-radius-sm)] border"
      style="border-color: var(--nb-rule-strong); box-shadow: var(--nb-shadow-lg);"
      @click="openLightbox"
    />
    <div
      v-else
      class="nb-display-italic text-[13px]"
      style="color: var(--nb-ink-mute);"
    >
      图片正在加载…
    </div>

    <Teleport to="body">
      <transition name="nb-lightbox">
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[2000] flex cursor-grab select-none items-center justify-center overflow-hidden active:cursor-grabbing"
          style="background-color: rgba(15, 14, 13, 0.94); backdrop-filter: blur(6px); touch-action: none;"
          role="dialog"
          aria-modal="true"
          :aria-label="alt ?? '图片预览'"
          @wheel="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="endDrag"
          @pointercancel="endDrag"
        >
          <img
            :src="src"
            :alt="alt ?? ''"
            class="pointer-events-none max-h-[90vh] max-w-[90vw] select-none"
            :style="{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transition: dragging ? 'none' : 'transform 0.12s ease-out',
              boxShadow: '0 40px 80px -20px rgba(0, 0, 0, 0.6)',
              willChange: 'transform',
              WebkitUserDrag: 'none',
              userSelect: 'none',
            }"
            draggable="false"
            @dragstart.prevent
          />

          <!-- 关闭按钮 -->
          <button
            class="nb-focus absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border text-white/80 transition hover:bg-white/10 hover:text-white"
            style="border-color: rgba(255, 255, 255, 0.18); background-color: rgba(255, 255, 255, 0.06);"
            title="关闭 (Esc)"
            @pointerdown.stop
            @click.stop="closeLightbox"
          >
            <X :size="16" :stroke-width="1.8" />
          </button>

          <!-- 工具栏 -->
          <div
            class="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border px-1.5 py-1"
            style="border-color: rgba(255, 255, 255, 0.18); background-color: rgba(20, 18, 16, 0.72); backdrop-filter: blur(8px);"
            @pointerdown.stop
            @click.stop
          >
            <button
              class="nb-focus flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
              title="缩小 (-)"
              @click="zoomBy(1 / 1.25)"
            >
              <ZoomOut :size="15" :stroke-width="1.8" />
            </button>
            <span class="min-w-[3rem] text-center text-[11.5px] font-medium tabular-nums text-white/70">
              {{ Math.round(scale * 100) }}%
            </span>
            <button
              class="nb-focus flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
              title="放大 (+)"
              @click="zoomBy(1.25)"
            >
              <ZoomIn :size="15" :stroke-width="1.8" />
            </button>
            <span class="mx-1 h-4 w-px" style="background-color: rgba(255, 255, 255, 0.18);" />
            <button
              class="nb-focus flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
              title="还原 (0)"
              @click="reset"
            >
              <Maximize :size="14" :stroke-width="1.8" />
            </button>
          </div>

          <!-- 操作提示 -->
          <div
            class="nb-mono pointer-events-none absolute bottom-6 left-5 text-[10.5px] tracking-wide text-white/40"
          >
            滚轮缩放 · 拖拽平移 · ESC 关闭
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.nb-lightbox-enter-active,
.nb-lightbox-leave-active {
  transition: opacity 0.2s ease;
}
.nb-lightbox-enter-from,
.nb-lightbox-leave-to {
  opacity: 0;
}
</style>
