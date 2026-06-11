<script setup lang="ts">
/**
 * NotebookLauncher.vue
 *
 * 主站顶部菜单的「AI 分析笔记本」入口。
 *
 * 行为：
 *   - 渲染按钮
 *   - 点击 → 打开 NewNotebookDialog
 *   - dialog start → emit start(source)
 *
 * 真正的"取数据 + 转 CSV + 挂 NotebookFrame"由更上层组件接住 start 事件做。
 * 这一组件只承担"显示按钮 + 选数据"的职责。
 */
import { ref } from 'vue'
import NewNotebookDialog, { type NotebookDataSource } from './NewNotebookDialog.vue'

defineProps<{
  available: NotebookDataSource[]
}>()

const emit = defineEmits<{
  start: [source: NotebookDataSource]
}>()

const dialogOpen = ref(false)

const onClick = () => {
  dialogOpen.value = true
}

const onStart = (source: NotebookDataSource) => {
  emit('start', source)
}
</script>

<template>
  <div>
    <button
      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      data-testid="notebook-launcher-button"
      aria-label="AI 分析笔记本"
      @click="onClick"
    >
      <span class="mr-1">📓</span>AI 分析笔记本
    </button>
    <NewNotebookDialog
      v-model:open="dialogOpen"
      :available="available"
      @start="onStart"
    />
  </div>
</template>
