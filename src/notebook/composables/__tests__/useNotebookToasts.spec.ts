/**
 * useNotebookToasts 测试
 */
import { describe, it, expect, vi } from 'vitest'
import { useNotebookToasts } from '../useNotebookToasts'

describe('useNotebookToasts', () => {
  it('push / dismiss', () => {
    const { toasts, push, dismiss } = useNotebookToasts()
    const id = push({ kind: 'info', title: 'hi', autoDismissMs: 0 })
    expect(toasts.value.length).toBe(1)
    dismiss(id)
    expect(toasts.value.length).toBe(0)
  })

  it('autoDismissMs 默认 5000；error 默认 0（不消失）', async () => {
    vi.useFakeTimers()
    const { toasts, push } = useNotebookToasts()
    push({ kind: 'success', title: 'ok' })
    push({ kind: 'error', title: 'boom' })
    expect(toasts.value.length).toBe(2)
    vi.advanceTimersByTime(6000)
    expect(toasts.value.length).toBe(1)
    expect(toasts.value[0]!.kind).toBe('error')
    vi.useRealTimers()
  })

  it('clear 清空所有', () => {
    const { toasts, push, clear } = useNotebookToasts()
    push({ kind: 'info', title: 'a', autoDismissMs: 0 })
    push({ kind: 'info', title: 'b', autoDismissMs: 0 })
    clear()
    expect(toasts.value.length).toBe(0)
  })
})
