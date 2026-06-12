<script setup lang="ts">
/**
 * PythonExecCard.vue
 *
 * §5.1.1 python_exec_inline / python_exec_file
 *
 * 三段式：代码（默认折叠）/ stdout（默认展开）/ stderr（仅有内容时显示）
 * stdout 限高 300px；超过时显示「全文展开」按钮。
 */

import { computed, ref } from 'vue'
import { Terminal, FileCode2, Code2 } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import type { PythonExecToolCall } from '../../types/messageStream'

const props = defineProps<{ tool: PythonExecToolCall }>()

const codeOpen = ref(false)
const stdoutExpanded = ref(false)
const stderrOpen = ref(false)

const STDOUT_HEIGHT_LIMIT = 300

const subtitle = computed(() =>
  props.tool.variant === 'file' ? props.tool.code : '内联代码片段',
)

const codePreview = computed(() => {
  if (props.tool.variant === 'file') return ''
  const lines = props.tool.code.split('\n')
  return lines.slice(0, 3).join('\n') + (lines.length > 3 ? `\n... (+${lines.length - 3} more)` : '')
})

const showStdoutToggle = computed(() => props.tool.stdout.length > 0)
const showStderr = computed(() => props.tool.stderr.length > 0 || props.tool.errorMessage)
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    :tool-name="`python_exec_${tool.variant}`"
    :subtitle="subtitle"
    :duration-ms="tool.durationMs"
  >
    <template #leadingIcon>
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink);"
      >
        <FileCode2 v-if="tool.variant === 'file'" :size="12" :stroke-width="1.6" />
        <Terminal v-else :size="12" :stroke-width="1.6" />
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <!-- 代码段（inline） -->
      <section
        v-if="tool.variant === 'inline'"
        class="rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card);"
      >
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 nb-mono text-[10px]"
          style="color: var(--nb-ink-mute); letter-spacing: 0.16em;"
          @click="codeOpen = !codeOpen"
        >
          <Code2 :size="11" :stroke-width="1.6" />
          <span style="font-weight: 700;">CODE</span>
          <span class="flex-1" />
          <span style="letter-spacing: 0.06em; color: var(--nb-ink-faint);">
            {{ tool.code.split('\n').length }} 行
          </span>
          <span
            class="font-sans"
            style="text-transform: none; letter-spacing: 0; color: var(--nb-ink-mute);"
          >
            {{ codeOpen ? '收起' : '展开' }}
          </span>
        </button>
        <pre
          v-if="codeOpen"
          class="overflow-x-auto border-t nb-mono px-3 py-2 text-[11.5px] leading-5"
          style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint); color: var(--nb-ink);"
        >{{ tool.code }}</pre>
        <pre
          v-else
          class="overflow-hidden border-t nb-mono px-3 py-1.5 text-[11px] leading-5"
          style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint); color: var(--nb-ink-mute);"
        >{{ codePreview }}</pre>
      </section>

      <!-- 文件路径段：variant=file -->
      <section
        v-else
        class="rounded-[3px] border px-3 py-1.5"
        style="border-color: var(--nb-rule); background-color: var(--nb-card);"
      >
        <div class="flex items-center gap-2.5 text-[11.5px]">
          <span
            class="nb-mono text-[10px]"
            style="color: var(--nb-ink-mute); letter-spacing: 0.16em; font-weight: 700;"
          >
            FILE
          </span>
          <span class="nb-mono" style="color: var(--nb-ink);">{{ tool.code }}</span>
        </div>
      </section>

      <!-- stdout -->
      <section
        v-if="showStdoutToggle"
        class="rounded-[3px] overflow-hidden border"
        style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint);"
      >
        <div
          class="flex items-center gap-2 px-2.5 py-1.5 nb-mono text-[10px]"
          style="color: var(--nb-ink-mute); letter-spacing: 0.16em; border-bottom: 1px solid var(--nb-rule);"
        >
          <Terminal :size="10" :stroke-width="1.6" />
          <span style="font-weight: 700;">STDOUT</span>
          <span class="flex-1" />
          <span class="nb-mono tabular-nums" style="font-weight: 400; letter-spacing: 0.04em;">
            {{ tool.stdout.length }} chars
          </span>
        </div>
        <div
          class="nb-scroll overflow-auto nb-mono px-3 py-2 text-[11.5px] leading-5"
          style="color: var(--nb-ink);"
          :style="{ maxHeight: stdoutExpanded ? 'none' : STDOUT_HEIGHT_LIMIT + 'px' }"
        >
          <pre class="whitespace-pre-wrap">{{ tool.stdout }}</pre>
        </div>
        <button
          v-if="tool.stdout.length > 800"
          class="block w-full border-t py-1 text-center nb-mono text-[10px] transition hover:opacity-100"
          style="
            border-color: var(--nb-rule);
            background-color: var(--nb-paper);
            color: var(--nb-ink-mute);
            letter-spacing: 0.14em;
            font-weight: 600;
          "
          @click="stdoutExpanded = !stdoutExpanded"
        >
          {{ stdoutExpanded ? '收起' : '全文展开' }}
        </button>
      </section>

      <!-- stderr -->
      <section
        v-if="showStderr"
        class="rounded-[3px] border"
        style="border-color: rgba(184, 84, 80, 0.3); background-color: var(--nb-clay-soft);"
      >
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 nb-mono text-[10px]"
          style="color: #8B3A37; letter-spacing: 0.16em;"
          @click="stderrOpen = !stderrOpen"
        >
          <span style="font-weight: 700;">STDERR</span>
          <span
            v-if="tool.errorType"
            class="font-sans nb-mono"
            style="text-transform: none; letter-spacing: 0.04em; font-weight: 700;"
          >
            · {{ tool.errorType }}
          </span>
          <span class="flex-1" />
          <span
            class="font-sans"
            style="text-transform: none; letter-spacing: 0; color: rgba(139, 58, 55, 0.7);"
          >
            {{ stderrOpen ? '收起' : '展开' }}
          </span>
        </button>
        <div
          v-if="stderrOpen"
          class="border-t px-3 py-2 nb-mono text-[11.5px] leading-5"
          style="border-color: rgba(184, 84, 80, 0.2); color: #6E2D2A;"
        >
          <pre class="whitespace-pre-wrap">{{ tool.stderr || tool.errorMessage }}</pre>
        </div>
      </section>
    </div>
  </ToolCardShell>
</template>
