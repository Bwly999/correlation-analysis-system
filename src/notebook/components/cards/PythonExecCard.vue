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
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700">
        <FileCode2 v-if="tool.variant === 'file'" :size="13" />
        <Terminal v-else :size="13" />
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <!-- 代码段 -->
      <section v-if="tool.variant === 'inline'" class="rounded-lg border border-slate-200/80 bg-white">
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-slate-500"
          @click="codeOpen = !codeOpen"
        >
          <Code2 :size="11" />
          <span>code</span>
          <span class="font-sans normal-case font-medium text-slate-400">
            {{ codeOpen ? '收起' : '展开' }}
          </span>
          <span class="flex-1" />
          <span class="text-[10px] text-slate-400">{{ tool.code.split('\n').length }} 行</span>
        </button>
        <pre
          v-if="codeOpen"
          class="overflow-x-auto border-t border-slate-100 bg-slate-950 px-3 py-2 font-mono text-[11.5px] leading-5 text-slate-100"
        >{{ tool.code }}</pre>
        <pre
          v-else
          class="overflow-hidden border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 font-mono text-[11px] leading-5 text-slate-400"
        >{{ codePreview }}</pre>
      </section>

      <!-- 文件路径段：variant=file -->
      <section v-else class="rounded-lg border border-slate-200/80 bg-white px-3 py-1.5">
        <div class="flex items-center gap-2 text-[11.5px]">
          <span class="font-mono uppercase tracking-[0.14em] text-[10px] text-slate-500">file</span>
          <span class="font-mono text-slate-800">{{ tool.code }}</span>
        </div>
      </section>

      <!-- stdout -->
      <section v-if="showStdoutToggle" class="rounded-lg border border-slate-200/80 bg-slate-950">
        <div class="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-slate-400">
          <Terminal :size="11" />
          <span>stdout</span>
          <span class="flex-1" />
          <span class="font-sans normal-case font-medium text-slate-400 tabular-nums">
            {{ tool.stdout.length }} chars
          </span>
        </div>
        <div
          class="overflow-auto border-t border-slate-800/60 px-3 py-2 font-mono text-[11.5px] leading-5 text-slate-100"
          :style="{ maxHeight: stdoutExpanded ? 'none' : STDOUT_HEIGHT_LIMIT + 'px' }"
        >
          <pre class="whitespace-pre-wrap">{{ tool.stdout }}</pre>
        </div>
        <button
          v-if="tool.stdout.length > 800"
          class="block w-full border-t border-slate-800/60 bg-slate-900 py-1 text-center text-[11px] font-medium text-slate-400 hover:text-slate-200"
          @click="stdoutExpanded = !stdoutExpanded"
        >
          {{ stdoutExpanded ? '收起' : '全文展开' }}
        </button>
      </section>

      <!-- stderr / 错误 -->
      <section v-if="showStderr" class="rounded-lg border border-rose-200 bg-rose-50/60">
        <button
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-rose-700"
          @click="stderrOpen = !stderrOpen"
        >
          <span>stderr</span>
          <span v-if="tool.errorType" class="font-sans normal-case font-semibold text-rose-700">
            · {{ tool.errorType }}
          </span>
          <span class="flex-1" />
          <span class="font-sans normal-case font-medium text-rose-500">
            {{ stderrOpen ? '收起' : '展开' }}
          </span>
        </button>
        <div v-if="stderrOpen" class="border-t border-rose-200/70 px-3 py-2 font-mono text-[11.5px] leading-5 text-rose-800">
          <pre class="whitespace-pre-wrap">{{ tool.stderr || tool.errorMessage }}</pre>
        </div>
      </section>
    </div>
  </ToolCardShell>
</template>
