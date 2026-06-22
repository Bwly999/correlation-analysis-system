<script setup lang="ts">
/**
 * RenameDialog.vue
 *
 * Notebook 风格的「重命名对话」弹窗。结构与 ConfirmDialog.vue 同构
 * （暖色 --nb-* 变量、fade 过渡、顶部 3px 铜色色条、fixed inset-0 z-[1900] 遮罩），
 * 把消息区换成受控输入框。
 *
 * 交互：
 *   - 打开时以 initialValue 初始化草稿并自动 focus + select
 *   - Enter 提交、Esc 取消、遮罩点击 = 取消
 *   - 空串 / 纯空白时禁用「保存」按钮
 */
import { nextTick, ref, watch } from 'vue'
import { Pencil } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 弹窗标题（非会话标题） */
    title?: string
    /** 输入框初始值（会话当前标题） */
    initialValue?: string
    confirmText?: string
    cancelText?: string
    /** 输入框最大长度 */
    maxLength?: number
  }>(),
  {
    title: '重命名对话',
    initialValue: '',
    confirmText: '保存',
    cancelText: '取消',
    maxLength: 60,
  },
)

const emit = defineEmits<{
  confirm: [value: string]
  cancel: []
}>()

const draft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      draft.value = props.initialValue
      await nextTick()
      if (inputRef.value) {
        inputRef.value.focus()
        inputRef.value.select()
      }
    }
  },
)

const trimmed = () => draft.value.trim()
const commit = () => {
  const value = trimmed()
  if (!value) return
  emit('confirm', value)
}
const cancel = () => emit('cancel')
</script>

<template>
  <transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[1900] flex items-center justify-center"
      style="background-color: rgba(42, 40, 37, 0.42); backdrop-filter: blur(4px);"
      role="dialog"
      aria-modal="true"
      @click.self="cancel"
    >
      <div
        class="nb-fade-up w-[420px] max-w-[90vw] overflow-hidden rounded-[3px] border"
        style="
          background-color: var(--nb-card);
          border-color: var(--nb-rule-strong);
          box-shadow: 0 40px 80px -20px rgba(42, 40, 37, 0.5);
        "
        @click.stop
      >
        <!-- 顶部色条 -->
        <div style="height: 3px; background-color: var(--nb-copper);" />
        <header class="flex items-start gap-3 px-6 pt-6">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px]"
            style="background-color: var(--nb-copper-soft); color: var(--nb-copper-deep);"
          >
            <Pencil :size="14" :stroke-width="1.8" />
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
              为这个对话起一个便于识别的名字。
            </p>
          </div>
        </header>

        <div class="px-6 pt-4">
          <input
            ref="inputRef"
            v-model="draft"
            :maxlength="maxLength"
            type="text"
            class="nb-focus w-full rounded-[3px] border px-3 py-2 text-[13.5px] outline-none transition"
            style="
              border-color: var(--nb-rule-strong);
              background-color: var(--nb-paper);
              color: var(--nb-ink);
            "
            @keydown.enter="commit"
            @keydown.esc="cancel"
          />
        </div>

        <footer
          class="mt-5 flex justify-end gap-2 border-t px-5 py-3"
          style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint);"
        >
          <button
            class="nb-focus rounded-[3px] border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
            style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
            @click="cancel"
          >
            {{ cancelText }}
          </button>
          <button
            class="nb-focus rounded-[3px] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style="background-color: var(--nb-copper); border: 1px solid var(--nb-copper);"
            :disabled="trimmed().length === 0"
            @click="commit"
          >
            {{ confirmText }}
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
