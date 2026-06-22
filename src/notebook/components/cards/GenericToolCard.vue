<script setup lang="ts">
/**
 * GenericToolCard.vue
 *
 * 通用兜底工具卡片：未提供专用卡片的工具（如 python_packages，及未来新增工具）
 * 都走这里。展示原始 params + result，保证总有可见的 Tool 块，前端零改动接入新工具。
 *
 * 想给某工具更好 UX 时，再补专用卡片做渐进增强，不影响本兜底。
 */
import { computed } from 'vue'
import { Wrench, AlertTriangle } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import type { GenericToolCall } from '../../types/messageStream'

const props = defineProps<{ tool: GenericToolCall }>()

/** 取首个有意义的参数作为副标题（action / path / pattern / packages 等常见字段） */
const subtitle = computed(() => {
  const p = props.tool.params ?? {}
  for (const key of ['action', 'path', 'pattern', 'packages']) {
    const v = p[key]
    if (v == null) continue
    const text = Array.isArray(v) ? v.join(', ') : String(v)
    if (text) return text
  }
  return ''
})

/** 把 result 字符串 parse 成美化的 JSON；失败则原样返回 */
const formattedResult = computed(() => {
  const raw = props.tool.result
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
})

const hasResult = computed(() => Boolean(props.tool.result))
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    :tool-name="tool.toolName"
    :subtitle="subtitle"
    :duration-ms="tool.durationMs"
  >
    <template #leadingIcon>
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink);"
      >
        <Wrench :size="12" :stroke-width="1.6" />
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <!-- 失败态：强调错误信息 -->
      <div
        v-if="tool.status === 'failed'"
        class="rounded-[3px] border px-3 py-2 text-[12px]"
        style="border-color: rgba(184, 84, 80, 0.3); background-color: var(--nb-clay-soft); color: #8B3A37;"
      >
        <div class="flex items-start gap-2">
          <AlertTriangle :size="13" :stroke-width="1.6" class="mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="font-medium">调用失败</div>
            <pre
              v-if="tool.errorMessage"
              class="mt-0.5 nb-mono text-[11px] leading-5 whitespace-pre-wrap"
              style="color: #6E2D2A;"
            >{{ tool.errorMessage }}</pre>
          </div>
        </div>
      </div>

      <!-- 成功态：美化展示 result（限高滚动，避免撑爆对话区） -->
      <pre
        v-else-if="hasResult"
        class="nb-scroll overflow-auto rounded-[3px] border nb-mono px-3 py-2 text-[11.5px] leading-5 whitespace-pre-wrap"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink-soft); max-height: 300px;"
      >{{ formattedResult }}</pre>

      <!-- running 态：result 还没回来 -->
      <div
        v-else
        class="text-[12px]"
        style="color: var(--nb-ink-mute);"
      >
        调用中…
      </div>
    </div>
  </ToolCardShell>
</template>
