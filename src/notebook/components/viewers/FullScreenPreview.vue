<script setup lang="ts">
/**
 * FullScreenPreview.vue
 *
 * §7.1 大屏预览弹窗：FilePreview header 展开按钮触发。
 *   - 铺满视口的模态壳（暗遮罩 + 纸色内容卡 + 圆角内边距）
 *   - 按 previewKind 复用现有 viewer（markdown/code/table），viewer 零改动
 *   - image kind 不复用 ImagePreview（避免双层 lightbox），直接渲染 <img> + zoom/pan 工具条
 *   - 关闭：ESC + header 右上角 X（禁用遮罩点击，防误触）
 *   - 宽度：markdown/code 居中限宽，table/image 撑满
 *
 * 数据由 FilePreview 透传（content/bytes/opfsRoot/selectedPath/meta/codeLanguage/previewKind）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Maximize as MaximizeIcon, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import type { PreviewKind } from '../../preview/previewRouter'
import type { OpfsDirectoryHandle } from '../../shared/opfsAccess'
import MarkdownPreview from './MarkdownPreview.vue'
import CodePreview from './CodePreview.vue'
import TablePreview from './TablePreview.vue'

interface MetaInfo {
  size?: number
  modifiedAt?: number
}

const props = defineProps<{
  open: boolean
  previewKind: PreviewKind
  selectedPath: string
  content: string
  bytes?: Uint8Array | null
  opfsRoot?: OpfsDirectoryHandle
  meta?: MetaInfo
  codeLanguage: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
}>()

const close = () => emit('update:open', false)

// ===== 键盘：ESC 关闭 =====
const onKeydown = (e: KeyboardEvent) => {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onKeydown)
      // 图片打开时重置缩放并计算 contain 初始值
      if (props.previewKind === 'image') {
        scale.value = 1
        tx.value = 0
        ty.value = 0
        containFit.value = null
        awaitImageFit()
      }
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

// 内容区宽度：markdown/code 居中限宽，table/image 撑满
const contentWrapClass = computed(() => {
  if (props.previewKind === 'markdown' || props.previewKind === 'code') {
    return 'mx-auto w-full'
  }
  return 'w-full'
})
const contentWrapStyle = computed(() => {
  if (props.previewKind === 'markdown') return { maxWidth: '1100px' }
  if (props.previewKind === 'code') return { maxWidth: '1200px' }
  return {}
})

// ===== 图片 zoom / pan（参考 ImagePreview lightbox，起始改为 contain） =====
const MIN_SCALE = 0.2
const MAX_SCALE = 8
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
// contain 适配后的基础缩放（图片自然尺寸 → 适配容器），1 表示原图大小
const containFit = ref<number | null>(null)

// 拖拽中间状态
let dragging = false
let lastX = 0
let lastY = 0

// 实际渲染缩放 = containFit * scale（containFit 让图片初始铺满可视区，scale 在此基础上用户缩放）
const renderScale = computed(() => (containFit.value ?? 1) * scale.value)

const onImgLoad = (e: Event) => {
  const img = e.target as HTMLImageElement
  const el = img.parentElement as HTMLElement
  if (!el || !img.naturalWidth || !img.naturalHeight) return
  const rect = el.getBoundingClientRect()
  // 内边距留白，图片不顶满容器边缘
  const pad = 48
  const fitW = (rect.width - pad) / img.naturalWidth
  const fitH = (rect.height - pad) / img.naturalHeight
  containFit.value = Math.min(fitW, fitH, 1)
}

// 图片尺寸变化 / 容器变化时重算 contain（简化：仅在 load 时算一次）
const awaitImageFit = () => {
  // 实际计算交给 onload，这里无需处理
}

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
  e.preventDefault()
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

const onPointerMove = (e: PointerEvent) => {
  if (!dragging) return
  tx.value += e.clientX - lastX
  ty.value += e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
}

const endDrag = (e: PointerEvent) => {
  if (!dragging) return
  dragging = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}

const scalePercent = computed(() => Math.round(scale.value * 100))
</script>

<template>
  <Teleport to="body">
    <transition name="nb-lightbox">
      <div
        v-if="open"
        class="fixed inset-0 z-[2000] flex flex-col"
        style="background-color: var(--nb-paper);"
        role="dialog"
        aria-modal="true"
        :aria-label="`大屏预览：${selectedPath}`"
      >
        <!-- 轻量 header：文件名 + kind chip + 关闭 X -->
        <header
          class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5"
          style="border-color: var(--nb-rule); background-color: var(--nb-sidebar);"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <span
              class="truncate nb-mono text-[11px]"
              style="color: var(--nb-ink-mute); letter-spacing: 0.02em;"
            >
              {{ selectedPath }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              class="nb-chip"
              data-tone="default"
              style="padding: 1px 7px; font-size: 9px; letter-spacing: 0.16em; font-weight: 700;"
            >
              {{ previewKind }}
            </span>
            <button
              class="nb-focus flex h-7 w-7 items-center justify-center rounded-full border transition hover:opacity-80"
              style="border-color: var(--nb-rule-strong); color: var(--nb-ink);"
              title="关闭 (Esc)"
              @click="close"
            >
              <X :size="14" :stroke-width="1.8" />
            </button>
          </div>
        </header>

        <!-- 内容区：按 kind 分发，viewer 零改动复用 -->
        <div :class="contentWrapClass" :style="contentWrapStyle" class="flex min-h-0 flex-1 flex-col">
          <MarkdownPreview
            v-if="previewKind === 'markdown'"
            :opfs-root="opfsRoot"
            :base-path="selectedPath"
            :content="content"
          />
          <CodePreview
            v-else-if="previewKind === 'code'"
            :content="content"
            :language="codeLanguage"
          />
          <TablePreview
            v-else-if="previewKind === 'table'"
            :content="content"
            :bytes="bytes"
            :path="selectedPath"
          />

          <!-- 图片：纯 <img> + zoom/pan，不复用 ImagePreview 避免双层 lightbox -->
          <div
            v-else-if="previewKind === 'image'"
            class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            style="
              background-image:
                radial-gradient(circle at center, transparent 0%, var(--nb-overlay) 100%);
            "
            @wheel="onWheel"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          >
            <img
              v-if="content"
              :src="content"
              :alt="selectedPath"
              class="pointer-events-none select-none"
              :style="{
                transform: `translate(${tx}px, ${ty}px) scale(${renderScale})`,
                transition: dragging ? 'none' : 'transform 0.12s ease-out',
                boxShadow: '0 40px 80px -20px rgba(0, 0, 0, 0.6)',
                willChange: 'transform',
                WebkitUserDrag: 'none',
                userSelect: 'none',
              }"
              draggable="false"
              @dragstart.prevent
              @load="onImgLoad"
            />
            <!-- zoom/pan 工具条 -->
            <div
              class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border px-1.5 py-1"
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
                {{ scalePercent }}%
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
                title="还原 (contain)"
                @click="reset"
              >
                <MaximizeIcon :size="14" :stroke-width="1.8" />
              </button>
            </div>
            <div
              class="nb-mono pointer-events-none absolute bottom-5 left-5 text-[10.5px] tracking-wide text-white/40"
            >
              滚轮缩放 · 拖拽平移 · ESC 关闭
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
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
