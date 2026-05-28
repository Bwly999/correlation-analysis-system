/**
 * Pi Agent Gateway - 核心入口
 * 管理 Pi Agent session 生命周期：创建、消息发送、事件订阅
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'
import type { PiAgentCanvasSyncResponse } from '../../ai/types.js'
import { buildModelFromProfile, createModelRegistryFromProfile } from './modelAdapter.js'
import { createPiAgentResourceLoader } from './runtimeFactory.js'
import { buildSystemPrompt } from './systemPrompt.js'
import {
  createSessionRecord,
  getSessionRecord,
  setSessionFile,
  updateSessionRecord,
  appendMessage,
  type PiAgentSessionRecord,
} from './sessionStore.js'
import { bridgePiEvent, type PiAgentSseEvent } from './eventBridge.js'
import { buildAllTools } from './tools/index.js'
import { FrontendBridge, FrontendBridgeTimeoutError } from './frontendBridge.js'
import { assertPiAgentSafeRequest } from './safePayload.js'
import { archivePiAgentSessionFile } from '../logging/sessionArchive.js'
import { createServerLogger } from '../logging/serverLogger.js'
import {
  resetTurnTracking,
  syncPendingFollowUps,
  syncRuntimeStatus,
  syncTurnState,
  type PiAgentRuntimeStateCarrier,
} from './gatewayState.js'
import {
  buildStopDiagnosisEvents,
  interruptRuntime,
  isResumableContinueMessage,
} from './gatewayStopDiagnosis.js'

// --- Runtime 管理 ---

interface PiAgentRuntime {
  session: AgentSession
  sessionId: string
  record: PiAgentSessionRecord
  runState: 'idle' | 'running' | 'completed' | 'interrupted' | 'failed'
  activeTurnState: 'responding' | 'tooling' | 'idle' | 'interrupted' | 'failed'
  currentMessageId: { value: string }
  currentTurnToolNames: string[]
  lastAssistantMessageText: string
  lastObservedToolName?: string
  pendingFollowUps: string[]
  eventListeners: Set<(event: PiAgentSseEvent) => void>
  /** 前端桥接 — 用于原子工作流工具的请求-响应转发 */
  bridge: FrontendBridge
  unsubscribe?: () => void
}

type PiAgentContinueCapableSession = AgentSession & {
  agent: AgentSession['agent'] & {
    continue: () => Promise<void>
  }
}

const runtimes = new Map<string, PiAgentRuntime>()
const resolvePiAgentSessionRootDir = () =>
  process.env.PI_AGENT_SESSION_DIR?.trim() || join(process.cwd(), '.workflow-debug', 'pi-agent-sessions')

// --- 公开 API ---

export interface CreatePiAgentSessionResult {
  sessionId: string
  status: string
  mode: string
  prompt: string
}

export interface PiAgentSessionDetail {
  sessionId: string
  status: PiAgentSessionRecord['status']
  activeTurnState: PiAgentSessionRecord['activeTurnState']
  lastTurnEndedEarly: boolean
  lastStopReason: PiAgentSessionRecord['lastStopReason']
  lastMessageRole: PiAgentSessionRecord['lastMessageRole']
  endedWithToolResult: boolean
  lastResumeTrigger: PiAgentSessionRecord['lastResumeTrigger']
  lastObservedToolName?: string
  lastAssistantMessageText?: string
  pendingFollowUps: string[]
  mode: PiAgentSessionRecord['mode']
  prompt: string
  messages: PiAgentSessionRecord['messages']
  toolCalls: PiAgentSessionRecord['toolCalls']
  updatedAt: number
  createdAt: number
  sessionFile?: string
}

const emitRuntimeEvent = (runtime: PiAgentRuntime, event: PiAgentSseEvent) => {
  for (const listener of runtime.eventListeners) {
    try {
      listener(event)
    } catch {
      // ignore listener errors
    }
  }
}

