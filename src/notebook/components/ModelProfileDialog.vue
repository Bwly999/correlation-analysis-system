<script setup lang="ts">
/**
 * ModelProfileDialog.vue
 *
 * 新增 / 编辑用户自定义模型配置的弹窗。结构与 RenameDialog.vue 同构
 * （暖色 --nb-* 变量、fade 过渡、顶部 3px 铜色色条、fixed inset-0 z-[1900] 遮罩）。
 *
 * 表单字段：name / baseUrl / model / apiKey / contextWindow / maxTokens / thinkingLevel
 * 内置「测试连通性」按钮，调用 testNotebookModelProfile 验证后显示 latency / 错误。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Boxes, Loader2 } from 'lucide-vue-next'
import {
  testNotebookModelProfile,
  type NotebookModelProfileInput,
  type NotebookModelProfileTestResult,
  type NotebookThinkingLevel,
} from '../runtime/notebookAgentClient'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 编辑模式时传入初始值；新增模式不传 */
    initial?: Partial<NotebookModelProfileInput> & { id?: string }
    title?: string
  }>(),
  {
    title: '添加自定义模型',
  },
)

const emit = defineEmits<{
  /** 提交（保存）；父级负责调 create/update API */
  submit: [input: NotebookModelProfileInput]
  cancel: []
}>()

const THINKING_LEVELS: NotebookThinkingLevel[] = ['high', 'medium', 'low', 'off']

const form = ref<NotebookModelProfileInput>({
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  contextWindow: 128000,
  maxTokens: 15000,
  thinkingLevel: 'high',
})

const testing = ref(false)
const testResult = ref<NotebookModelProfileTestResult | null>(null)
const nameInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      form.value = {
        name: props.initial?.name ?? '',
        baseUrl: props.initial?.baseUrl ?? '',
        model: props.initial?.model ?? '',
        apiKey: props.initial?.apiKey ?? '',
        contextWindow: props.initial?.contextWindow ?? 128000,
        maxTokens: props.initial?.maxTokens ?? 15000,
        thinkingLevel: props.initial?.thinkingLevel ?? 'high',
      }
      testResult.value = null
      await nextTick()
      nameInputRef.value?.focus()
    }
  },
)

const isEdit = computed(() => Boolean(props.initial?.id))

const canSubmit = computed(() => {
  const f = form.value
  return f.name.trim() && f.baseUrl.trim() && f.model.trim() && f.apiKey.trim()
})

const commit = () => {
  if (!canSubmit.value) return
  emit('submit', { ...form.value })
}

const cancel = () => emit('cancel')

