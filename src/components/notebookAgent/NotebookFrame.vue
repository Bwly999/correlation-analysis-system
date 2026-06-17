<script setup lang="ts">
/**
 * NotebookFrame.vue
 *
 * 主站全屏覆盖容器，挂 /notebook.html iframe。
 *
 * keep-alive 语义（关闭即隐藏，恢复时直接显示，跳过 Pyodide 重启）：
 *   - close（iframe 内 X / 卸载确认）→ emit('close')：上层只隐藏，保留存活会话；
 *   - 真正销毁由上层在「开新分析」时通过变更 :key 触发卸载完成，或刷新页面释放。
 *
 * 职责：
 *   - 渲染 iframe，src=/notebook.html?session={sessionId}
 *   - 通过 useNotebookSession 完成 handshake + 灌入数据
 *   - 关闭 / 重启 / 下载 / 状态展示均由 iframe 内 NotebookTopBar 自行承担，
 *     iframe 通过 parentBridge 请求关闭，命中此处的 onClose。
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { useNotebookSession } from './useNotebookSession'
import type { CsvImport } from './dataSourceCsv'

const props = withDefaults(
  defineProps<{
    sessionId: string
    /** 用户选择的数据源 + meta；交由 iframe 写到 inputs/upstream.csv。null = 不导入数据 */
    initialData: CsvImport | null
    /** 主站 origin；同源时填具体 origin，跨域时浏览器会拒绝 */
    origin?: string
    /**
     * 是否显示（keep-alive：false 时隐藏 iframe 但保留存活会话，恢复时秒回）。
     * 必须在组件内部控制：根节点是 <Teleport>，父级 v-show 无法作用于 Teleport。
     */
    visible?: boolean
  }>(),
  {
    visible: true,
  },
)

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

// 关闭 = 隐藏（保留存活会话，可恢复）。不再 requestClose/dispose：
// 隐藏时 Worker 仍在运行、OPFS 有轮询兜底，无数据丢失；本地 message bridge 改为卸载时释放。
const onClose = () => {
  emit('close')
}

// 组件卸载（:key 变化开新分析 / 刷新页面）时释放本地 message bridge，避免监听器泄漏。
onBeforeUnmount(() => {
  session.dispose()
})

// 暴露 switchSession 给父级：开新分析时复用 iframe/runtime，避免 :key 变化销毁 Pyodide。
defineExpose({
  switchSession: (newSessionId: string, newInitialData: CsvImport | null) =>
    session.switchSession(newSessionId, newInitialData),
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible"
      class="fixed inset-0 z-[2000] bg-slate-50"
    >
      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="h-full w-full border-0 bg-white"
        title="AI分析"
      />
    </div>
  </Teleport>
</template>
