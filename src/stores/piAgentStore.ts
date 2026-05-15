/**
 * Pi Agent Store - 简化版 Agent 状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkflowAiStore } from './workflowAiStore'
import { useWorkflowStore } from './workflowStore'

export interface PiAgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking: string
  status: 'streaming' | 'completed'
  toolCalls: PiAgentToolCall[]
  createdAt: number
}

export interface PiAgentToolCall {
  id: string
  toolName: string
  displayName: string
  args: unknown
  status: 'running' | 'success' | 'failed'
  result?: string
  isError?: boolean
}

type SessionStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'failed'

export const usePiAgentStore = defineStore('piAgent', () => {
  // --- State ---
  const sessionId = ref<string | null>(null)
  const status = ref<SessionStatus>('idle')
  const messages = ref<PiAgentMessage[]>([])
  const errorMessage = ref('')
  const inputText = ref('')

  // SSE 连接
  let eventSource: AbortController | null = null
  let ndjsonReader: ReadableStreamDefaultReader<Uint8Array> | null = null

  // --- Computed ---
  const isStreaming = computed(() => status.value === 'running')
  const canSend = computed(
    () => inputText.value.trim().length > 0 && status.value !== 'connecting',
  )

  // --- Actions ---

  async function ensureSession(prompt: string) {
    if (sessionId.value) return true

    const aiStore = useWorkflowAiStore()
    const workflowStore = useWorkflowStore()

    // 确保 profiles 已加载
    if (!aiStore.selectedProfile) {
      await aiStore.loadProfiles()
    }

    // 获取当前选中的 profile，如果没有则取第一个可用的
    let profile = aiStore.selectedProfile
    if (!profile) {
      // 直接从后端获取 profiles
      try {
        const res = await fetch('/api/workflow-ai/model-profiles')
        if (res.ok) {
          const data = await res.json()
          const profiles = data.profiles || []
          profile = profiles.find((p: any) => p.enabled) || profiles[0]
        }
      } catch {
        // ignore
      }
    }

    if (!profile) {
      errorMessage.value = '未配置模型，请在 .env.local 中设置 OPENAI_API_KEY 等环境变量'
      status.value = 'failed'
      return false
    }

    // 构建 session 请求
    const request = {
      mode: 'create' as const,
      prompt,
      profile,
      workflowSnapshot: workflowStore.nodes.length > 0
        ? {
            name: workflowStore.workflowName || '未命名工作流',
            nodes: workflowStore.nodes,
            edges: workflowStore.edges,
          }
        : undefined,
      dataSources: aiStore.contextHints?.schemaSummaries?.map((s: any) => ({
        id: s.nodeId,
        kind: 'file' as const,
        entryNodeType: 'file-import' as const,
        label: s.nodeLabel,
        schemaSummary: s,
        bindingPayload: {},
      })) || [],
      nodeCatalog: [],
    }

    status.value = 'connecting'
    errorMessage.value = ''

    try {
      const res = await fetch('/api/pi-agent/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '创建会话失败' }))
        throw new Error(err.message || `HTTP ${res.status}`)
      }

      const data = await res.json()
      sessionId.value = data.sessionId
      status.value = 'idle'

      // 连接事件流
      connectEventStream(data.sessionId)
      return true
    } catch (err: any) {
      status.value = 'failed'
      errorMessage.value = err?.message || '创建会话失败'
      return false
    }
  }

  async function sendMessage(text?: string) {
    const content = text || inputText.value.trim()
    if (!content) return

    inputText.value = ''

    // 如果没有 session，先创建
    if (!sessionId.value) {
      const ok = await ensureSession(content)
      if (!ok) return
    }

    // 添加用户消息
    messages.value.push({
      id: `user_${Date.now()}`,
      role: 'user',
      content,
      thinking: '',
      status: 'completed',
      toolCalls: [],
      createdAt: Date.now(),
    })

    status.value = 'running'

    try {
      const res = await fetch(`/api/pi-agent/sessions/${sessionId.value}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '发送失败' }))
        throw new Error(err.message || `HTTP ${res.status}`)
      }
    } catch (err: any) {
      status.value = 'failed'
      errorMessage.value = err?.message || '发送消息失败'
    }
  }

  function connectEventStream(sid: string) {
    const controller = new AbortController()
    eventSource = controller

    fetch(`/api/pi-agent/sessions/${sid}/events`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        ndjsonReader = reader
        const decoder = new TextDecoder()
        let buffer = ''

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) return
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              try {
                const event = JSON.parse(trimmed)
                handleEvent(event)
              } catch {
                // ignore parse errors
              }
            }
            return pump()
          })

        return pump()
      })
      .catch(() => {
        // connection closed
      })
  }

  function handleEvent(event: any) {
    switch (event.type) {
      case 'session.status': {
        if (event.status === 'running') {
          status.value = 'running'
        } else if (event.status === 'completed') {
          status.value = 'completed'
        } else if (event.status === 'failed') {
          status.value = 'failed'
        }
        break
      }

      case 'message.start': {
        messages.value.push({
          id: event.messageId,
          role: 'assistant',
          content: '',
          thinking: '',
          status: 'streaming',
          toolCalls: [],
          createdAt: Date.now(),
        })
        break
      }

      case 'message.delta': {
        const msg = messages.value.find((m) => m.id === event.messageId)
        if (msg) msg.content += event.delta
        break
      }

      case 'message.thinking_delta': {
        const msg = messages.value.find((m) => m.id === event.messageId)
        if (msg) msg.thinking += event.delta
        break
      }

      case 'message.completed': {
        const msg = messages.value.find((m) => m.id === event.messageId)
        if (msg) {
          msg.content = event.content || msg.content
          msg.status = 'completed'
        }
        break
      }

      case 'tool.start': {
        const lastAssistant = [...messages.value].reverse().find((m) => m.role === 'assistant')
        if (lastAssistant) {
          lastAssistant.toolCalls.push({
            id: event.toolCall.id,
            toolName: event.toolCall.toolName,
            displayName: event.toolCall.displayName,
            args: event.toolCall.args,
            status: 'running',
          })
        }
        break
      }

      case 'tool.end': {
        for (const msg of messages.value) {
          const tc = msg.toolCalls.find((t) => t.id === event.toolCallId)
          if (tc) {
            tc.status = event.isError ? 'failed' : 'success'
            tc.result = event.result
            tc.isError = event.isError
            break
          }
        }
        break
      }

      case 'workflow.apply': {
        try {
          const workflowStore = useWorkflowStore()
          workflowStore.applyWorkflowAiPlan(event.plan)
        } catch (err: any) {
          console.warn('[PiAgent] 应用工作流计划失败:', err?.message || err)
        }
        break
      }

      case 'error': {
        status.value = 'failed'
        errorMessage.value = event.message
        break
      }
    }
  }

  function disconnect() {
    eventSource?.abort()
    eventSource = null
    ndjsonReader = null
  }

  function reset() {
    disconnect()
    sessionId.value = null
    status.value = 'idle'
    messages.value = []
    errorMessage.value = ''
    inputText.value = ''
  }

  return {
    // State
    sessionId,
    status,
    messages,
    errorMessage,
    inputText,
    // Computed
    isStreaming,
    canSend,
    // Actions
    ensureSession,
    sendMessage,
    disconnect,
    reset,
  }
})