const runTest = async () => {
  if (!canSubmit.value || testing.value) return
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testNotebookModelProfile(form.value)
  } catch (error) {
    testResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '测试失败',
    }
  } finally {
    testing.value = false
  }
}
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
        class="nb-fade-up w-[520px] max-w-[92vw] max-h-[90vh] overflow-y-auto rounded-[3px] border"
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
            <Boxes :size="14" :stroke-width="1.8" />
          </span>
          <div class="flex-1">
            <div
              class="nb-display text-[16px] font-medium leading-tight"
              style="color: var(--nb-ink); letter-spacing: -0.012em;"
            >
              {{ isEdit ? '编辑模型' : title }}
            </div>
            <p
              class="mt-1.5 text-[13px] leading-[1.65]"
              style="color: var(--nb-ink-mute);"
            >
              配置一个自定义 AI 模型，可在对话中随时切换使用。
            </p>
          </div>
        </header>

        <div class="space-y-3.5 px-6 pt-4">
          <!-- 名称 -->
          <div>
            <label class="nb-eyebrow mb-1 block text-[10.5px]" style="color: var(--nb-ink-faint);">显示名称</label>
            <input
              ref="nameInputRef"
              v-model="form.name"
              type="text"
              maxlength="60"
              placeholder="如：我的 DeepSeek"
              class="nb-focus w-full rounded-[3px] border px-3 py-2 text-[13.5px] outline-none transition"
              style="border-color: var(--nb-rule-strong); background-color: var(--nb-paper); color: var(--nb-ink);"
              @keydown.esc="cancel"
            >
          </div>
          <!-- baseUrl -->
          <div>
            <label class="nb-eyebrow mb-1 block text-[10.5px]" style="color: var(--nb-ink-faint);">API 地址 (Base URL)</label>
            <input
              v-model="form.baseUrl"
              type="text"
              placeholder="https://api.deepseek.com"
              class="nb-focus w-full rounded-[3px] border px-3 py-2 text-[13.5px] outline-none transition"
              style="border-color: var(--nb-rule-strong); background-color: var(--nb-paper); color: var(--nb-ink);"
              @keydown.esc="cancel"
            >
          </div>
          <!-- model -->
          <div>
            <label class="nb-eyebrow mb-1 block text-[10.5px]" style="color: var(--nb-ink-faint);">模型 ID</label>
            <input
              v-model="form.model"
              type="text"
              placeholder="如：deepseek-chat"
              class="nb-focus w-full rounded-[3px] border px-3 py-2 text-[13.5px] outline-none transition"
              style="border-color: var(--nb-rule-strong); background-color: var(--nb-paper); color: var(--nb-ink);"
              @keydown.esc="cancel"
            >
          </div>
          <!-- apiKey -->
          <div>
            <label class="nb-eyebrow mb-1 block text-[10.5px]" style="color: var(--nb-ink-faint);">API Key</label>
            <input
              v-model="form.apiKey"
              type="password"
              placeholder="sk-..."
              class="nb-focus w-full rounded-[3px] border px-3 py-2 text-[13.5px] outline-none transition"
              style="border-color: var(--nb-rule-strong); background-color: var(--nb-paper); color: var(--nb-ink);"
              @keydown.esc="cancel"
            >
          </div>
          <!-- contextWindow / maxTokens 双列 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="nb-eyebrow mb-1 block text-[10.5px]" style="color: var(--nb-ink-faint);">上下文窗口 (tokens)</label>
              <input
                v-model.number="form.contextWindow"
                type="number"
                min="1000"
                placeholder="128000"
                class="nb-focus w-full rounded-[3px] border px-3 py-2 text-[13.5px] tabular-nums outline-none transition"
                style="border-color: var(--nb-rule-strong); background-color: var(--nb-paper); color: var(--nb-ink);"
              >
            </div>
            <div>
              <label class="nb-eyebrow mb-1 block text-[10.5px]" style="color: var(--nb-ink-faint);">Max Tokens</label>
              <input
                v-model.number="form.maxTokens"
                type="number"
                min="100"
                placeholder="15000"
                class="nb-focus w-full rounded-[3px] border px-3 py-2 text-[13.5px] tabular-nums outline-none transition"
                style="border-color: var(--nb-rule-strong); background-color: var(--nb-paper); color: var(--nb-ink);"
              >
            </div>
          </div>
          <!-- thinkingLevel -->
          <div>
            <label class="nb-eyebrow mb-1 block text-[10.5px]" style="color: var(--nb-ink-faint);">思考等级</label>
            <div class="flex gap-1.5">
              <button
                v-for="level in THINKING_LEVELS"
                :key="level"
                type="button"
                class="nb-focus rounded-[3px] border px-3 py-1.5 text-[12px] font-medium transition"
                :style="form.thinkingLevel === level
                  ? { borderColor: 'var(--nb-copper)', backgroundColor: 'var(--nb-copper-soft)', color: 'var(--nb-copper-deep)' }
                  : { borderColor: 'var(--nb-rule-strong)', backgroundColor: 'var(--nb-paper)', color: 'var(--nb-ink-mute)' }"
                @click="form.thinkingLevel = level"
              >
                {{ level }}
              </button>
            </div>
          </div>

          <!-- 测试结果 -->
          <div
            v-if="testResult"
            class="flex items-center gap-2 rounded-[3px] border px-3 py-2 text-[12px]"
            :style="testResult.success
              ? { borderColor: 'var(--nb-sage)', backgroundColor: 'var(--nb-sage-soft, rgba(167,201,165,0.12))', color: 'var(--nb-ink-mute)' }
              : { borderColor: 'var(--nb-clay)', backgroundColor: 'rgba(196,113,84,0.1)', color: 'var(--nb-clay)' }"
          >
            <span>{{ testResult.success ? '✓ ' : '✗ ' }}{{ testResult.message }}<template v-if="testResult.latencyMs"> · {{ testResult.latencyMs }}ms</template></span>
          </div>
        </div>

        <footer
          class="mt-5 flex items-center justify-between gap-2 border-t px-5 py-3"
          style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint);"
        >
          <button
            type="button"
            class="nb-focus inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
            style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
            :disabled="!canSubmit || testing"
            @click="runTest"
          >
            <Loader2 v-if="testing" :size="13" :stroke-width="2" class="animate-spin" />
            {{ testing ? '测试中…' : '测试连通性' }}
          </button>
          <div class="flex gap-2">
            <button
              class="nb-focus rounded-[3px] border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
              style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
              @click="cancel"
            >
              取消
            </button>
            <button
              class="nb-focus rounded-[3px] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              style="background-color: var(--nb-copper); border: 1px solid var(--nb-copper);"
              :disabled="!canSubmit"
              @click="commit"
            >
              {{ isEdit ? '保存' : '添加' }}
            </button>
          </div>
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
