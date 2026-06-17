<script setup lang="ts">
/**
 * NotebookLauncher.vue
 *
 * 主站顶部菜单的「AI分析」入口。
 *
 * 行为：
 *   - 渲染按钮
 *   - 点击 → 打开 NewNotebookDialog
 *   - dialog start → emit start(source)
 *
 * 真正的"取数据 + 转 CSV + 挂 NotebookFrame"由更上层组件接住 start 事件做。
 * 这一组件只承担"显示按钮 + 选数据"的职责。
 *
 * 视觉：每次进入页面从三套夺目风格中随机抽取一种（常驻动效），
 *       让这个 AI 入口每次见面都有新鲜感。
 */
import { onMounted, ref } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import NewNotebookDialog, { type NotebookDataSource } from './NewNotebookDialog.vue'

defineProps<{
  available: NotebookDataSource[]
}>()

const emit = defineEmits<{
  start: [source: NotebookDataSource | null]
}>()

/** 三套视觉风格，挂载时随机选其一并固定（避免每次重渲染跳动） */
type Style = 'aurora' | 'magma' | 'neon'
const STYLES: Style[] = ['aurora', 'magma', 'neon']
const styleMod = ref<Style>('aurora')

onMounted(() => {
  styleMod.value = STYLES[Math.floor(Math.random() * STYLES.length)]
})

const dialogOpen = ref(false)

const onClick = () => {
  dialogOpen.value = true
}

const onStart = (source: NotebookDataSource | null) => {
  emit('start', source)
}
</script>

<template>
  <div>
    <button
      :class="['nb-btn', `nb-btn--${styleMod}`]"
      data-testid="notebook-launcher-button"
      aria-label="AI分析"
      @click="onClick"
    >
      <Sparkles :size="14" class="nb-btn__icon" />
      <span>AI分析</span>
    </button>
    <NewNotebookDialog
      v-model:open="dialogOpen"
      :available="available"
      @start="onStart"
    />
  </div>
</template>

<style scoped>
/* —— 三套风格共用的骨架 —— */
.nb-btn {
  position: relative;
  height: 2rem;
  padding: 0 16px 0 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  overflow: hidden;
  /* 关键：去掉 isolation，避免负 z-index 伪元素被自身背景盖住 */
  transition: transform 0.15s ease, box-shadow 0.3s ease, filter 0.3s ease, color 0.3s ease;
}
.nb-btn:active {
  transform: translateY(0);
}
/* 图标 + 文字统一置于最上层，绝不被背景层遮挡 */
.nb-btn__icon,
.nb-btn span {
  position: relative;
  z-index: 3;
}
.nb-btn__icon {
  flex-shrink: 0;
}

/* ============================================================
 * 风格 A · 暗夜流光
 * 深墨黑底 + 持续旋转的蓝紫粉青渐变描边 + hover 蓝紫光晕
 *
 * 实现：按钮自身透明；::before 是放大的旋转渐变层（z:1）；
 *       ::after 是略内缩的实底遮罩（z:2），盖住中间只留一圈描边。
 *       全程正 z-index，文字 z:3 在最上。
 * ============================================================ */
.nb-btn--aurora {
  border: 0;
  background: transparent;
  color: #f8fafc;
  box-shadow:
    0 0 0 1px rgba(99, 102, 241, 0),
    0 8px 20px -8px rgba(99, 102, 241, 0.65);
}
/* 旋转渐变层 */
.nb-btn--aurora::before {
  content: '';
  position: absolute;
  inset: -60%;
  z-index: 1;
  background: conic-gradient(
    from 0deg,
    #6366f1,
    #22d3ee,
    #a78bfa,
    #f472b6,
    #6366f1
  );
  animation: nb-aurora-spin 3.2s linear infinite;
}
/* 实底遮罩，留出 1.5px 描边宽度 */
.nb-btn--aurora::after {
  content: '';
  position: absolute;
  inset: 1.5px;
  z-index: 2;
  border-radius: 8.5px;
  background: #0b1020;
}
@keyframes nb-aurora-spin {
  to {
    transform: rotate(360deg);
  }
}
.nb-btn--aurora:hover {
  transform: translateY(-1px);
  box-shadow:
    0 0 0 1px rgba(99, 102, 241, 0.4),
    0 0 22px rgba(99, 102, 241, 0.55),
    0 12px 26px -10px rgba(99, 102, 241, 0.85);
}
.nb-btn--aurora .nb-btn__icon {
  color: #c4b5fd;
  filter: drop-shadow(0 0 5px rgba(167, 139, 250, 0.9));
}

/* ============================================================
 * 风格 B · 日落熔岩
 * 橙红玫红实体渐变 + 高光周期性扫过 + 厚投影
 * ============================================================ */
.nb-btn--magma {
  border: 1px solid #b91c1c;
  background: linear-gradient(135deg, #f97316 0%, #ef4444 48%, #db2777 100%);
  color: #ffffff;
  box-shadow:
    0 10px 22px -10px rgba(239, 68, 68, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
/* 高光扫过层 */
.nb-btn--magma::before {
  content: '';
  position: absolute;
  top: 0;
  left: -60%;
  width: 50%;
  height: 100%;
  z-index: 2;
  background: linear-gradient(
    105deg,
    transparent,
    rgba(255, 255, 255, 0.55),
    transparent
  );
  transform: skewX(-18deg);
  animation: nb-magma-sheen 3.6s ease-in-out infinite;
}
@keyframes nb-magma-sheen {
  0%,
  100% {
    left: -60%;
  }
  55% {
    left: 140%;
  }
}
.nb-btn--magma:hover {
  transform: translateY(-1px);
  filter: saturate(1.12) brightness(1.04);
  box-shadow:
    0 14px 28px -10px rgba(239, 68, 68, 0.95),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

/* ============================================================
 * 风格 C · 玻璃霓虹
 * 暗玻璃半透明 + 青绿描边发光 + 底部呼吸光带
 * ============================================================ */
.nb-btn--neon {
  border: 1px solid rgba(45, 212, 191, 0.45);
  background: rgba(13, 18, 30, 0.86);
  backdrop-filter: blur(6px);
  color: #5eead4;
  letter-spacing: 0.04em;
  box-shadow:
    0 0 0 1px rgba(45, 212, 191, 0.12),
    0 8px 22px -8px rgba(20, 184, 166, 0.7),
    inset 0 0 14px rgba(45, 212, 191, 0.12);
}
/* 底部呼吸光带 */
.nb-btn--neon::after {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: -40%;
  height: 70%;
  z-index: 1;
  background: radial-gradient(
    ellipse at center,
    rgba(45, 212, 191, 0.55),
    transparent 70%
  );
  filter: blur(6px);
  animation: nb-neon-breathe 2.8s ease-in-out infinite;
}
@keyframes nb-neon-breathe {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
.nb-btn--neon:hover {
  transform: translateY(-1px);
  color: #99f6e4;
  box-shadow:
    0 0 0 1px rgba(45, 212, 191, 0.3),
    0 0 20px rgba(45, 212, 191, 0.5),
    0 12px 26px -10px rgba(20, 184, 166, 0.9),
    inset 0 0 18px rgba(45, 212, 191, 0.2);
}

/* 尊重用户的减少动效偏好 */
@media (prefers-reduced-motion: reduce) {
  .nb-btn--aurora::before,
  .nb-btn--magma::before,
  .nb-btn--neon::after {
    animation: none;
  }
}
</style>
