<script setup lang="ts">
/**
 * AskUserCard.vue
 *
 * §5.2 ask_user：跟 grill-me AskUserQuestion 体验对齐。
 *
 * 视觉风格 ▸ 编辑稿征求意见信：暖色羊皮纸 + 铜色印章 + 印刷感选项。
 */

import { computed, ref } from 'vue'
import { HelpCircle, Sparkles, Check } from 'lucide-vue-next'
import type { AskUserBlock } from '../../types/messageStream'

const props = defineProps<{ block: AskUserBlock }>()

const emit = defineEmits<{
  submit: [payload: { optionId: string; text?: string }]
  cancel: []
}>()

const selectedId = ref<string | null>(null)
const customText = ref('')

const selectedOption = computed(() =>
  props.block.options.find((o) => o.id === selectedId.value) ?? null,
)

const isPending = computed(() => props.block.status === 'pending')

const canSubmit = computed(() => {
  if (!selectedId.value) return false
  const opt = selectedOption.value
  if (opt && (opt.id.includes('let-agent') === false) && opt.label.includes('自己定')) {
    return customText.value.trim().length > 0
  }
  if (props.block.allowFreeText && selectedId.value === '__free_text__') {
    return customText.value.trim().length > 0
  }
  return true
})

const onSubmit = () => {
  if (!canSubmit.value) return
  emit('submit', {
    optionId: selectedId.value!,
    text:
      selectedId.value === '__free_text__' || customText.value
        ? customText.value
        : undefined,
  })
}

const showFreeTextInput = computed(() => {
  if (selectedId.value === '__free_text__') return true
  const opt = selectedOption.value
  return !!opt?.label.includes('自己定')
})

const answeredOptionLabel = computed(() => {
  if (props.block.status !== 'answered') return ''
  if (props.block.answeredOptionId === '__free_text__') return '自由输入'
  return (
    props.block.options.find((o) => o.id === props.block.answeredOptionId)?.label ?? '已选择'
  )
})
</script>

