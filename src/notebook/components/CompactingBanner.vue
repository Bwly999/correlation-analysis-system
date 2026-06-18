<script setup lang="ts">
/**
 * CompactingBanner.vue
 *
 * 消息流内的"上下文压缩中"提示条。
 *
 * 视觉：一条横向窄条，文字带扫光（shimmer）高光从左到右循环掠过，
 * 对标 zcode 的压缩提示动效。压缩完成（compactionInProgress=false）后整条移除。
 *
 * 触发：自动压缩（SDK 阈值触发）与手动压缩走同一条事件通路
 *   （compaction_start → mapper 置 compactionInProgress=true），
 *   故本组件只需响应一个 prop，无需区分来源。
 */
defineProps<{
  /** 正在压缩中（true 时显示 banner 并播放扫光） */
  active: boolean
}>()
</script>

<template>
  <Transition name="nb-compacting">
    <div
      v-if="active"
      class="nb-compacting-banner"
      role="status"
      aria-live="polite"
      aria-label="正在压缩上下文"
    >
      <span class="nb-compacting-shimmer" aria-hidden="true" />
      <span class="nb-compacting-text">
        <span class="nb-compacting-dot" aria-hidden="true" />
        上下文压缩中…
      </span>
      <span class="nb-compacting-hint">正在总结早期对话</span>
    </div>
  </Transition>
</template>

<style scoped>
.nb-compacting-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  /* 容器溢出隐藏：裁剪扫光层，让高光只在内部掠过 */
  overflow: hidden;
  padding: 9px 16px;
  border-radius: var(--nb-radius-sm);
  border: 1px solid rgba(199, 107, 74, 0.32);
  background-color: var(--nb-copper-soft);
  /* 扫光层定位基准 */
  isolation: isolate;
}

/* ── 扫光层：一条斜向高光，从左到右无限循环掠过 ── */
/* 用独立发光条 + transform 平移（而非背景位移），保证高光全程在容器内可见，
   对标 zcode 的持续掠过效果（不会出现"闪烁/断续"）。 */
.nb-compacting-shimmer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  /* 发光条宽度约为容器的 40%，留出两端在视图外的时间让循环无缝 */
  width: 40%;
  background: linear-gradient(
    100deg,
    transparent 0%,
    rgba(199, 107, 74, 0.12) 30%,
    rgba(255, 248, 240, 0.6) 50%,
    rgba(199, 107, 74, 0.12) 70%,
    transparent 100%
  );
  /* 从左外(-110%)平移到右外(110%)：覆盖整个容器宽度 */
  transform: translateX(-110%);
  animation: nb-shimmer 1.8s linear infinite;
  pointer-events: none;
  z-index: 0;
  /* 裁剪由父容器 overflow:hidden 负责 */
}

@keyframes nb-shimmer {
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(260%); }
}

/* ── 文字层：在扫光层之上，保证可读性 ── */
.nb-compacting-text {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--nb-font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--nb-copper-deep);
  /* 给文字一层纸色描边/阴影，让扫光掠过时文字仍清晰 */
  text-shadow: 0 0 4px var(--nb-paper);
}

.nb-compacting-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--nb-copper);
  animation: nb-pulse 1.1s ease-in-out infinite;
}

.nb-compacting-hint {
  position: relative;
  z-index: 1;
  margin-left: auto;
  font-size: 11px;
  color: var(--nb-ink-mute);
  text-shadow: 0 0 4px var(--nb-paper);
}

/* ── 进出场过渡 ── */
.nb-compacting-enter-active,
.nb-compacting-leave-active {
  transition:
    opacity 200ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1),
    max-height 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
  overflow: hidden;
}
.nb-compacting-enter-from,
.nb-compacting-leave-to {
  opacity: 0;
  transform: translateY(6px);
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.nb-compacting-enter-to,
.nb-compacting-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 48px;
}
</style>
