<script setup lang="ts">
/**
 * ConfirmDialog.vue
 *
 * §9 关闭笔记本确认 dialog；通用化便于其他场景（重启 Python）复用。
 */
import { AlertTriangle } from 'lucide-vue-next'

defineProps<{
  open: boolean
  title: string
  message: string
  /** 确认按钮文案 */
  confirmText?: string
  /** 取消按钮文案 */
  cancelText?: string
  /** 确认按钮的语义 */
  tone?: 'warning' | 'danger' | 'info'
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[1900] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="emit('cancel')"
    >
      <div
        class="w-[400px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_60px_120px_-30px_rgba(15,23,42,0.5)]"
      >
        <header class="flex items-start gap-3 px-5 pt-5">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
            :class="
              tone === 'danger'
                ? 'border-rose-200 bg-rose-50 text-rose-600'
                : tone === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-600'
                : 'border-blue-200 bg-blue-50 text-blue-600'
            "
          >
            <AlertTriangle :size="16" />
          </span>
          <div>
            <div class="text-[14.5px] font-semibold tracking-tight text-slate-900">
              {{ title }}
            </div>
            <p class="mt-1 text-[12.5px] leading-5 text-slate-600">{{ message }}</p>
          </div>
        </header>

        <footer class="mt-5 flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <button
            class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50"
            @click="emit('cancel')"
          >
            {{ cancelText ?? '取消' }}
          </button>
          <button
            class="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition shadow-sm"
            :class="
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500'
                : tone === 'warning'
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-blue-600 hover:bg-blue-500'
            "
            @click="emit('confirm')"
          >
            {{ confirmText ?? '确认' }}
          </button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
