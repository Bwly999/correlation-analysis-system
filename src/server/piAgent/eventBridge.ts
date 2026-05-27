/**
 * Pi Agent 事件桥接：将 Pi SDK 原生事件转换为前端可消费的 SSE 事件
 */
import { randomUUID } from 'node:crypto'
import type { WorkflowAiPlan } from '../../ai/types.js'
import type { PiAgentSessionRecord, PiAgentToolCall } from './sessionStore.js'
import {
  appendMessage,
  appendToolCall,
  updateSessionRecord,
  updateToolCall,
} from './sessionStore.js'

/** 前端 SSE 事件类型 */
export type PiAgentSseEvent =
  | { type: 'session.status'; sessionId: string; status: string }
  | { type: 'session.interrupted'; sessionId: string; message: string }
  | { type: 'session.ended_early'; sessionId: string; message: string }
  | {
      type: 'session.stop_diagnosis'
      sessionId: string
      stopReason: 'normal' | 'read_only_observation_end' | 'interrupted' | 'failed'
      message: string
      endedWithToolResult?: boolean
      lastObservedToolName?: string
      lastAssistantMessageText?: string
    }
  | { type: 'follow_up_queued'; sessionId: string; message: string; queueLength: number }
  | { type: 'follow_up_drained'; sessionId: string; message: string; queueLength: number }
  | {
      type: 'message.start'
      sessionId: string
      messageId: string
      role: string
      visibility: 'assistant_visible' | 'assistant_debug'
    }
  | { type: 'message.delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'message.thinking_delta'; sessionId: string; messageId: string; delta: string }
  | {
      type: 'message.completed'
      sessionId: string
      messageId: string
      content: string
      rawContent: string
      visibility: 'assistant_visible' | 'assistant_debug'
    }
  | { type: 'tool.start'; sessionId: string; toolCall: PiAgentToolCall }
  | { type: 'tool.end'; sessionId: string; toolCallId: string; result: string; isError: boolean }
  | { type: 'tool.execute'; sessionId: string; toolCallId: string; toolName: string; params: Record<string, unknown> }
  | { type: 'workflow.apply'; sessionId: string; plan: WorkflowAiPlan }
  | { type: 'error'; sessionId: string; message: string }

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  workflow_get_session_context: '读取分析上下文',
  workflow_get_node_catalog: '读取节点目录',
  workflow_get_node: '读取节点信息',
  workflow_update_partial_workflow: '增量修改画布',
  wf_executeWorkflow: '执行工作流/调试节点',
}

const WORKFLOW_MUTATION_TOOLS = new Set([
  'workflow_update_partial_workflow',
])

/**
 * 从 workflow 工具的成功结果中提取 WorkflowAiPlan
 * 返回 null 表示无法提取（工具失败或非 workflow 工具）
 */
export function tryExtractWorkflowPlan(toolName: string, resultText: string): WorkflowAiPlan | null {
  if (!WORKFLOW_MUTATION_TOOLS.has(toolName)) return null
  if (!resultText) return null

  try {
    const parsed = JSON.parse(resultText)
    if (!parsed.success || !parsed.plan?.operations?.length) return null
    return parsed.plan as WorkflowAiPlan
  } catch {
    return null
  }
}

/**
 * 将 Pi SDK AgentEvent 转换为 SSE 事件并更新 session store
 */
export function bridgePiEvent(
  piEvent: any,
  record: PiAgentSessionRecord,
  currentMessageId: { value: string },
): PiAgentSseEvent[] {
  const sessionId = record.sessionId
  const events: PiAgentSseEvent[] = []

  switch (piEvent.type) {
    case 'agent_start': {
      updateSessionRecord(sessionId, { status: 'running' })
      events.push({ type: 'session.status', sessionId, status: 'running' })
      break
    }

    case 'agent_end': {
      events.push({ type: 'session.status', sessionId, status: record.status })
      break
    }

    case 'message_start': {
      if (!isAssistantMessage(piEvent.message)) break
      updateSessionRecord(sessionId, {
        lastMessageRole: 'assistant',
        endedWithToolResult: false,
      })
      const msgId = randomUUID()
      currentMessageId.value = msgId
      appendMessage(sessionId, {
        id: msgId,
        role: 'assistant',
        visibility: 'assistant_visible',
        content: '',
        rawContent: '',
        status: 'streaming',
        createdAt: Date.now(),
      })
      events.push({
        type: 'message.start',
        sessionId,
        messageId: msgId,
        role: 'assistant',
        visibility: 'assistant_visible',
      })
      break
    }

    case 'message_update': {
      const msgEvent = piEvent.assistantMessageEvent
      if (!msgEvent) break
      const msgId = currentMessageId.value
      if (!msgId) break

      if (msgEvent.type === 'text_delta') {
        events.push({ type: 'message.delta', sessionId, messageId: msgId, delta: msgEvent.delta })
      } else if (msgEvent.type === 'thinking_delta') {
        events.push({
          type: 'message.thinking_delta',
          sessionId,
          messageId: msgId,
          delta: msgEvent.delta,
        })
      }
      break
    }

    case 'message_end': {
      if (!isAssistantMessage(piEvent.message)) break
      const msgId = currentMessageId.value
      if (!msgId) break
      // 从 piEvent.message 中提取最终文本
      const finalText = extractTextFromMessage(piEvent.message)
      // 更新 store 中的消息
      const msg = record.messages.find((m) => m.id === msgId)
      if (msg) {
        msg.content = finalText
        msg.rawContent = finalText
        msg.status = 'completed'
      }
      events.push({
        type: 'message.completed',
        sessionId,
        messageId: msgId,
        content: finalText,
        rawContent: finalText,
        visibility: 'assistant_visible',
      })
      currentMessageId.value = ''
      break
    }

    case 'tool_execution_start': {
      const toolCall: PiAgentToolCall = {
        id: piEvent.toolCallId || randomUUID(),
        toolName: piEvent.toolName,
        displayName: TOOL_DISPLAY_NAMES[piEvent.toolName] || piEvent.toolName,
        args: piEvent.args,
        status: 'running',
        startedAt: Date.now(),
      }
      appendToolCall(sessionId, toolCall)
      events.push({ type: 'tool.start', sessionId, toolCall })
      break
    }

    case 'tool_execution_end': {
      const toolCallId = piEvent.toolCallId
      const resultText = extractToolResultText(piEvent.result)
      const isError = piEvent.isError || false
      updateToolCall(sessionId, toolCallId, {
        status: isError ? 'failed' : 'success',
        result: resultText,
        isError,
        finishedAt: Date.now(),
      })
      updateSessionRecord(sessionId, {
        lastMessageRole: 'toolResult',
        endedWithToolResult: !isError,
      })
      events.push({ type: 'tool.end', sessionId, toolCallId, result: resultText, isError })
      break
    }
  }

  return events
}

function isAssistantMessage(message: any): boolean {
  return message?.role === 'assistant'
}

function extractTextFromMessage(message: any): string {
  if (!message) return ''
  if (typeof message === 'string') return message
  // Pi SDK AgentMessage 有 content 数组
  if (message.content && Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('')
  }
  if (message.text) return message.text
  return ''
}

function extractToolResultText(result: any): string {
  if (!result) return ''
  if (typeof result === 'string') return result
  // Pi SDK tool result: { content: [{ type: 'text', text: '...' }] }
  if (result.content && Array.isArray(result.content)) {
    return result.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('')
  }
  return JSON.stringify(result)
}
