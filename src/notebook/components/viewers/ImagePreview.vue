<script setup lang="ts">
/**
 * ImagePreview.vue
 *
 * §7.1 图片 viewer：纸面居中展示，径向背景收边。
 *   src 为空（blob URL 尚未生成）时显示加载占位。
 */

defineProps<{
  src: string
  alt?: string
}>()
</script>

<template>
  <div
    class="flex flex-1 items-center justify-center p-6"
    style="
      background-image:
        radial-gradient(circle at center, transparent 0%, var(--nb-overlay) 100%);
    "
  >
    <img
      v-if="src"
      :src="src"
      :alt="alt ?? ''"
      class="max-h-full max-w-full rounded-[var(--nb-radius-sm)] border"
      style="border-color: var(--nb-rule-strong); box-shadow: var(--nb-shadow-lg);"
    />
    <div
      v-else
      class="nb-display-italic text-[13px]"
      style="color: var(--nb-ink-mute);"
    >
      图片正在加载…
    </div>
  </div>
</template>
