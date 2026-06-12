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
      class="fixed inset-0 z-[1900] flex items-center justify-center"
      style="background-color: rgba(42, 40, 37, 0.42); backdrop-filter: blur(4px);"
      role="dialog"
      aria-modal="true"
      @click.self="emit('cancel')"
    >
      <div
        class="nb-fade-up w-[420px] max-w-[90vw] overflow-hidden rounded-[3px] border"
        style="
          background-color: var(--nb-card);
          border-color: var(--nb-rule-strong);
          box-shadow: 0 40px 80px -20px rgba(42, 40, 37, 0.5);
        "
      >
        <!-- 顶部色条 -->
        <div
          style="height: 3px;"
          :style="{
            backgroundColor:
              tone === 'danger' ? 'var(--nb-clay)' : tone === 'warning' ? 'var(--nb-amber)' : 'var(--nb-copper)',
          }"
        />
        <header class="flex items-start gap-3 px-6 pt-6">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px]"
            :style="
              tone === 'danger'
                ? { backgroundColor: 'var(--nb-clay-soft)', color: '#8B3A37' }
                : tone === 'warning'
                ? { backgroundColor: 'var(--nb-amber-soft)', color: '#7C5A28' }
                : { backgroundColor: 'var(--nb-copper-soft)', color: 'var(--nb-copper-deep)' }
            "
          >
            <AlertTriangle :size="14" :stroke-width="1.8" />
          </span>
          <div class="flex-1">
            <div
              class="nb-display text-[16px] font-medium leading-tight"
              style="color: var(--nb-ink); letter-spacing: -0.012em;"
            >
              {{ title }}
            </div>
            <p
              class="mt-1.5 text-[13px] leading-[1.65]"
              style="color: var(--nb-ink-mute);"
            >
              {{ message }}
            </p>
          </div>
        </header>

        <footer
          class="mt-5 flex justify-end gap-2 border-t px-5 py-3"
          style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint);"
        >
          <button
            class="nb-focus rounded-[3px] border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
            style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
            @click="emit('cancel')"
          >
            {{ cancelText ?? '取消' }}
          </button>
          <button
            class="nb-focus rounded-[3px] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition"
            :style="
              tone === 'danger'
                ? { backgroundColor: 'var(--nb-clay)', border: '1px solid var(--nb-clay)' }
                : tone === 'warning'
                ? { backgroundColor: 'var(--nb-ink)', border: '1px solid var(--nb-ink)' }
                : { backgroundColor: 'var(--nb-copper)', border: '1px solid var(--nb-copper)' }
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
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
