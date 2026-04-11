<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, Brain } from 'lucide-vue-next'

const props = defineProps<{
  title: string
  summary: string
  details: string[]
  collapsed?: boolean
}>()

const isCollapsed = ref(props.collapsed ?? true)

watch(
  () => props.collapsed,
  (value) => {
    isCollapsed.value = value ?? true
  },
)

const toggleLabel = computed(() => (isCollapsed.value ? '展开思考' : '收起思考'))
</script>

<template>
  <section data-testid="agent-thinking-block" class="agent-thinking-block">
    <button
      data-testid="agent-thinking-toggle"
      type="button"
      class="agent-thinking-block__toggle"
      @click="isCollapsed = !isCollapsed"
    >
      <span class="agent-thinking-block__title">
        <Brain :size="14" />
        <span>{{ title }}</span>
      </span>
      <span class="agent-thinking-block__summary">{{ summary }}</span>
      <span class="agent-thinking-block__action">
        {{ toggleLabel }}
        <ChevronDown v-if="isCollapsed" :size="14" />
        <ChevronUp v-else :size="14" />
      </span>
    </button>

    <div v-if="!isCollapsed" data-testid="agent-thinking-body" class="agent-thinking-block__body">
      <p v-for="detail in details" :key="detail">{{ detail }}</p>
    </div>
  </section>
</template>

<style scoped>
.agent-thinking-block {
  border: 1px solid #dbe4ef;
  border-radius: 16px;
  background: #fbfdff;
}

.agent-thinking-block__toggle {
  width: 100%;
  border: none;
  background: transparent;
  padding: 14px 16px;
  display: grid;
  gap: 10px;
  text-align: left;
  cursor: pointer;
}

.agent-thinking-block__title,
.agent-thinking-block__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.agent-thinking-block__title {
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
}

.agent-thinking-block__summary {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.agent-thinking-block__action {
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.agent-thinking-block__body {
  border-top: 1px solid #e2e8f0;
  padding: 0 16px 16px;
  display: grid;
  gap: 8px;
  color: #334155;
  font-size: 12px;
  line-height: 1.7;
}

.agent-thinking-block__body p {
  margin: 0;
}
</style>