<template>
  <div
    class="relative overflow-hidden rounded-[3px] border"
    :style="
      isPending
        ? {
            borderColor: 'rgba(204, 120, 92, 0.45)',
            backgroundColor: 'var(--nb-card)',
            boxShadow: '0 24px 50px -28px rgba(204, 120, 92, 0.45)',
          }
        : {
            borderColor: 'var(--nb-rule)',
            backgroundColor: 'var(--nb-card)',
          }
    "
  >
    <!-- 顶部铜色横条 -->
    <div
      v-if="isPending"
      style="height: 3px; background: linear-gradient(90deg, var(--nb-copper) 0%, var(--nb-copper-deep) 50%, var(--nb-copper) 100%);"
    />

    <!-- 头部 -->
    <header class="flex items-start gap-3 px-5 pt-4 pb-3">
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px]"
        :style="
          isPending
            ? { backgroundColor: 'var(--nb-copper)', color: 'white' }
            : { backgroundColor: 'var(--nb-paper-tint)', color: 'var(--nb-ink-mute)' }
        "
      >
        <HelpCircle :size="15" :stroke-width="1.6" />
      </span>
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span
            class="nb-eyebrow"
            style="font-size: 10px; letter-spacing: 0.26em;"
            :style="isPending ? { color: 'var(--nb-copper-deep)' } : { color: 'var(--nb-ink-faint)' }"
          >
            Query · Agent 想问你
          </span>
          <span
            v-if="!isPending"
            class="nb-chip"
            data-tone="sage"
            style="padding: 1px 7px; font-size: 9px;"
          >
            <Check :size="9" :stroke-width="2.4" />
            <span class="nb-mono" style="font-weight: 700; letter-spacing: 0.14em;">
              {{ block.status === 'answered' ? 'ANSWERED' : 'CANCELLED' }}
            </span>
          </span>
        </div>
        <p
          class="nb-display mt-1.5 text-[15px] font-medium leading-[1.55]"
          style="color: var(--nb-ink); letter-spacing: -0.005em;"
        >
          {{ block.question }}
        </p>
      </div>
    </header>

    <!-- 选项列表 -->
    <ul class="space-y-2 px-5">
      <li v-for="(opt, idx) in block.options" :key="opt.id">
        <button
          class="group relative flex w-full items-start gap-3 rounded-[3px] border bg-white px-3.5 py-2.5 text-left transition"
          :style="
            !isPending
              ? {
                  cursor: 'default',
                  borderColor: 'var(--nb-rule)',
                  opacity: 0.7,
                }
              : selectedId === opt.id
              ? {
                  borderColor: 'var(--nb-copper)',
                  backgroundColor: 'var(--nb-copper-soft)',
                  boxShadow: '0 4px 16px -8px rgba(204, 120, 92, 0.5)',
                }
              : { borderColor: 'var(--nb-rule)' }
          "
          :disabled="!isPending"
          @click="isPending && (selectedId = opt.id)"
          @mouseenter="(e) => {
            if (isPending && selectedId !== opt.id) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(204, 120, 92, 0.4)';
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-paper-tint)'
            }
          }"
          @mouseleave="(e) => {
            if (isPending && selectedId !== opt.id) {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--nb-rule)';
              (e.currentTarget as HTMLElement).style.backgroundColor = 'white'
            }
          }"
        >
          <!-- 罗马字母编号（A/B/C） -->
          <span
            class="nb-mono mt-0.5 w-5 shrink-0 text-[11px]"
            :style="
              selectedId === opt.id
                ? { color: 'var(--nb-copper-deep)', fontWeight: 700 }
                : { color: 'var(--nb-ink-faint)', fontWeight: 700 }
            "
            style="letter-spacing: 0.08em;"
          >
            {{ String.fromCharCode(65 + idx) }}.
          </span>

          <!-- 单选圆 -->
          <span
            class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition"
            :style="
              selectedId === opt.id
                ? { borderColor: 'var(--nb-copper)', backgroundColor: 'var(--nb-copper)' }
                : { borderColor: 'var(--nb-rule-strong)', backgroundColor: 'white' }
            "
          >
            <span
              v-if="selectedId === opt.id"
              class="h-1.5 w-1.5 rounded-full bg-white"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span
                class="text-[13px] font-medium"
                style="color: var(--nb-ink);"
              >
                {{ opt.label }}
              </span>
              <span
                v-if="opt.recommended"
                class="nb-chip"
                data-tone="copper"
                style="padding: 1px 7px; font-size: 9px;"
              >
                <Sparkles :size="9" :stroke-width="2" />
                <span class="nb-mono" style="font-weight: 700; letter-spacing: 0.14em;">
                  推荐
                </span>
              </span>
            </div>
            <div
              v-if="opt.detail"
              class="nb-display-italic mt-0.5 text-[12.5px] leading-[1.55]"
              style="color: var(--nb-ink-mute);"
            >
              {{ opt.detail }}
            </div>
          </div>
        </button>
      </li>

      <li v-if="block.allowFreeText && isPending">
        <button
          class="flex w-full items-center gap-3 rounded-[3px] border-[1.5px] border-dashed bg-white/60 px-3.5 py-2.5 text-left transition"
          :style="
            selectedId === '__free_text__'
              ? { borderColor: 'var(--nb-copper)', backgroundColor: 'var(--nb-copper-soft)' }
              : { borderColor: 'var(--nb-rule-strong)' }
          "
          @click="selectedId = '__free_text__'"
        >
          <span
            class="nb-mono mt-0.5 w-5 shrink-0 text-[11px]"
            :style="
              selectedId === '__free_text__'
                ? { color: 'var(--nb-copper-deep)', fontWeight: 700 }
                : { color: 'var(--nb-ink-faint)', fontWeight: 700 }
            "
            style="letter-spacing: 0.08em;"
          >
            ⌘.
          </span>
          <span
            class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition"
            :style="
              selectedId === '__free_text__'
                ? { borderColor: 'var(--nb-copper)', backgroundColor: 'var(--nb-copper)' }
                : { borderColor: 'var(--nb-rule-strong)', backgroundColor: 'white' }
            "
          >
            <span
              v-if="selectedId === '__free_text__'"
              class="h-1.5 w-1.5 rounded-full bg-white"
            />
          </span>
          <span class="text-[13px] font-medium" style="color: var(--nb-ink);">
            自由输入
          </span>
          <span class="nb-display-italic text-[11.5px]" style="color: var(--nb-ink-faint);">
            告诉 Agent 你具体想怎么做
          </span>
        </button>
      </li>
    </ul>

    <!-- 自由文本输入 -->
    <div v-if="isPending && showFreeTextInput" class="px-5 pt-3">
      <textarea
        v-model="customText"
        rows="2"
        class="nb-focus block w-full resize-none rounded-[3px] border bg-white px-3 py-2 text-[13px] leading-5 outline-none transition"
        style="
          border-color: var(--nb-rule-strong);
          color: var(--nb-ink);
          font-family: var(--nb-font-sans);
        "
        placeholder="把你的偏好告诉 Agent…"
      />
    </div>

    <!-- 已回答态总结 -->
    <div
      v-if="!isPending"
      class="border-t px-5 py-3"
      style="border-color: var(--nb-rule);"
    >
      <div class="flex items-center justify-between gap-3 text-[12px]">
        <div class="flex items-center gap-2" style="color: var(--nb-ink-mute);">
          <Check :size="13" :stroke-width="2" style="color: var(--nb-sage);" />
          <span>已选择</span>
          <span class="nb-display-italic" style="color: var(--nb-ink); font-weight: 500;">
            {{ answeredOptionLabel }}
          </span>
        </div>
        <span
          v-if="block.answeredText"
          class="truncate nb-mono text-[11px]"
          style="color: var(--nb-ink-mute);"
        >
          "{{ block.answeredText }}"
        </span>
      </div>
    </div>

    <!-- 操作 -->
    <footer
      v-if="isPending"
      class="mt-4 flex items-center justify-end gap-2 border-t px-5 py-3"
      style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint);"
    >
      <button
        class="nb-focus rounded-[3px] border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
        style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="nb-focus inline-flex items-center gap-1.5 rounded-[3px] px-4 py-1.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed"
        :style="
          canSubmit
            ? { backgroundColor: 'var(--nb-copper)', border: '1px solid var(--nb-copper)' }
            : {
                backgroundColor: 'var(--nb-paper-tint)',
                border: '1px solid var(--nb-rule)',
                color: 'var(--nb-ink-faint)',
              }
        "
        :disabled="!canSubmit"
        @click="onSubmit"
      >
        <Check :size="12" :stroke-width="2.2" />
        确认
      </button>
    </footer>
  </div>
</template>
