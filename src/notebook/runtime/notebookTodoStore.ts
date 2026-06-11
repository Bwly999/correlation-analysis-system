/**
 * Notebook todo_write 工具背后的状态容器。
 *
 * 协议见 docs/design-doc/notebook-agent/工具集协议.md §5.1：
 *   - setItems(items) 全量覆盖
 *   - in_progress 数量 > 1 时 inProgressGuardWarned=true（不强制，仅提示）
 *
 * 该 store 故意不依赖 Pinia，做成纯工厂；上层在 iframe 内实例化一个，UI 组件订阅即可。
 */

import { ref, type Ref } from 'vue'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  title: string
  status: TodoStatus
}

export interface TodoStats {
  total: number
  inProgress: number
  completed: number
  inProgressGuardWarned: boolean
}

const VALID_STATUS = new Set<TodoStatus>(['pending', 'in_progress', 'completed'])

const validateItem = (item: TodoItem) => {
  if (typeof item.title !== 'string' || item.title.length === 0) {
    throw new Error('todo title 不能为空')
  }
  if (item.title.length > 100) {
    throw new Error(`todo title 超过 100 字符（${item.title.length}）`)
  }
  if (!VALID_STATUS.has(item.status)) {
    throw new Error(`todo status 非法：${item.status}`)
  }
}

export interface NotebookTodoStore {
  items: Ref<readonly TodoItem[]>
  setItems: (items: TodoItem[]) => void
  getItems: () => readonly TodoItem[]
  getStats: () => TodoStats
  reset: () => void
}

export const createNotebookTodoStore = (): NotebookTodoStore => {
  const items = ref<TodoItem[]>([])

  const setItems = (next: TodoItem[]) => {
    next.forEach(validateItem)
    items.value = [...next]
  }

  const getStats = (): TodoStats => {
    const inProgress = items.value.filter((i) => i.status === 'in_progress').length
    const completed = items.value.filter((i) => i.status === 'completed').length
    return {
      total: items.value.length,
      inProgress,
      completed,
      inProgressGuardWarned: inProgress > 1,
    }
  }

  const reset = () => {
    items.value = []
  }

  return {
    items: items as unknown as Ref<readonly TodoItem[]>,
    setItems,
    getItems: () => items.value,
    getStats,
    reset,
  }
}
