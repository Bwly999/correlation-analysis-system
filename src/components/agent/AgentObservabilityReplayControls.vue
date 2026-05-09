<script setup lang="ts">
const props = defineProps<{
  cursorSeq: number
}>()

const emit = defineEmits<{
  jumpPrev: []
  jumpNext: []
}>()
</script>

<template>
  <div class="agent-observability-replay-controls">
    <button type="button" @click="emit('jumpPrev')">上一帧</button>
    <span>序列号 {{ props.cursorSeq || 0 }}</span>
    <button type="button" @click="emit('jumpNext')">下一帧</button>
  </div>
</template>

<style scoped>
.agent-observability-replay-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.agent-observability-replay-controls button {
  height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid #dbe4ef;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.agent-observability-replay-controls span {
  color: #475569;
  font-size: 11px;
  font-weight: 800;
}
</style>
