/**
 * Pi Agent Gateway - 核心入口
 * 管理 Pi Agent session 生命周期：创建、消息发送、事件订阅
 */
import { randomUUID } from 'node:crypto'
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  defineTool,
} from '@earendil-works/pi-coding-agent'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'
import type { WorkflowMcpRuntime } from '../opencode/workflowMcpRuntime.js'
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
import { FrontendBridge } from './frontendBridge.js'
import { assertPiAgentSafeRequest } from './safePayload.js'
import type { AgentSessionCanvasSyncResponse } from '../../ai/types.js'

// --- Runtime 管理 ---

interface PiAgentRuntime {
  session: AgentSession
  sessionId: string
  record: PiAgentSessionRecord
  isStreaming: boolean
  currentMessageId: { value: string }
  eventListeners: Set<(event: PiAgentSseEvent) => void>
  /** 前端桥接 — 用于原子工作流工具的请求-响应转发 */
  bridge: FrontendBridge
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
  workflowRuntime: WorkflowMcpRuntime,
): Promise<CreatePiAgentSessionResult> {
  assertPiAgentSafeRequest(request)
  // 1. 创建会话记录
  const record = createSessionRecord(request, userId)

  // 2. 预创建 runtime 骨架（listeners 集合需要先存在，供 bridge 回调使用）
  const eventListeners = new Set<(event: PiAgentSseEvent) => void>()

  // 3. 创建前端桥接（每个用户会话独立）
  const bridge = new FrontendBridge((event) => {
    const sseEvent: PiAgentSseEvent = {
      type: 'tool.execute',
      sessionId: record.sessionId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      params: event.params,
    }
    for (const listener of eventListeners) {
      try {
        listener(sseEvent)
      } catch {
        // ignore listener errors
      }
    }
  })

  // 4. 构建工具集（传入 bridge 以启用原子工作流工具）
  const tools = buildAllTools({
    request,
    userId,
    bridge,
    runtime: workflowRuntime,
  })

  // 5. 创建 Pi Agent session
  const { authStorage, modelRegistry } = createModelRegistryFromProfile(request.profile)
  const model = buildModelFromProfile(request.profile)
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    systemPromptOverride: () => buildSystemPrompt(request),
  })
  await resourceLoader.reload()

  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    model: model as any,
    thinkingLevel: 'low',
    cwd: process.cwd(),
    customTools: tools,
    resourceLoader,
    noTools: 'builtin', // 禁用内置的 read/bash/edit/write 工具
  })

  // 6. 构造完整 runtime
  const runtime: PiAgentRuntime = {
    session,
    sessionId: record.sessionId,
    record,
    isStreaming: false,
    currentMessageId: { value: '' },
    eventListeners,
    bridge,
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
    visibility: 'user',
    content: message,
    rawContent: message,
    status: 'completed',
    createdAt: Date.now(),
  })

  // 异步发送（不阻塞响应）
  const sendPromise = (async () => {
    try {
      if (runtime.isStreaming) {
        await runtime.session.followUp(message)
      } else {
        await runtime.session.prompt(message)
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

export async function syncPiAgentCanvas(input: {
  sessionId: string
  workflowSnapshot: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  }
}): Promise<AgentSessionCanvasSyncResponse> {
  const runtime = runtimes.get(input.sessionId)
  if (!runtime) {
    throw new Error('未找到 Pi Agent 会话')
  }

  const nextRequest = {
    ...runtime.record.request,
    workflowSnapshot: {
      name: input.workflowSnapshot.name,
      nodes: input.workflowSnapshot.nodes,
      edges: input.workflowSnapshot.edges,
    },
  }

  runtime.record.request = nextRequest
  updateSessionRecord(input.sessionId, {
    request: nextRequest,
  })

  return {
    projection: {
      workflow: {
        workflowId: null,
        workflowName: input.workflowSnapshot.name,
        draftNodeCount: input.workflowSnapshot.nodes.length,
        draftEdgeCount: input.workflowSnapshot.edges.length,
        draftSummary: '',
        versionCount: 0,
        latestVersionId: null,
        proposedPlan: null,
      },
      analysis: {
        goal: runtime.record.prompt,
        summary: '',
        candidateTargets: [],
        candidateFactors: [],
        methods: [],
        findings: [],
        risks: [],
        recommendations: [],
      },
      execution: {
        status: 'idle',
        latestAction: '当前画布已同步',
        toolCalls: [],
        pendingApprovals: [],
        latestToolSummary: '',
      },
      canvasSync: {
        status: 'synced',
        message: `已同步当前画布，共 ${input.workflowSnapshot.nodes.length} 个节点、${input.workflowSnapshot.edges.length} 条连线`,
        syncedAt: Date.now(),
      },
      error: null,
      updatedAt: Date.now(),
    },
    syncSummary: `已同步当前画布，共 ${input.workflowSnapshot.nodes.length} 个节点、${input.workflowSnapshot.edges.length} 条连线`,
  }
}

export function disposePiAgentSession(sessionId: string): void {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return

  runtime.bridge.dispose()
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
 * 前端返回工具执行结果时调用
 * 将结果传递给对应 runtime 的 FrontendBridge，resolve 工具执行中挂起的 Promise
 */
export function resolvePiAgentToolResult(
  sessionId: string,
  toolCallId: string,
  result: { content: Array<{ type: 'text'; text: string }>; details: import('../../ai/types.js').PiAgentSafeToolResult; isError?: boolean },
): boolean {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return false

  if (result.isError) {
    return runtime.bridge.rejectResult(toolCallId, new Error(result.content[0]?.text || '前端执行错误'))
  }
  return runtime.bridge.resolveResult(toolCallId, result)
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
