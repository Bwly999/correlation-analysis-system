<script setup lang="ts">
/**
 * NotebookFrame.vue
 *
 * 主站全屏覆盖容器，挂 /notebook.html iframe。
 *
 * 职责：
 *   - 渲染 iframe，src=/notebook.html?session={sessionId}
 *   - 通过 useNotebookSession 完成 handshake + 灌入数据
 *   - 关闭 / 重启 / 下载 / 状态展示均由 iframe 内 NotebookTopBar 自行承担，
 *     iframe 通过 parentBridge 请求关闭，命中此处的 onClose。
 */
import { ref, computed } from 'vue'
import { useNotebookSession } from './useNotebookSession'
import type { CsvImport } from './dataSourceCsv'

const props = defineProps<{
  sessionId: string
  /** 用户选择的数据源 + meta；交由 iframe 写到 inputs/upstream.csv。null = 不导入数据 */
  initialData: CsvImport | null
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
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[2000] bg-slate-50">
      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="h-full w-full border-0 bg-white"
        title="AI分析"
      />
    </div>
  </Teleport>
</template>
