<script setup lang="ts">
/**
 * PocApp.vue（原 App.vue 的 PoC v0 内容）
 *
 * 红队验证 + 自由 Python 输入 + 主机日志。
 * 通过 ?demo=poc 走到这里；未在主路径展示。
 */
import { onMounted, ref, computed } from 'vue'
import { WorkerHost, type ExecResult } from './runtime/workerHost'

interface RedTeamCase {
  id: string
  title: string
  description: string
  code: string
  expect: 'pass' | 'block' | 'timeout-then-interrupt'
  expectMatch: RegExp
}

const cases: RedTeamCase[] = [
  {
    id: 'pandas',
    title: '✅ pandas describe',
    description: '验证 pyodide + pandas 链路通畅',
    code: `
import pandas as pd
df = pd.DataFrame({"a": [1,2,3,4], "b": [10,20,30,40]})
print(df.describe().to_string())
`.trim(),
    expect: 'pass',
    expectMatch: /mean\s+2\.5/,
  },
  {
    id: 'jsglobals',
    title: '🛡 from js import 阻断',
    description: 'jsglobals 锁定后 process / fetch 必须不可达',
    code: `
try:
    from js import fetch  # type: ignore
    print("LEAK: fetch is reachable")
except ImportError as e:
    print("BLOCKED:", e)
try:
    from js import importScripts  # type: ignore
    print("LEAK: importScripts is reachable")
except ImportError as e:
    print("BLOCKED:", e)
`.trim(),
    expect: 'block',
    expectMatch: /BLOCKED/,
  },
  {
    id: 'cpu-loop',
    title: '⏱ while True 中断',
    description: '点完执行后立刻按"中断"按钮，应在 5s 内被打断',
    code: `
import time
i = 0
t0 = time.time()
while True:
    i += 1
    if i % 10000 == 0:
        pass
    if time.time() - t0 > 30:
        print("ERROR: not interrupted in 30s")
        break
`.trim(),
    expect: 'timeout-then-interrupt',
    expectMatch: /KeyboardInterrupt|interrupted/i,
  },
  {
    id: 'coi',
    title: '🌐 COI 头部',
    description: '验证页面已进入 cross-origin isolated 状态',
    code: `
print("placeholder — COI 状态由前端 host 直接读取，不在 Python 侧验证")
`.trim(),
    expect: 'pass',
    expectMatch: /placeholder/,
  },
]

const host = new WorkerHost()
const log = ref('')
const editorCode = ref(`import pandas as pd, numpy as np
df = pd.DataFrame({"a": np.random.randn(5)})
print(df)
`)
const lastResult = ref<ExecResult | null>(null)
const caseStatus = ref<Record<string, 'pending' | 'running' | 'pass' | 'fail'>>({})

const append = (line: string) => {
  log.value += line + '\n'
}

onMounted(async () => {
  append('[host] crossOriginIsolated = ' + (globalThis.crossOriginIsolated ?? 'undefined'))
  append('[host] SharedArrayBuffer = ' + (typeof SharedArrayBuffer !== 'undefined'))
  append('[host] 正在启动 Worker + Pyodide ...')
  try {
    const info = await host.init('/pyodide/v0.27/')
    append(`[host] ✅ pyodide ${info.pyodideVersion} 就绪`)
    append(`[host] crossOriginIsolated=${info.crossOriginIsolated} sabSupported=${info.sabSupported}`)
  } catch (err) {
    append('[host] ❌ 初始化失败: ' + (err instanceof Error ? err.message : String(err)))
  }
})

const runCode = async (code: string, label: string): Promise<ExecResult> => {
  append(`\n=== ▶ ${label} ===`)
  const result = await host.exec(code)
  lastResult.value = result
  if (result.stdout) append('[stdout]\n' + result.stdout.trimEnd())
  if (result.stderr) append('[stderr]\n' + result.stderr.trimEnd())
  if (result.errorType) append(`[error:${result.errorType}] ${result.errorMessage ?? ''}`)
  append(`[done] ${result.durationMs}ms ok=${result.ok}`)
  return result
}

const runCase = async (c: RedTeamCase) => {
  caseStatus.value[c.id] = 'running'
  const result = await runCode(c.code, c.title)
  let pass = false
  if (c.expect === 'pass') {
    pass = result.ok && c.expectMatch.test(result.stdout)
  } else if (c.expect === 'block') {
    pass = c.expectMatch.test(result.stdout) && !/LEAK/.test(result.stdout)
  } else if (c.expect === 'timeout-then-interrupt') {
    pass =
      !result.ok &&
      (result.errorType === 'interrupted' ||
        c.expectMatch.test(result.errorMessage ?? '') ||
        c.expectMatch.test(result.stderr))
  }
  caseStatus.value[c.id] = pass ? 'pass' : 'fail'
  append(`[verdict] ${c.id} → ${pass ? '✅ PASS' : '❌ FAIL'}`)
}

