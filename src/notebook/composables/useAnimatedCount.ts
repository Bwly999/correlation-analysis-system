/**
 * useAnimatedCount.ts
 *
 * 把一个响应式数值（如 fs_write 新增行数）补间成平滑跳动的动画值，
 * 用于工具卡片行数徽章（参考 codex 的行数徽章效果）。
 *
 * - 入参 source 变化时，用 ease-out 曲线从当前值插值到目标值（默认 500ms）。
 * - 自动遵循 prefers-reduced-motion：用户开启「减少动效」时直接跳到终值，不做补间。
 *
 * 基于 @vueuse/core 的 useTransition（项目已装，此前未用过）。
 */
import { usePreferredReducedMotion, useTransition, TransitionPresets } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

export function useAnimatedCount(
  source: MaybeRefOrGetter<number>,
  duration = 500,
) {
  const reduced = usePreferredReducedMotion()
  const disabled = computed(() => reduced.value === 'reduce')
  return useTransition(computed(() => toValue(source)), {
    duration,
    transition: TransitionPresets.easeOutCubic,
    disabled,
  })
}
