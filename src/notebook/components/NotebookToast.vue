<script setup lang="ts">
/**
 * NotebookToast.vue
 *
 * §8.1/8.2/8.5 错误恢复 toast：右下角堆叠。
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
        accent: 'var(--nb-sage)',
        bg: 'var(--nb-sage-soft)',
        text: '#4A5740',
      }
    case 'warning':
      return {
        accent: 'var(--nb-amber)',
        bg: 'var(--nb-amber-soft)',
        text: '#7C5A28',
      }
    case 'error':
      return {
        accent: 'var(--nb-clay)',
        bg: 'var(--nb-clay-soft)',
        text: '#8B3A37',
      }
    default:
      return {
        accent: 'var(--nb-copper)',
        bg: 'var(--nb-copper-soft)',
        text: 'var(--nb-copper-deep)',
      }
  }
}
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-12 right-4 z-50 flex w-[380px] max-w-[90vw] flex-col gap-2"
  >
    <transition-group name="toast" tag="div" class="flex flex-col gap-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto overflow-hidden rounded-[3px] border"
        style="
          background-color: var(--nb-card);
          border-color: var(--nb-rule-strong);
          box-shadow: 0 24px 48px -16px rgba(40, 40, 38, 0.32);
        "
      >
        <!-- 顶部色条 -->
        <div :style="{ height: '2px', backgroundColor: styleFor(t.kind).accent }" />

        <div class="flex items-start gap-3 p-4">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px]"
            :style="{ backgroundColor: styleFor(t.kind).bg, color: styleFor(t.kind).text }"
          >
            <component :is="iconFor(t.kind)" :size="13" :stroke-width="1.8" />
          </span>
          <div class="min-w-0 flex-1">
            <div
              class="nb-display text-[13px] font-medium leading-snug"
              style="color: var(--nb-ink); letter-spacing: -0.005em;"
            >
              {{ t.title }}
            </div>
            <div
              v-if="t.message"
              class="mt-0.5 text-[12px] leading-5"
              style="color: var(--nb-ink-mute);"
            >
              {{ t.message }}
            </div>
            <div v-if="t.actions?.length" class="mt-2.5 flex gap-2">
              <button
                v-for="(a, i) in t.actions"
                :key="i"
                class="nb-focus inline-flex items-center rounded-[3px] border px-2.5 py-1 text-[11px] font-semibold transition"
                :style="
                  a.primary
                    ? { backgroundColor: 'var(--nb-ink)', color: 'var(--nb-paper)', borderColor: 'var(--nb-ink)' }
                    : { backgroundColor: 'var(--nb-card)', color: 'var(--nb-ink-mute)', borderColor: 'var(--nb-rule)' }
                "
                @click="a.onClick(); emit('dismiss', t.id)"
              >
                {{ a.label }}
              </button>
            </div>
          </div>
          <button
            class="nb-focus flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] transition"
            style="color: var(--nb-ink-faint);"
            aria-label="关闭通知"
            @click="emit('dismiss', t.id)"
            @mouseenter="(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-paper-tint)';
              (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink)'
            }"
            @mouseleave="(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '';
              (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-faint)'
            }"
          >
            <X :size="13" :stroke-width="1.6" />
          </button>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.26s cubic-bezier(0.22, 0.61, 0.36, 1);
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
