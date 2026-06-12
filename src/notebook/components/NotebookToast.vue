<script setup lang="ts">
/**
 * NotebookToast.vue
 *
 * §8.1/8.2/8.5 错误恢复 toast：右下角堆叠，5s 自动消失（error 不消失）。
 * 配合 useNotebookToasts() composable。
 */
import { CheckCircle2, X, AlertTriangle, Info, OctagonAlert } from 'lucide-vue-next'
import type { NotebookToastSpec } from '../composables/useNotebookToasts'

defineProps<{
  toasts: NotebookToastSpec[]
}>()

const emit = defineEmits<{
  dismiss: [id: string]
}>()

const iconFor = (k: NotebookToastSpec['kind']) => {
  switch (k) {
    case 'success':
      return CheckCircle2
    case 'warning':
      return AlertTriangle
    case 'error':
      return OctagonAlert
    default:
      return Info
  }
}

const styleFor = (k: NotebookToastSpec['kind']) => {
  switch (k) {
    case 'success':
      return {
        ring: 'border-emerald-200/80',
        icon: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      }
    case 'warning':
      return {
        ring: 'border-amber-200/80',
        icon: 'text-amber-600 bg-amber-50 border-amber-200',
      }
    case 'error':
      return {
        ring: 'border-rose-200/80',
        icon: 'text-rose-600 bg-rose-50 border-rose-200',
      }
    default:
      return {
        ring: 'border-slate-200/80',
        icon: 'text-slate-600 bg-slate-50 border-slate-200',
      }
  }
}
</script>

<template>
  <div class="pointer-events-none fixed bottom-12 right-4 z-50 flex w-[360px] max-w-[90vw] flex-col gap-2">
    <transition-group name="toast" tag="div" class="flex flex-col gap-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto overflow-hidden rounded-xl border bg-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.45)]"
        :class="styleFor(t.kind).ring"
      >
        <div class="flex items-start gap-3 p-3.5">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
            :class="styleFor(t.kind).icon"
          >
            <component :is="iconFor(t.kind)" :size="14" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-[13px] font-semibold tracking-tight text-slate-900">{{ t.title }}</div>
            <div v-if="t.message" class="mt-0.5 text-[12px] leading-5 text-slate-600">
              {{ t.message }}
            </div>
            <div v-if="t.actions?.length" class="mt-2.5 flex gap-2">
              <button
                v-for="(a, i) in t.actions"
                :key="i"
                class="inline-flex items-center rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition"
                :class="
                  a.primary
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                "
                @click="a.onClick(); emit('dismiss', t.id)"
              >
                {{ a.label }}
              </button>
            </div>
          </div>
          <button
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭通知"
            @click="emit('dismiss', t.id)"
          >
            <X :size="13" />
          </button>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
