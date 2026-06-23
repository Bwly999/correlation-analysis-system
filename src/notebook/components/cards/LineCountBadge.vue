<script setup lang="ts">
/**
 * LineCountBadge.vue
 *
 * fs_write / fs_edit 的行数徽章：左侧绿色 +新增行数，右侧红色 -删减行数（仅 fs_edit）。
 * 数字经补间动画从 0 平滑跳动到终值（ease-out，500ms），遵循 prefers-reduced-motion。
 * 参考 codex 的行数变更徽章。
 */
import { computed } from 'vue'
import { useAnimatedCount } from '../../composables/useAnimatedCount'

const props = withDefaults(
  defineProps<{
    /** 新增行数（绿色） */
    added: number
    /** 删减行数（红色）；fs_write 不传或传 0 则只显示绿色 */
    removed?: number
  }>(),
  { removed: 0 },
)

const addedAnimated = useAnimatedCount(() => props.added)
const removedAnimated = useAnimatedCount(() => props.removed)

const showRemoved = computed(() => props.removed > 0)
const addedDisplay = computed(() => Math.round(addedAnimated.value))
const removedDisplay = computed(() => Math.round(removedAnimated.value))
</script>

<template>
  <span class="inline-flex items-center gap-1.5 nb-mono" style="font-size: 10.5px; font-weight: 600;">
    <span
      v-if="added > 0"
      class="inline-flex items-center rounded-[3px] px-1.5 py-0.5 tabular-nums"
      style="background-color: var(--nb-sage-soft); color: var(--nb-sage);"
    >
      +{{ addedDisplay }}
    </span>
    <span
      v-if="showRemoved"
      class="inline-flex items-center rounded-[3px] px-1.5 py-0.5 tabular-nums"
      style="background-color: var(--nb-clay-soft); color: var(--nb-clay);"
    >
      −{{ removedDisplay }}
    </span>
  </span>
</template>
