<script setup lang="ts">
/**
 * Pi Agent 消息列表
 */
import { nextTick, watch, ref } from 'vue'
import { usePiAgentStore } from '../../stores/piAgentStore'
import PiAgentThinkingBlock from './PiAgentThinkingBlock.vue'
import PiAgentToolCallCard from './PiAgentToolCallCard.vue'

const store = usePiAgentStore()
const listRef = ref<HTMLElement | null>(null)

// 自动滚动到底部
watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight
      }
    })
  },
)

// 消息内容变化时也滚动
watch(
  () => store.messages.map((m) => m.content.length).join(','),
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight
      }
    })
  },
)
</script>

<template>
  <div ref="listRef" class="pi-agent-message-list">
    <div
      v-for="msg in store.messages"
      :key="msg.id"
      class="message-item"
      :class="[`role-${msg.role}`]"
    >
      <!-- 用户消息 -->
      <div v-if="msg.role === 'user'" class="message-bubble user-bubble">
        {{ msg.content }}
      </div>

      <!-- 助手消息 -->
      <div v-else class="assistant-block">
        <!-- 思考块 -->
        <PiAgentThinkingBlock v-if="msg.thinking" :thinking="msg.thinking" />

        <!-- 工具调用 -->
        <PiAgentToolCallCard
          v-for="tc in msg.toolCalls"
          :key="tc.id"
          :tool-call="tc"
        />

        <!-- 文本内容 -->
        <div v-if="msg.content" class="message-bubble assistant-bubble">
          <span>{{ msg.content }}</span>
          <span v-if="msg.status === 'streaming'" class="cursor-blink">▊</span>
        </div>
      </div>
    </div>

    <!-- 加载指示器 -->
    <div v-if="store.isStreaming && !store.messages.some(m => m.status === 'streaming')" class="loading-indicator">
      <span class="loading-dot" />
      <span class="loading-dot" />
      <span class="loading-dot" />
    </div>

    <!-- 错误提示 -->
    <div v-if="store.errorMessage" class="error-banner">
      {{ store.errorMessage }}
    </div>
  </div>
</template>

<style scoped>
.pi-agent-message-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-item {
  display: flex;
  flex-direction: column;
}

.role-user {
  align-items: flex-end;
}

.role-assistant {
  align-items: flex-start;
}

.message-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-bubble {
  background: var(--p-primary-color, #2563eb);
  color: white;
  border-bottom-right-radius: 4px;
}

.assistant-bubble {
  background: var(--p-surface-100, #f1f5f9);
  color: var(--p-surface-800, #1e293b);
  border-bottom-left-radius: 4px;
}

.assistant-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 90%;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: var(--p-surface-400);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.loading-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--p-surface-400, #94a3b8);
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dot:nth-child(1) { animation-delay: -0.32s; }
.loading-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.error-banner {
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 12px;
}
</style>
