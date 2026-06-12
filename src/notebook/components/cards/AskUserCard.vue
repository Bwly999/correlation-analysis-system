<script setup lang="ts">
/**
 * AskUserCard.vue
 *
 * §5.2 ask_user：跟 grill-me AskUserQuestion 体验对齐。
 *   - 蓝色边框 + 渐变蓝背景，区别于普通工具卡
 *   - 推荐项右上 "推荐" 角标
 *   - "你自己定" 选项点击后唤出文本框
 *   - 用户没回答时：上层把输入框置 disabled
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
  // 选了"自己定"必须填文本
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
    class="relative overflow-hidden rounded-2xl border-[1.5px] shadow-[0_24px_60px_-30px_rgba(37,99,235,0.5)]"
    :class="[
      isPending
        ? 'border-blue-400 bg-gradient-to-br from-blue-50/90 via-white to-sky-50/80'
        : 'border-slate-200 bg-white',
    ]"
  >
    <!-- 头部光晕条 -->
    <div
      v-if="isPending"
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"
    />

    <!-- 头部 -->
    <header class="flex items-start gap-3 px-4 pt-4 pb-3">
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white shadow-sm"
        :class="isPending ? 'border-blue-300 text-blue-600' : 'border-slate-200 text-slate-500'"
      >
        <HelpCircle :size="16" />
      </span>
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.18em]"
            :class="isPending ? 'text-blue-600' : 'text-slate-400'"
          >
            Agent 想问你
          </span>
          <span
            v-if="!isPending"
            class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
          >
            <Check :size="10" />
            {{ block.status === 'answered' ? '已回答' : '已取消' }}
          </span>
        </div>
        <p class="mt-1 text-[13px] leading-6 text-slate-800">
          {{ block.question }}
        </p>
      </div>
    </header>

    <!-- 选项列表 -->
    <ul class="space-y-2 px-4">
      <li
        v-for="opt in block.options"
        :key="opt.id"
      >
        <button
          class="group relative flex w-full items-start gap-3 rounded-xl border-[1.5px] bg-white px-3.5 py-2.5 text-left transition"
          :class="[
            !isPending
              ? 'cursor-default border-slate-200 opacity-80'
              : selectedId === opt.id
              ? 'border-blue-500 shadow-[0_8px_24px_-16px_rgba(37,99,235,0.7)]'
              : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/40',
          ]"
          :disabled="!isPending"
          @click="isPending && (selectedId = opt.id)"
        >
          <!-- 单选圆 -->
          <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition"
            :class="[
              selectedId === opt.id
                ? 'border-blue-500 bg-blue-500 ring-4 ring-blue-100'
                : 'border-slate-300 bg-white',
            ]"
          >
            <span
              v-if="selectedId === opt.id"
              class="h-1.5 w-1.5 rounded-full bg-white"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[13px] font-medium text-slate-800">{{ opt.label }}</span>
              <span
                v-if="opt.recommended"
                class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700"
              >
                <Sparkles :size="9" />
                推荐
              </span>
            </div>
            <div v-if="opt.detail" class="mt-0.5 text-[12px] leading-5 text-slate-500">
              {{ opt.detail }}
            </div>
          </div>
        </button>
      </li>

      <li v-if="block.allowFreeText && isPending">
        <button
          class="flex w-full items-center gap-3 rounded-xl border-[1.5px] border-dashed bg-white/60 px-3.5 py-2.5 text-left transition"
          :class="
            selectedId === '__free_text__'
              ? 'border-blue-400 bg-blue-50/40'
              : 'border-slate-300 hover:border-blue-300 hover:bg-blue-50/40'
          "
          @click="selectedId = '__free_text__'"
        >
          <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition"
            :class="
              selectedId === '__free_text__'
                ? 'border-blue-500 bg-blue-500 ring-4 ring-blue-100'
                : 'border-slate-300 bg-white'
            "
          >
            <span v-if="selectedId === '__free_text__'" class="h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          <span class="text-[13px] font-medium text-slate-700">自由输入</span>
          <span class="text-[11px] text-slate-400">告诉 Agent 你具体想怎么做</span>
        </button>
      </li>
    </ul>

    <!-- 自由文本输入 -->
    <div v-if="isPending && showFreeTextInput" class="px-4 pt-3">
      <textarea
        v-model="customText"
        rows="2"
        class="block w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] leading-5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        placeholder="把你的偏好告诉 Agent…"
      />
    </div>

    <!-- 已回答态总结 -->
    <div v-if="!isPending" class="border-t border-slate-100 px-4 py-3 text-[12px]">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-slate-500">
          <Check :size="13" class="text-emerald-500" />
          <span>已选择：</span>
          <span class="font-medium text-slate-800">{{ answeredOptionLabel }}</span>
        </div>
        <span v-if="block.answeredText" class="truncate font-mono text-[11.5px] text-slate-500">
          "{{ block.answeredText }}"
        </span>
      </div>
    </div>

    <!-- 操作 -->
    <footer
      v-if="isPending"
      class="mt-4 flex items-center justify-end gap-2 border-t border-blue-100/60 bg-white/60 px-4 py-3"
    >
      <button
        class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_20px_-12px_rgba(37,99,235,0.8)] transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        :disabled="!canSubmit"
        @click="onSubmit"
      >
        <Check :size="13" />
        确认
      </button>
    </footer>
  </div>
</template>
