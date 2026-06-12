/**
 * useNotebookToasts
 *
 * 维护一个 toast 列表（push / dismiss），UI 用 NotebookToast.vue 渲染。
 * 支持：
 *   - kind: info / success / warning / error
 *   - autoDismissMs: 默认 5000；error 类默认不自动消失
 *   - actions: 0..2 个按钮（如「重启」「关闭」）
 */

import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  primary?: boolean
  onClick: () => void
}

export interface NotebookToastSpec {
  id: string
  kind: ToastKind
  title: string
  message?: string
  autoDismissMs?: number
  actions?: ToastAction[]
}

const genId = (() => {
  let n = 0
  return () => `toast-${Date.now()}-${++n}`
})()

export const useNotebookToasts = () => {
  const toasts = ref<NotebookToastSpec[]>([])
  const timers = new Map<string, number>()

  const dismiss = (id: string) => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
    const tm = timers.get(id)
    if (tm !== undefined) {
      window.clearTimeout(tm)
      timers.delete(id)
    }
  }

  const push = (spec: Omit<NotebookToastSpec, 'id'> & { id?: string }): string => {
    const id = spec.id ?? genId()
    const final: NotebookToastSpec = { ...spec, id }
    toasts.value = [...toasts.value, final]
    const ttl = spec.autoDismissMs ?? (spec.kind === 'error' ? 0 : 5000)
    if (ttl > 0) {
      const tm = window.setTimeout(() => dismiss(id), ttl)
      timers.set(id, tm)
    }
    return id
  }

  const clear = () => {
    timers.forEach((tm) => window.clearTimeout(tm))
    timers.clear()
    toasts.value = []
  }

  return { toasts, push, dismiss, clear }
}
