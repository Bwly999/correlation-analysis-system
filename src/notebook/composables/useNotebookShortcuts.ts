/**
 * useNotebookShortcuts
 *
 * §10 快捷键：
 *   - ⌘/Ctrl + Enter → 发送（在 MessageInput 内绑，不在这里）
 *   - Esc            → 关闭笔记本（emit close 请求）
 *   - ⌘/Ctrl + K     → focus 输入框（MessageInput 自己绑）
 *   - ⌘/Ctrl + R     → 重启 Python 环境（弹确认）
 *   - ⌘/Ctrl + S     → 下载 workspace zip
 *
 * 仅在 iframe focus 时生效；本 composable 注册在 NotebookView 顶层 window 上即可。
 */

import { onBeforeUnmount, onMounted } from 'vue'

export interface UseNotebookShortcutsHandlers {
  onClose?: () => void
  onRestart?: () => void
  onDownload?: () => void
}

const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export const useNotebookShortcuts = (handlers: UseNotebookShortcutsHandlers) => {
  const onKeydown = (e: KeyboardEvent) => {
    const mod = isMac() ? e.metaKey : e.ctrlKey
    // Esc
    if (e.key === 'Escape') {
      // 输入框内 Esc 不触发关闭，让它清空文本/blur
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      e.preventDefault()
      handlers.onClose?.()
      return
    }
    if (!mod) return
    const k = e.key.toLowerCase()
    if (k === 'r') {
      e.preventDefault()
      handlers.onRestart?.()
    } else if (k === 's') {
      e.preventDefault()
      handlers.onDownload?.()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
