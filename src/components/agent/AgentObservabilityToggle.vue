<script setup lang="ts">
import { Bug } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    data-testid="agent-observability-toggle"
    type="button"
    class="agent-observability-toggle"
    :data-visible="String(props.visible)"
    title="打开 Agent 调试台"
    @click="emit('toggle')"
  >
    <Bug :size="15" />
    <span>Agent 调试台</span>
  </button>
</template>

<style scoped>
.agent-observability-toggle {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 145;
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #dbe4ef;
  background: rgba(255, 255, 255, 0.94);
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 18px 36px -28px rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(10px);
}
</style>
