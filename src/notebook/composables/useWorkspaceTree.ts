/**
 * useWorkspaceTree composable
 *
 * 在 iframe 内驱动文件树视图：
 *   - 每 intervalMs 轮询 OPFS listTree
 *   - notify(paths) 收到变更事件（来自 fs_write / import_csv）时立即 refresh
 *   - root 为 getter：切换会话后 root 变化 → 自动 refresh + 重建轮询（bug3）
 *
 * 协议见 docs/design-doc/notebook-agent/UX与交互.md §6.2 + 架构与数据流.md §3.5。
 */

import { ref, watch, type Ref } from 'vue'
import { listTree, type OpfsDirectoryHandle, type TreeNode } from '../shared/opfsAccess'

export interface UseWorkspaceTreeOptions {
  /** 当前 OPFS 根的 getter：root 变化（切会话）时自动 refresh */
  root: () => OpfsDirectoryHandle
  /** 默认 2000ms */
  intervalMs?: number
}

export interface UseWorkspaceTree {
  tree: Ref<TreeNode | null>
  refresh: () => Promise<void>
  notify: (paths: string[]) => Promise<void>
  dispose: () => void
}

export const useWorkspaceTree = (
  options: UseWorkspaceTreeOptions,
): UseWorkspaceTree => {
  const { root, intervalMs = 2000 } = options
  const tree = ref<TreeNode | null>(null)

  let timer: ReturnType<typeof setInterval> | null = null
  let disposed = false
  let refreshInFlight: Promise<void> | null = null
  let refreshRequested = false

  const refresh = async () => {
    if (disposed) return
    refreshRequested = true
    if (refreshInFlight) return refreshInFlight

    const run = async () => {
      while (refreshRequested && !disposed) {
        refreshRequested = false
        try {
          tree.value = await listTree(root())
        } catch {
          // 静默：文件树是软功能，挂了不该把整个 UI 拖死
        }
      }
    }

    const pending = run()
    refreshInFlight = pending.finally(() => {
      refreshInFlight = null
    })
    return refreshInFlight
  }

  const notify = async (_paths: string[]) => {
    await refresh()
  }

  const dispose = () => {
    disposed = true
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // root 变化（切会话）→ 立即 refresh 新目录；轮询逻辑不变（始终读最新 root）
  watch(root, () => {
    void refresh()
  })

  // 启动轮询；首次 refresh 由 caller 主动 await
  timer = setInterval(() => {
    void refresh()
  }, intervalMs)

  return { tree, refresh, notify, dispose }
}
