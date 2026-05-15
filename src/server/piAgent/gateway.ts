/**
 * Pi Agent Gateway - 核心入口
 * 管理 Pi Agent session 生命周期：创建、消息发送、事件订阅
 */
import { randomUUID } from 'node:crypto'
import {
  createAgentSession,
  SessionManager,
  defineTool,
} from '@earendil-works/pi-coding-agent'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'
import { buildModelFromProfile, createModelRegistryFromProfile } from './modelAdapter.js'
import { buildSystemPrompt } from './systemPrompt.js'
import {
  createSessionRecord,
  getSessionRecord,
  updateSessionRecord,
  appendMessage,
  type PiAgentSessionRecord,
} from './sessionStore.js'
import { bridgePiEvent, tryExtractWorkflowPlan, type PiAgentSseEvent } from './eventBridge.js'
import { buildAllTools } from './tools/index.js'

// --- Runtime 管理 ---

interface PiAgentRuntime {
  session: AgentSession
  sessionId: string
  record: PiAgentSessionRecord
  isStreaming: boolean
  currentMessageId: { value: string }
  eventListeners: Set<(event: PiAgentSseEvent) => void>
  unsubscribe?: () => void
}

const runtimes = new Map<string, PiAgentRuntime>()

// --- 公开 API ---

export interface CreatePiAgentSessionResult {
  sessionId: string
  status: string
  mode: string
  prompt: string
}

export async function createPiAgentSession(
  request: WorkflowAiPlanRequest,
  userId: string,
): Promise<CreatePiAgentSessionResult> {
  // 1. 创建会话记录
  const record = createSessionRecord(request, userId)

  // 2. 构建工具集
  const tools = buildAllTools({ request, userId })

  // 3. 创建 Pi Agent session
  const { authStorage, modelRegistry } = createModelRegistryFromProfile(request.profile)
  const model = buildModelFromProfile(request.profile)

  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    model: model as any,
    thinkingLevel: 'low',
    cwd: process.cwd(),
    customTools: tools,
    noTools: 'builtin', // 禁用内置的 read/bash/edit/write 工具
  })

  // 4. 创建 runtime
  const runtime: PiAgentRuntime = {
    session,
    sessionId: record.sessionId,
    record,
    isStreaming: false,
    currentMessageId: { value: '' },
    eventListeners: new Set(),
  }

  // 5. 订阅 Pi SDK 事件
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'agent_start') {
      runtime.isStreaming = true
    } else if (event.type === 'agent_end') {
      runtime.isStreaming = false
    }

    // 桥接事件
    const sseEvents = bridgePiEvent(event, record, runtime.currentMessageId)

    // 检测 workflow 工具执行完成 → 发射 workflow.apply 事件
    if (event.type === 'tool_execution_end' && !event.isError) {
      const resultText = extractToolResultTextForApply(event.result)
      const plan = tryExtractWorkflowPlan(event.toolName, resultText)
      if (plan) {
        sseEvents.push({ type: 'workflow.apply', sessionId: record.sessionId, plan })
      }
    }

    for (const sseEvent of sseEvents) {
      for (const listener of runtime.eventListeners) {
        try {
          listener(sseEvent)
        } catch {
          // ignore listener errors
        }
      }
    }
  })

  runtime.unsubscribe = unsubscribe
  runtimes.set(record.sessionId, runtime)

  return {
    sessionId: record.sessionId,
    status: record.status,
    mode: record.mode,
    prompt: record.prompt,
  }
}

export async function sendPiAgentMessage(
  sessionId: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return { ok: false, error: '会话不存在' }

  // 记录用户消息
  appendMessage(sessionId, {
    id: randomUUID(),
    role: 'user',
    content: message,
    status: 'completed',
    createdAt: Date.now(),
  })

  // 异步发送（不阻塞响应）
  const sendPromise = (async () => {
    try {
      // 构建包含系统提示的完整消息
      const fullPrompt = runtime.record.messages.length <= 1
        ? `${buildSystemPrompt(runtime.record.request)}\n\n用户消息：${message}`
        : message

      if (runtime.isStreaming) {
        await runtime.session.followUp(fullPrompt)
      } else {
        await runtime.session.prompt(fullPrompt)
      }
    } catch (err: any) {
      updateSessionRecord(sessionId, { status: 'failed' })
      const errorEvent: PiAgentSseEvent = {
        type: 'error',
        sessionId,
        message: err?.message || '未知错误',
      }
      for (const listener of runtime.eventListeners) {
        try {
          listener(errorEvent)
        } catch {
          // ignore
        }
      }
    }
  })()

  // 不 await，让它异步执行
  sendPromise.catch(() => {})

  return { ok: true }
}

export function subscribePiAgentEvents(
  sessionId: string,
  listener: (event: PiAgentSseEvent) => void,
): (() => void) | null {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return null

  runtime.eventListeners.add(listener)
  return () => {
    runtime.eventListeners.delete(listener)
  }
}

export function getPiAgentSession(sessionId: string) {
  return getSessionRecord(sessionId) || null
}

export function disposePiAgentSession(sessionId: string): void {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return

  runtime.unsubscribe?.()
  runtime.session.dispose()
  runtime.eventListeners.clear()
  runtimes.delete(sessionId)
}

export function disposeAllPiAgentSessions(): void {
  for (const sessionId of runtimes.keys()) {
    disposePiAgentSession(sessionId)
  }
}

/**
 * 从 Pi SDK 工具结果中提取文本内容
 * Pi SDK 返回 { content: [{ type: 'text', text: '...' }], details: {} }
 */
function extractToolResultTextForApply(result: any): string {
  if (!result) return ''
  if (typeof result === 'string') return result
  if (result.content && Array.isArray(result.content)) {
    return result.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('')
  }
  return ''
}
