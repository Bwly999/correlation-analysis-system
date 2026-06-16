<script setup lang="ts">
/**
 * NotebookFrame.vue
 *
 * 主站全屏覆盖容器，挂 /notebook.html iframe。
 *
 * 职责：
 *   - 渲染 iframe，src=/notebook.html?session={sessionId}
 *   - 通过 useNotebookSession 完成 handshake + 灌入数据
 *   - 顶栏暴露 关闭 / 重启 / 下载 三个按钮（M1 关闭按钮即可，其他后续接入）
 *   - 失败状态显示 retry
 */
import { ref, computed } from 'vue'
import { useNotebookSession } from './useNotebookSession'
import type { CsvImport } from './dataSourceCsv'

const props = defineProps<{
  sessionId: string
  /** 用户选择的数据源 + meta；交由 iframe 写到 inputs/upstream.csv */
  initialData: CsvImport
  /** 主站 origin；同源时填具体 origin，跨域时浏览器会拒绝 */
  origin?: string
}>()

const emit = defineEmits<{
  close: []
  workspaceChanged: [paths: string[]]
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)

const session = useNotebookSession({
  iframeRef,
  sessionId: props.sessionId,
  origin: props.origin ?? window.location.origin,
  initialData: props.initialData,
  onWorkspaceChanged: (paths) => emit('workspaceChanged', paths),
  onUnloadConfirm: () => {
    void onClose()
  },
})

const iframeSrc = computed(() => `/notebook.html?session=${encodeURIComponent(props.sessionId)}`)

const onClose = async () => {
  try {
    await session.requestClose('user_clicked_close')
  } finally {
    session.dispose()
    emit('close')
  }
}

const stateLabel = computed(() => {
  switch (session.state.value) {
    case 'loading_pyodide':
      return { text: '准备 Python 环境…', cls: 'bg-amber-100 text-amber-800' }
    case 'ready':
      return { text: '就绪', cls: 'bg-emerald-100 text-emerald-700' }
    case 'agent_running':
      return { text: 'Agent 运行中', cls: 'bg-blue-100 text-blue-700' }
    case 'agent_idle':
      return { text: 'Agent 空闲', cls: 'bg-slate-100 text-slate-700' }
    case 'failed':
      return { text: '加载失败', cls: 'bg-rose-100 text-rose-700' }
  }
  return { text: '?', cls: 'bg-slate-100' }
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[2000] flex flex-col bg-slate-50">
      <header
        class="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4"
      >
        <div class="flex items-center gap-3">
          <button
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="关闭笔记本"
            @click="onClose"
          >
            ← 关闭笔记本
          </button>
          <span class="text-sm font-semibold text-slate-900">📓 AI 分析笔记本</span>
          <span
            class="rounded-full border px-2 py-0.5 text-xs font-medium"
            :class="stateLabel.cls"
          >{{ stateLabel.text }}</span>
        </div>
      </header>

      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="h-full w-full flex-1 border-0 bg-white"
        title="AI 分析笔记本"
      />
    </div>
  </Teleport>
</template>
