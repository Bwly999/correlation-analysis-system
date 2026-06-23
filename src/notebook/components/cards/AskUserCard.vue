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
import { renderMarkdownSafe } from '../../preview/markdownRenderer'

const props = defineProps<{ block: AskUserBlock }>()

const emit = defineEmits<{
  submit: [payload: { optionIds: string[]; text?: string }]
  cancel: []
}>()

/** 自由输入选项的虚拟 id（与 options 同为字符串 id 命名空间） */
const FREE_TEXT_ID = '__free_text__'

const isMultiSelect = computed(() => Boolean(props.block.multiSelect))
const isPending = computed(() => props.block.status === 'pending')

/** 选中集合：单选语义下点击会覆盖为单元素数组 */
const selectedIds = ref<string[]>([])
const customText = ref('')

const isSelected = (id: string) => selectedIds.value.includes(id)

/** 点击选项：单选=覆盖，多选=增删；自由文本项独立（不可与普通选项同选） */
const toggleOption = (id: string) => {
  if (!isPending.value) return
  if (id === FREE_TEXT_ID) {
    selectedIds.value = [FREE_TEXT_ID]
    return
  }
  if (isMultiSelect.value) {
    selectedIds.value = selectedIds.value.filter((s) => s !== FREE_TEXT_ID)
    selectedIds.value = isSelected(id)
      ? selectedIds.value.filter((s) => s !== id)
      : [...selectedIds.value, id]
  } else {
    selectedIds.value = [id]
  }
}

/** 自由文本框：选中了自由文本项，或单选+自定义文案时显示 */
const showFreeTextInput = computed(() => isSelected(FREE_TEXT_ID))

const canSubmit = computed(() => {
  if (selectedIds.value.length === 0) return false
  if (isSelected(FREE_TEXT_ID)) {
    return customText.value.trim().length > 0
  }
  return true
})

const onSubmit = () => {
  if (!canSubmit.value) return
  emit('submit', {
    optionIds: [...selectedIds.value],
    text: isSelected(FREE_TEXT_ID) ? customText.value : undefined,
  })
}

/** 问题正文 markdown：约束内联元素样式，不引入大标题块级样式 */
const renderedQuestion = computed(() => renderMarkdownSafe(props.block.question))

const answeredOptionLabel = computed(() => {
  if (props.block.status !== 'answered') return ''
  const ids = props.block.answeredOptionIds ?? []
  if (ids.includes(FREE_TEXT_ID)) return '自由输入'
  if (ids.length === 0) return '已选择'
  const labels = ids.map((id) => props.block.options.find((o) => o.id === id)?.label).filter(Boolean)
  return labels.length > 0 ? labels.join('、') : '已选择'
})
</script>

<template>
  <div
    class="relative overflow-hidden rounded-[var(--nb-radius-sm)] border"
    :style="
      isPending
        ? {
            borderColor: 'rgba(199, 107, 74, 0.45)',
            backgroundColor: 'var(--nb-card)',
            boxShadow: 'var(--nb-shadow-copper)',
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
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--nb-radius-sm)]"
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
        <div
          class="nb-display mt-1.5 text-[15px] font-medium leading-[1.55] [&_a]:text-[var(--nb-copper-deep)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--nb-paper-tint)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.86em] [&_li]:my-0 [&_ol]:my-1 [&_ol]:pl-4 [&_p]:my-0 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:pl-4"
          style="color: var(--nb-ink); letter-spacing: -0.005em;"
          v-html="renderedQuestion"
        />
      </div>
    </header>

    <!-- 选项列表 -->
    <ul class="space-y-2 px-5">
      <li v-for="(opt, idx) in block.options" :key="opt.id">
        <button
          class="group relative flex w-full items-start gap-3 rounded-[var(--nb-radius-sm)] border bg-white px-3.5 py-2.5 text-left transition"
          :style="
            !isPending
              ? {
                  cursor: 'default',
                  borderColor: 'var(--nb-rule)',
                  opacity: 0.7,
                }
              : isSelected(opt.id)
              ? {
                  borderColor: 'var(--nb-copper)',
                  backgroundColor: 'var(--nb-copper-soft)',
                  boxShadow: '0 4px 16px -8px rgba(199, 107, 74, 0.5)',
                }
              : { borderColor: 'var(--nb-rule)' }
          "
          :disabled="!isPending"
          @click="toggleOption(opt.id)"
          @mouseenter="(e) => {
            if (isPending && !isSelected(opt.id)) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(199, 107, 74, 0.4)';
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-paper-tint)'
            }
          }"
          @mouseleave="(e) => {
            if (isPending && !isSelected(opt.id)) {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--nb-rule)';
              (e.currentTarget as HTMLElement).style.backgroundColor = 'white'
            }
          }"
        >
          <!-- 罗马字母编号（A/B/C） -->
          <span
            class="nb-mono mt-0.5 w-5 shrink-0 text-[11px]"
            :style="
              isSelected(opt.id)
                ? { color: 'var(--nb-copper-deep)', fontWeight: 700 }
                : { color: 'var(--nb-ink-faint)', fontWeight: 700 }
            "
            style="letter-spacing: 0.08em;"
          >
            {{ String.fromCharCode(65 + idx) }}.
          </span>

          <!-- 选中标记：单选=圆点 radio，多选=方框 checkbox -->
          <span
            class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border-2 transition"
            :class="isMultiSelect ? 'rounded-[3px]' : 'rounded-full'"
            :style="
              isSelected(opt.id)
                ? { borderColor: 'var(--nb-copper)', backgroundColor: 'var(--nb-copper)' }
                : { borderColor: 'var(--nb-rule-strong)', backgroundColor: 'white' }
            "
          >
            <Check
              v-if="isSelected(opt.id) && isMultiSelect"
              :size="11"
              :stroke-width="3"
              class="text-white"
            />
            <span
              v-else-if="isSelected(opt.id)"
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
          class="flex w-full items-center gap-3 rounded-[var(--nb-radius-sm)] border-[1.5px] border-dashed bg-white/60 px-3.5 py-2.5 text-left transition"
          :style="
            isSelected(FREE_TEXT_ID)
              ? { borderColor: 'var(--nb-copper)', backgroundColor: 'var(--nb-copper-soft)' }
              : { borderColor: 'var(--nb-rule-strong)' }
          "
          @click="toggleOption(FREE_TEXT_ID)"
        >
          <span
            class="nb-mono mt-0.5 w-5 shrink-0 text-[11px]"
            :style="
              isSelected(FREE_TEXT_ID)
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
              isSelected(FREE_TEXT_ID)
                ? { borderColor: 'var(--nb-copper)', backgroundColor: 'var(--nb-copper)' }
                : { borderColor: 'var(--nb-rule-strong)', backgroundColor: 'white' }
            "
          >
            <span
              v-if="isSelected(FREE_TEXT_ID)"
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
        class="nb-focus block w-full resize-none rounded-[var(--nb-radius-sm)] border bg-white px-3 py-2 text-[13px] leading-5 outline-none transition"
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
        class="nb-focus rounded-[var(--nb-radius-sm)] border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
        style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="nb-focus inline-flex items-center gap-1.5 rounded-[var(--nb-radius-sm)] px-4 py-1.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed"
        :style="
          canSubmit
            ? { backgroundColor: 'var(--nb-copper)', border: '1px solid var(--nb-copper)', boxShadow: 'var(--nb-shadow-sm)' }
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