const interrupt = () => {
  const ok = host.interrupt()
  append(ok ? '[host] 🟡 已发送 SIGINT' : '[host] ⚠️ 中断未生效（SAB 不可用？）')
}
const hardKill = () => {
  host.hardKill()
  append('[host] 🔴 Worker 已被 terminate')
}
const clearLog = () => {
  log.value = ''
  caseStatus.value = {}
}
const runFreeForm = () => {
  void runCode(editorCode.value, 'free-form')
}

const statusBadge = (status: string | undefined) => {
  switch (status) {
    case 'pass':
      return { text: 'PASS', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' }
    case 'fail':
      return { text: 'FAIL', cls: 'bg-rose-100 text-rose-700 border-rose-300' }
    case 'running':
      return { text: 'RUN', cls: 'bg-amber-100 text-amber-700 border-amber-300' }
    default:
      return { text: '—', cls: 'bg-slate-100 text-slate-500 border-slate-300' }
  }
}

const hostBadge = computed(() => {
  switch (host.state.status) {
    case 'idle':
      return { text: '空闲', cls: 'bg-slate-100 text-slate-700' }
    case 'booting':
      return { text: `启动中：${host.state.bootStage}`, cls: 'bg-amber-100 text-amber-800' }
    case 'ready':
      return { text: `就绪 · pyodide ${host.state.pyodideVersion}`, cls: 'bg-emerald-100 text-emerald-700' }
    case 'busy':
      return { text: '执行中', cls: 'bg-blue-100 text-blue-700' }
    case 'dead':
      return { text: '内核已死', cls: 'bg-rose-100 text-rose-700' }
  }
  return { text: '?', cls: 'bg-slate-100' }
})
</script>

<template>
  <div class="flex h-full w-full flex-col bg-slate-50 text-slate-900">
    <header class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div class="flex items-center gap-3">
        <div class="text-base font-semibold tracking-tight text-slate-900">Notebook Agent · PoC v0</div>
        <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="hostBadge.cls">{{ hostBadge.text }}</span>
        <span
          v-if="host.state.crossOriginIsolated"
          class="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
        >COI ✓</span>
        <span
          v-else
          class="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
        >COI ✗</span>
        <span
          v-if="host.state.sabSupported"
          class="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
        >SAB ✓</span>
        <span
          v-else
          class="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
        >SAB ✗</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
          @click="interrupt"
        >中断 (SIGINT)</button>
        <button
          class="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100"
          @click="hardKill"
        >强制终止</button>
        <button
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="clearLog"
        >清空日志</button>
      </div>
    </header>
    <div class="grid h-full min-h-0 flex-1 grid-cols-2 gap-4 p-4">
      <div class="flex min-h-0 flex-col gap-4">
        <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div class="mb-3 text-sm font-semibold text-slate-900">红队验证</div>
          <ul class="space-y-2">
            <li
              v-for="c in cases"
              :key="c.id"
              class="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50/40 p-3"
            >
              <button
                class="rounded-md border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:border-slate-300"
                :disabled="host.state.status !== 'ready' && host.state.status !== 'busy'"
                @click="runCase(c)"
              >执行</button>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-slate-900">{{ c.title }}</span>
                  <span class="rounded-full border px-1.5 py-0.5 text-[10px] font-mono" :class="statusBadge(caseStatus[c.id]).cls">{{ statusBadge(caseStatus[c.id]).text }}</span>
                </div>
                <div class="mt-0.5 text-xs text-slate-500">{{ c.description }}</div>
              </div>
            </li>
          </ul>
        </section>
        <section class="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold text-slate-900">自由 Python（无状态）</div>
            <button
              class="rounded-md border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:border-slate-300"
              :disabled="host.state.status !== 'ready'"
              @click="runFreeForm"
            >执行</button>
          </div>
          <textarea
            v-model="editorCode"
            class="flex-1 min-h-0 resize-none rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
            spellcheck="false"
          ></textarea>
        </section>
      </div>
      <section class="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-slate-900 p-4 shadow-sm">
        <div class="mb-2 text-sm font-semibold text-slate-100">运行日志</div>
        <pre class="flex-1 overflow-auto rounded-md bg-slate-950/40 p-3 font-mono text-xs leading-relaxed text-slate-200">{{ log || '（等待执行）' }}</pre>
      </section>
    </div>
  </div>
</template>
