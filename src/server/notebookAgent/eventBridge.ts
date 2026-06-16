import { randomUUID } from 'node:crypto'
import type { NotebookSessionRecord, NotebookToolCall } from './sessionStore.js'
import {
  appendNotebookMessage,
  appendNotebookToolCall,
  updateNotebookSessionRecord,
  updateNotebookToolCall,
} from './sessionStore.js'

export type NotebookAgentSseEvent =
  | { type: 'session.status'; sessionId: string; status: string }
  | {
      type: 'message.start'
      sessionId: string
      messageId: string
      role: 'assistant'
      visibility: 'assistant_visible'
    }
  | { type: 'message.delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'message.thinking_delta'; sessionId: string; messageId: string; delta: string }
  | {
      type: 'message.completed'
      sessionId: string
      messageId: string
      content: string
      rawContent: string
      visibility: 'assistant_visible'
    }
  | { type: 'tool.start'; sessionId: string; toolCall: NotebookToolCall }
  | { type: 'tool.end'; sessionId: string; toolCallId: string; result: string; isError: boolean }
  | { type: 'tool.execute'; sessionId: string; toolCallId: string; toolName: string; params: Record<string, unknown> }
  | { type: 'error'; sessionId: string; message: string }

export function bridgeNotebookEvent(
  piEvent: any,
  record: NotebookSessionRecord,
  currentMessageId: { value: string },
): NotebookAgentSseEvent[] {
  const sessionId = record.sessionId
  const events: NotebookAgentSseEvent[] = []

  switch (piEvent.type) {
    case 'agent_start':
      updateNotebookSessionRecord(sessionId, { status: 'running' })
      events.push({ type: 'session.status', sessionId, status: 'running' })
      break

    case 'agent_end':
      if (record.status === 'running') {
        updateNotebookSessionRecord(sessionId, { status: 'completed' })
      }
      events.push({
        type: 'session.status',
        sessionId,
        status: record.status === 'running' ? 'completed' : record.status,
      })
      break

    case 'message_start': {
      if (!isAssistantMessage(piEvent.message)) break
      const messageId = randomUUID()
      currentMessageId.value = messageId
      appendNotebookMessage(sessionId, {
        id: messageId,
        role: 'assistant',
        content: '',
        rawContent: '',
        status: 'streaming',
        createdAt: Date.now(),
      })
      events.push({
        type: 'message.start',
        sessionId,
        messageId,
        role: 'assistant',
        visibility: 'assistant_visible',
      })
      break
    }

    case 'message_update': {
      const msgEvent = piEvent.assistantMessageEvent
      const messageId = currentMessageId.value
      if (!messageId || !msgEvent) break
      if (msgEvent.type === 'text_delta') {
        events.push({ type: 'message.delta', sessionId, messageId, delta: msgEvent.delta })
      } else if (msgEvent.type === 'thinking_delta') {
        events.push({
          type: 'message.thinking_delta',
          sessionId,
          messageId,
          delta: msgEvent.delta,
        })
      }
      break
    }

    case 'message_end': {
      if (!isAssistantMessage(piEvent.message)) break
      const messageId = currentMessageId.value
      if (!messageId) break
      const finalText = extractTextFromMessage(piEvent.message)
      const message = record.messages.find((item) => item.id === messageId)
      if (message) {
        message.content = finalText
        message.rawContent = finalText
        message.status = 'completed'
      }
      events.push({
        type: 'message.completed',
        sessionId,
        messageId,
        content: finalText,
        rawContent: finalText,
        visibility: 'assistant_visible',
      })
      currentMessageId.value = ''
      break
    }

    case 'tool_execution_start': {
      const toolCall: NotebookToolCall = {
        id: piEvent.toolCallId || randomUUID(),
        toolName: piEvent.toolName,
        args: piEvent.args,
        status: 'running',
        startedAt: Date.now(),
      }
      appendNotebookToolCall(sessionId, toolCall)
      events.push({ type: 'tool.start', sessionId, toolCall })
      break
    }

    case 'tool_execution_end': {
      const toolCallId = piEvent.toolCallId
      const resultText = extractToolResultText(piEvent.result)
      const isError = Boolean(piEvent.isError)
      updateNotebookToolCall(sessionId, toolCallId, {
        status: isError ? 'failed' : 'success',
        result: resultText,
        isError,
        finishedAt: Date.now(),
      })
      events.push({ type: 'tool.end', sessionId, toolCallId, result: resultText, isError })
      break
    }
  }

  return events
}

const isAssistantMessage = (message: unknown): boolean =>
  Boolean(message) &&
  typeof message === 'object' &&
  (message as { role?: unknown }).role === 'assistant'

const extractTextFromMessage = (message: any): string => {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => block?.text || '')
      .join('')
  }
  return typeof message.text === 'string' ? message.text : ''
}

const extractToolResultText = (result: any): string => {
  if (!result) return ''
  if (typeof result === 'string') return result
  if (Array.isArray(result.content)) {
    return result.content
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => block?.text || '')
      .join('')
  }
  return JSON.stringify(result)
}