export async function createPiAgentSession(
  request: WorkflowAiPlanRequest,
  userId: string,
): Promise<CreatePiAgentSessionResult> {
  assertPiAgentSafeRequest(request)
  const logger = createServerLogger({ module: 'pi-agent', userId })
  // 1. 创建会话记录
  const record = createSessionRecord(request, userId)
  logger.info('创建 Pi Agent 会话', { sessionId: record.sessionId })

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
    bridge,
  })

  // 5. 创建 Pi Agent session
  const { authStorage, modelRegistry } = createModelRegistryFromProfile(request.profile)
  const model = buildModelFromProfile(request.profile)
  const resourceLoader = createPiAgentResourceLoader(() => buildSystemPrompt(request))
  await resourceLoader.reload()

  const sessionManager = SessionManager.create(process.cwd(), resolvePiAgentSessionRootDir())

  const { session } = await createAgentSession({
    sessionManager,
    authStorage,
    modelRegistry,
    model: model as any,
    thinkingLevel: 'low',
    cwd: process.cwd(),
    customTools: tools,
    resourceLoader,
    noTools: 'builtin', // 禁用内置的 read/bash/edit/write 工具
  })
  if (session.sessionFile) {
    setSessionFile(record.sessionId, session.sessionFile)
    archivePiAgentSessionFile(record.sessionId, session.sessionFile)
  }
  logger.info('Pi Agent session 已持久化', { sessionId: record.sessionId })

  // 6. 构造完整 runtime
  const runtime: PiAgentRuntime = {
    session,
    sessionId: record.sessionId,
    record,
    runState: 'idle',
    activeTurnState: 'idle',
    currentMessageId: { value: '' },
    currentTurnToolNames: [],
    lastAssistantMessageText: '',
    lastObservedToolName: undefined,
    pendingFollowUps: [],
    eventListeners,
    bridge,
  }

  // 5. 订阅 Pi SDK 事件
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'agent_start') {
      if (runtime.pendingFollowUps.length > 0) {
        const nextMessage = runtime.pendingFollowUps.shift()!
        syncPendingFollowUps(runtime)
        emitRuntimeEvent(runtime, {
          type: 'follow_up_drained',
          sessionId: runtime.sessionId,
          message: nextMessage,
          queueLength: runtime.pendingFollowUps.length,
        })
      }
      resetTurnTracking(runtime as PiAgentRuntimeStateCarrier)
      runtime.activeTurnState = 'responding'
      syncRuntimeStatus(runtime as PiAgentRuntimeStateCarrier, 'running', 'running')
      logger.info('Pi Agent 开始运行', { sessionId: record.sessionId })
    } else if (event.type === 'agent_end') {
      buildStopDiagnosisEvents(
        runtime as PiAgentRuntimeStateCarrier,
        (diagnosisEvent) => emitRuntimeEvent(runtime, diagnosisEvent),
      )
      logger.info('Pi Agent 结束运行', { sessionId: record.sessionId })
    }

    // 桥接事件
    const sseEvents = bridgePiEvent(event, record, runtime.currentMessageId)

    for (const sseEvent of sseEvents) {
      if (sseEvent.type === 'message.start') {
        syncTurnState(runtime as PiAgentRuntimeStateCarrier, 'responding')
      } else if (sseEvent.type === 'message.completed') {
        runtime.lastAssistantMessageText = sseEvent.content
        runtime.record.lastAssistantMessageText = sseEvent.content
        runtime.record.lastMessageRole = 'assistant'
        runtime.record.endedWithToolResult = false
        if (runtime.runState === 'running') {
          syncTurnState(runtime as PiAgentRuntimeStateCarrier, 'tooling')
        }
      } else if (sseEvent.type === 'tool.start') {
        runtime.currentTurnToolNames.push(sseEvent.toolCall.toolName)
        runtime.lastObservedToolName = sseEvent.toolCall.toolName
        runtime.record.lastObservedToolName = sseEvent.toolCall.toolName
        syncTurnState(runtime as PiAgentRuntimeStateCarrier, 'tooling')
      } else if (sseEvent.type === 'tool.end') {
        runtime.record.lastMessageRole = 'toolResult'
        runtime.record.endedWithToolResult = true
      }
      emitRuntimeEvent(runtime, sseEvent)
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
  if (!runtime) {
    createServerLogger({ module: 'pi-agent', sessionId }).warn('发送消息失败，会话不存在')
    return { ok: false, error: '会话不存在' }
  }

  const logger = createServerLogger({ module: 'pi-agent', sessionId, userId: runtime.record.userId })

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
  logger.info('收到 Pi Agent 用户消息')

  // 异步发送（不阻塞响应）
  const sendPromise = (async () => {
    try {
      if (runtime.activeTurnState === 'responding') {
        logger.info('发送 followUp 到 Pi Agent')
        runtime.record.lastResumeTrigger = 'followUp'
        runtime.record.lastMessageRole = 'user'
        await runtime.session.followUp(message)
      } else if (runtime.activeTurnState === 'tooling') {
        runtime.record.lastResumeTrigger = 'followUp'
        runtime.record.lastMessageRole = 'user'
        runtime.pendingFollowUps.push(message)
        syncPendingFollowUps(runtime as PiAgentRuntimeStateCarrier)
        emitRuntimeEvent(runtime, {
          type: 'follow_up_queued',
          sessionId: runtime.sessionId,
          message,
          queueLength: runtime.pendingFollowUps.length,
        })
        await runtime.session.followUp(message)
      } else if (runtime.record.lastMessageRole === 'toolResult' && isResumableContinueMessage(message)) {
        logger.info('发送 continue 到 Pi Agent')
        runtime.record.lastResumeTrigger = 'continue'
        runtime.record.lastMessageRole = 'user'
        resetTurnTracking(runtime as PiAgentRuntimeStateCarrier)
        runtime.activeTurnState = 'responding'
        syncRuntimeStatus(runtime as PiAgentRuntimeStateCarrier, 'idle', 'idle')
        await (runtime.session as PiAgentContinueCapableSession).agent.continue()
      } else {
        logger.info('发送 prompt 到 Pi Agent')
        runtime.record.lastResumeTrigger = 'prompt'
        runtime.record.lastMessageRole = 'user'
        resetTurnTracking(runtime as PiAgentRuntimeStateCarrier)
        runtime.activeTurnState = 'responding'
        syncRuntimeStatus(runtime as PiAgentRuntimeStateCarrier, 'idle', 'idle')
        await runtime.session.prompt(message)
      }
    } catch (err: any) {
      logger.error('Pi Agent 发送消息失败', { error: err })
      if (err instanceof FrontendBridgeTimeoutError) {
        interruptRuntime(
          runtime as PiAgentRuntimeStateCarrier,
          '前端执行超时，可重试继续分析',
          (event) => emitRuntimeEvent(runtime, event),
        )
        return
      }
      interruptRuntime(
        runtime as PiAgentRuntimeStateCarrier,
        err?.message || '未知错误',
        (event) => emitRuntimeEvent(runtime, event),
      )
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
  if (!runtime) {
    createServerLogger({ module: 'pi-agent', sessionId }).warn('订阅事件失败，会话不存在')
    return null
  }

  runtime.eventListeners.add(listener)
  return () => {
    runtime.eventListeners.delete(listener)
  }
}

export function getPiAgentSession(sessionId: string): PiAgentSessionDetail | null {
  const record = getSessionRecord(sessionId)
  if (!record) return null

  return {
    sessionId: record.sessionId,
    status: record.status,
    activeTurnState: record.activeTurnState,
    lastTurnEndedEarly: record.lastTurnEndedEarly,
    lastStopReason: record.lastStopReason,
    lastMessageRole: record.lastMessageRole,
    endedWithToolResult: record.endedWithToolResult,
    lastResumeTrigger: record.lastResumeTrigger,
    lastObservedToolName: record.lastObservedToolName,
    lastAssistantMessageText: record.lastAssistantMessageText,
    pendingFollowUps: record.pendingFollowUps,
    mode: record.mode,
    prompt: record.prompt,
    messages: record.messages,
    toolCalls: record.toolCalls,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    ...(record.sessionFile ? { sessionFile: record.sessionFile } : {}),
  }
}

export function getPiAgentSessionOwner(sessionId: string): string | null {
  return getSessionRecord(sessionId)?.userId ?? null
}

export function reportPiAgentToolProgress(sessionId: string, toolCallId: string): boolean {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return false

  return runtime.bridge.touchRequest(toolCallId)
}

export async function syncPiAgentCanvas(input: {
  sessionId: string
  workflowSnapshot: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  }
}): Promise<PiAgentCanvasSyncResponse> {
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
  createServerLogger({ module: 'pi-agent', sessionId: input.sessionId, userId: runtime.record.userId }).info('同步 Pi Agent 画布')

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

  createServerLogger({ module: 'pi-agent', sessionId, userId: runtime.record.userId }).info('释放 Pi Agent 会话')
  if (runtime.runState === 'running') {
    interruptRuntime(
      runtime as PiAgentRuntimeStateCarrier,
      '当前会话已中断，可继续发送下一条消息。',
      (event) => emitRuntimeEvent(runtime, event),
    )
  }
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

