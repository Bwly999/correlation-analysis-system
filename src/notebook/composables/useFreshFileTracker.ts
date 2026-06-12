/**
 * useFreshFileTracker
 *
 * 跟踪 30s 内出现的「新变更」文件路径，§6.1 文件标⭐ 用。
 *
 * 输入 tree 快照 → 维护 Map<path, lastSeenMtime>；
 * 当某个文件的 modifiedAt 比上次记录新（或路径首次出现）就把它登记为「fresh」，
 * 30s 后自动失效。
 *
 * 不需要外部时钟注入：由 setInterval 驱动；测试可通过传入 now() 替身做时间控制。
 */

import { computed, ref, getCurrentInstance, onBeforeUnmount, watch, type Ref } from 'vue'
import type { TreeNode } from '../shared/opfsAccess'

export interface UseFreshFileTrackerOptions {
  tree: Ref<TreeNode | null>
  /** 默认 30000ms */
  windowMs?: number
  /** 测试注入；默认 Date.now */
  now?: () => number
}

const flatten = (root: TreeNode | null): Map<string, number> => {
  const out = new Map<string, number>()
  if (!root) return out
  const walk = (node: TreeNode, prefix: string) => {
    if (!node.children) return
    for (const child of node.children) {
      const path = prefix ? `${prefix}/${child.name}` : child.name
      if (child.kind === 'directory') {
        walk(child, path)
      } else {
        out.set(path, child.modifiedAt ?? 0)
      }
    }
  }
  walk(root, '')
  return out
}

export const useFreshFileTracker = (options: UseFreshFileTrackerOptions) => {
  const { tree, windowMs = 30_000, now = () => Date.now() } = options
  /** path → mtime 缓存（用于侦测变化）*/
  const seen = new Map<string, number>()
  /** path → 标记为 fresh 的时间戳 */
  const freshAt = ref(new Map<string, number>())
  /** 触发响应式重计算的 tick */
  const tick = ref(0)

  watch(
    tree,
    (next) => {
      const flat = flatten(next)
      const t = now()
      flat.forEach((mtime, path) => {
        const prev = seen.get(path)
        if (prev === undefined || (mtime > 0 && mtime > prev)) {
          freshAt.value.set(path, t)
        }
        seen.set(path, mtime)
      })
      // 清理已删除的文件，避免一直留在 freshAt 里
      for (const path of Array.from(seen.keys())) {
        if (!flat.has(path)) {
          seen.delete(path)
          freshAt.value.delete(path)
        }
      }
    },
    { immediate: true, deep: true },
  )

  const intervalId = setInterval(() => {
    tick.value++
  }, 1000)

  // 仅在组件上下文中注册卸载回调；composable 直接被测试调用时安全降级
  if (getCurrentInstance()) {
    onBeforeUnmount(() => clearInterval(intervalId))
  }

  const isFresh = (path: string): boolean => {
    void tick.value
    const t = freshAt.value.get(path)
    if (t === undefined) return false
    return now() - t < windowMs
  }

  /** 用作 v-for key 触发响应（避免每次 isFresh 都遍历 Map） */
  const anyFresh = computed(() => {
    void tick.value
    const t = now()
    for (const at of freshAt.value.values()) {
      if (t - at < windowMs) return true
    }
    return false
  })

  return { isFresh, anyFresh }
}
