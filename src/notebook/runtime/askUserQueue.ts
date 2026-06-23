/**
 * Notebook ask_user 工具背后的等待队列。
 *
 * 协议见 docs/design-doc/notebook-agent/工具集协议.md §5.2：
 *   - Agent 调 ask_user → tool.execute → iframe 路由到 enqueue → 渲染 UI 卡片
 *   - 用户回答 → resolve(toolCallId, answer) → enqueue 返回的 promise 完成
 *
 * 该队列存活在 iframe 主线程，UI 组件订阅 list() 进行渲染。
 */

import { ref, type Ref } from 'vue'

export interface AskUserOption {
  label: string
  description?: string
}

export interface AskUserItem {
  toolCallId: string
  question: string
  header: string
  options?: AskUserOption[]
  multiSelect?: boolean
  allowFreeText?: boolean
  recommendedIndex?: number
}

export interface AskUserAnswerEntry {
  label: string
  isCustom: boolean
}

export interface AskUserResult {
  answers: AskUserAnswerEntry[]
}

interface PendingAskUser {
  item: AskUserItem
  resolve: (r: AskUserResult) => void
  reject: (e: Error) => void
}

export interface AskUserQueue {
  /** 给 UI 订阅的响应式视图 */
  items: Ref<AskUserItem[]>
  enqueue: (item: AskUserItem) => Promise<AskUserResult>
  resolve: (toolCallId: string, result: AskUserResult) => void
  /** 取消单条挂起的 ask_user（用户点了取消 / 终止时调用），reject 该条 promise */
  cancel: (toolCallId: string, reason: string) => boolean
  cancelAll: (reason: string) => void
  peek: () => AskUserItem | null
  list: () => AskUserItem[]
  size: () => number
}

export const createAskUserQueue = (): AskUserQueue => {
  const queue: PendingAskUser[] = []
  const items = ref<AskUserItem[]>([])

  const refreshItems = () => {
    items.value = queue.map((p) => p.item)
  }

  const enqueue = (item: AskUserItem) => {
    return new Promise<AskUserResult>((resolve, reject) => {
      queue.push({ item, resolve, reject })
      refreshItems()
    })
  }

  const resolve = (toolCallId: string, result: AskUserResult) => {
    const idx = queue.findIndex((p) => p.item.toolCallId === toolCallId)
    if (idx === -1) {
      throw new Error(`askUserQueue: 未找到 toolCallId=${toolCallId}`)
    }
    const [pending] = queue.splice(idx, 1)
    refreshItems()
    pending!.resolve(result)
  }

  const cancelAll = (reason: string) => {
    while (queue.length > 0) {
      const pending = queue.shift()!
      pending.reject(new Error(reason))
    }
    refreshItems()
  }

  const cancel = (toolCallId: string, reason: string) => {
    const idx = queue.findIndex((p) => p.item.toolCallId === toolCallId)
    if (idx === -1) return false
    const [pending] = queue.splice(idx, 1)
    refreshItems()
    pending!.reject(new Error(reason))
    return true
  }

  return {
    items,
    enqueue,
    resolve,
    cancel,
    cancelAll,
    peek: () => queue[0]?.item ?? null,
    list: () => queue.map((p) => p.item),
    size: () => queue.length,
  }
}
