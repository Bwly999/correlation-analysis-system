import { computed, ref } from 'vue'
import type {
  JsTransformAgentContext,
  JsTransformAgentMode,
  JsTransformAgentSafeDebugResult,
} from '@/ai/types'
import {
  createJsTransformAgentSession,
  resolveJsTransformAgentToolResult,
  sendJsTransformAgentMessage,
  updateJsTransformAgentMode,
  streamJsTransformAgentEvents,
} from '@/services/jsTransformAgentClient'
import type { WorkflowAiModelProfile } from '@/ai/types'

export interface JsTransformAgentToolCall {
  id: string
  toolName: string
  displayName: string
  args: unknown
  status: 'running' | 'success' | 'failed'
  result?: string
  isError?: boolean
}

export interface JsTransformAgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  rawContent?: string
  thinking: string
  status: 'streaming' | 'completed'
  toolCalls: JsTransformAgentToolCall[]
  createdAt: number
}

export function useJsTransformAgent() {
  const sessionId = ref<string | null>(null)
  const status = ref<'idle' | 'connecting' | 'running' | 'completed' | 'failed'>('idle')
  const mode = ref<JsTransformAgentMode>('ask')
  const messages = ref<JsTransformAgentMessage[]>([])
  const errorMessage = ref('')
  const inputText = ref('')
  const currentContext = ref<JsTransformAgentContext | null>(null)
  const currentProfile = ref<WorkflowAiModelProfile | null>(null)
  const latestDebugResult = ref<JsTransformAgentSafeDebugResult | null>(null)
  const externalEventHandler = ref<((event: any) => Promise<boolean> | boolean) | null>(null)

  const canSend = computed(() => inputText.value.trim().length > 0 && status.value !== 'connecting')

  const reset = () => {
    sessionId.value = null
    status.value = 'idle'
    messages.value = []
    errorMessage.value = ''
    inputText.value = ''
    latestDebugResult.value = null
  }

  const switchMode = async (input: {
    mode: JsTransformAgentMode
    nodeId: string
    context: JsTransformAgentContext
    profile: WorkflowAiModelProfile
  }) => {
    mode.value = input.mode

    if (!sessionId.value) return true

    const result = await updateJsTransformAgentMode(sessionId.value, input.mode)
    if (!result.ok) {
      throw new Error('切换 JS 节点 AI 模式失败')
    }

    return true
  }

  const ensureSession = async (input: {
    prompt: string
    mode: JsTransformAgentMode
    nodeId: string
    context: JsTransformAgentContext
    profile: WorkflowAiModelProfile
  }) => {
    currentContext.value = input.context
    currentProfile.value = input.profile
    mode.value = input.mode

    if (sessionId.value) return true

    status.value = 'connecting'
    errorMessage.value = ''

    try {
      const created = await createJsTransformAgentSession({
        nodeId: input.nodeId,
        mode: input.mode,
        prompt: input.prompt,
        profile: input.profile,
        nodeContext: input.context,
      })
      sessionId.value = created.sessionId
      status.value = 'idle'
      void streamJsTransformAgentEvents(created.sessionId, {
        onEvent: (event) => {
          void handleEvent(event)
        },
      })
      return true
    } catch (error: any) {
      status.value = 'failed'
      errorMessage.value = error?.message || '创建 JS 节点 AI 会话失败'
      return false
    }
  }

  const sendMessage = async (input: {
    prompt?: string
    mode: JsTransformAgentMode
    nodeId: string
    context: JsTransformAgentContext
    profile: WorkflowAiModelProfile
  }) => {
    const content = input.prompt || inputText.value.trim()
    if (!content) return false

    inputText.value = ''

    const ok = await ensureSession({
      prompt: content,
      mode: input.mode,
      nodeId: input.nodeId,
      context: input.context,
      profile: input.profile,
    })
    if (!ok || !sessionId.value) return false

    messages.value.push({
      id: `user_${Date.now()}`,
      role: 'user',
      content,
      rawContent: content,
      thinking: '',
      status: 'completed',
      toolCalls: [],
      createdAt: Date.now(),
    })
    status.value = 'running'

    try {
      const result = await sendJsTransformAgentMessage(sessionId.value, content)
      if (!result.ok) {
        throw new Error(result.error || '发送 JS 节点 AI 消息失败')
      }
      return true
    } catch (error: any) {
      status.value = 'failed'
      errorMessage.value = error?.message || '发送 JS 节点 AI 消息失败'
      return false
    }
  }

  const handleToolResult = async (input: {
    toolCallId: string
    result: {
      content: Array<{ type: 'text'; text: string }>
      details: JsTransformAgentSafeDebugResult
      isError?: boolean
    }
  }) => {
    if (!sessionId.value) return
    latestDebugResult.value = input.result.details
    await resolveJsTransformAgentToolResult(sessionId.value, input.toolCallId, input.result)
  }

  const handleEvent = async (event: any) => {
    if (externalEventHandler.value) {
      const handled = await externalEventHandler.value(event)
      if (handled) {
        return
      }
    }

    switch (event.type) {
      case 'session.status':
        status.value = event.status
        break
      case 'message.start':
        messages.value.push({
          id: event.messageId,
          role: 'assistant',
          content: '',
          rawContent: '',
          thinking: '',
          status: 'streaming',
          toolCalls: [],
          createdAt: Date.now(),
        })
        break
      case 'message.delta': {
        const message = messages.value.find((item) => item.id === event.messageId)
        if (message) {
          message.content += event.delta
          message.rawContent = `${message.rawContent ?? ''}${event.delta}`
        }
        break
      }
      case 'message.thinking_delta': {
        const message = messages.value.find((item) => item.id === event.messageId)
        if (message) {
          message.thinking += event.delta
        }
        break
      }
      case 'message.completed': {
        const message = messages.value.find((item) => item.id === event.messageId)
        if (message) {
          message.content = event.content || message.content
          message.rawContent = event.rawContent || event.content || message.rawContent
          message.status = 'completed'
        }
        break
      }
      case 'tool.start': {
        const lastAssistant = [...messages.value].reverse().find((item) => item.role === 'assistant')
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
        for (const message of messages.value) {
          const toolCall = message.toolCalls.find((item) => item.id === event.toolCallId)
          if (toolCall) {
            toolCall.status = event.isError ? 'failed' : 'success'
            toolCall.result = event.result
            toolCall.isError = event.isError
            break
          }
        }
        break
      }
      case 'error':
        status.value = 'failed'
        errorMessage.value = event.message
        break
    }
  }

  return {
    sessionId,
    status,
    mode,
    messages,
    errorMessage,
    inputText,
    canSend,
    currentContext,
    currentProfile,
    latestDebugResult,
    externalEventHandler,
    switchMode,
    ensureSession,
    sendMessage,
    handleToolResult,
    handleEvent,
    reset,
  }
}
