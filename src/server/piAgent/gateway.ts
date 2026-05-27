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
import { buildSystemPrompt } from './systemPrompt.js'
import {
  createSessionRecord,
  getSessionRecord,
  setSessionFile,
  updateSessionRecord,
  appendMessage,
  type PiAgentSessionRecord,
} from './sessionStore.js'
import { bridgePiEvent, tryExtractWorkflowPlan, type PiAgentSseEvent } from './eventBridge.js'
import { buildAllTools } from './tools/index.js'
import { FrontendBridge } from './frontendBridge.js'
import { assertPiAgentSafeRequest } from './safePayload.js'
import { archivePiAgentSessionFile } from '../logging/sessionArchive.js'
import { createServerLogger } from '../logging/serverLogger.js'

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

const READ_ONLY_TOOL_NAMES = new Set([
  'workflow_get_session_context',
  'workflow_get_node_catalog',
  'workflow_get_node',
])

const TRANSITIONAL_ASSISTANT_TEXT_PATTERN = /(我来看看|我先看看|我来查看|我先查看|我先读|我来读|我先读取|我来读取|好的，我来看看|好的，我先看看)/
const RESUMABLE_CONTINUE_MESSAGES = new Set([
  '继续',
  '继续哦',
  '继续o',
  '继续噢',
  '还在不',
  '还在吗',
  '?',
  '？',
])

const normalizeContinueMessage = (message: string) => message.replace(/[\s，。！？!?,、~～…]/g, '').trim().toLowerCase()

const isResumableContinueMessage = (message: string) => RESUMABLE_CONTINUE_MESSAGES.has(normalizeContinueMessage(message))

const isEmptyToolResultStop = (runtime: PiAgentRuntime) =>
  runtime.record.endedWithToolResult
  && !runtime.lastAssistantMessageText.trim()
  && runtime.currentTurnToolNames.length > 0

const syncRuntimeStatus = (
  runtime: PiAgentRuntime,
  status: PiAgentSessionRecord['status'],
  nextRunState: PiAgentRuntime['runState'],
) => {
  runtime.runState = nextRunState
  updateSessionRecord(runtime.sessionId, {
    status,
    activeTurnState: runtime.activeTurnState,
    lastTurnEndedEarly: runtime.record.lastTurnEndedEarly,
    lastStopReason: runtime.record.lastStopReason,
    lastMessageRole: runtime.record.lastMessageRole,
    endedWithToolResult: runtime.record.endedWithToolResult,
    lastResumeTrigger: runtime.record.lastResumeTrigger,
    lastObservedToolName: runtime.record.lastObservedToolName,
    lastAssistantMessageText: runtime.record.lastAssistantMessageText,
    pendingFollowUps: [...runtime.pendingFollowUps],
  })
}

const syncTurnState = (
  runtime: PiAgentRuntime,
  nextTurnState: PiAgentRuntime['activeTurnState'],
) => {
  runtime.activeTurnState = nextTurnState
  updateSessionRecord(runtime.sessionId, {
    activeTurnState: nextTurnState,
    pendingFollowUps: [...runtime.pendingFollowUps],
    lastTurnEndedEarly: runtime.record.lastTurnEndedEarly,
    lastStopReason: runtime.record.lastStopReason,
    lastMessageRole: runtime.record.lastMessageRole,
    endedWithToolResult: runtime.record.endedWithToolResult,
    lastResumeTrigger: runtime.record.lastResumeTrigger,
    lastObservedToolName: runtime.record.lastObservedToolName,
    lastAssistantMessageText: runtime.record.lastAssistantMessageText,
  })
}

const syncPendingFollowUps = (runtime: PiAgentRuntime) => {
  updateSessionRecord(runtime.sessionId, {
    pendingFollowUps: [...runtime.pendingFollowUps],
    activeTurnState: runtime.activeTurnState,
    lastTurnEndedEarly: runtime.record.lastTurnEndedEarly,
    lastStopReason: runtime.record.lastStopReason,
    lastMessageRole: runtime.record.lastMessageRole,
    endedWithToolResult: runtime.record.endedWithToolResult,
    lastResumeTrigger: runtime.record.lastResumeTrigger,
    lastObservedToolName: runtime.record.lastObservedToolName,
    lastAssistantMessageText: runtime.record.lastAssistantMessageText,
  })
}

const resetTurnTracking = (runtime: PiAgentRuntime) => {
  runtime.currentTurnToolNames = []
  runtime.lastAssistantMessageText = ''
  runtime.lastObservedToolName = undefined
  runtime.record.lastTurnEndedEarly = false
  runtime.record.lastStopReason = 'normal'
  runtime.record.endedWithToolResult = false
  runtime.record.lastObservedToolName = undefined
  runtime.record.lastAssistantMessageText = ''
  updateSessionRecord(runtime.sessionId, {
    lastTurnEndedEarly: false,
    lastStopReason: 'normal',
    endedWithToolResult: false,
    lastObservedToolName: undefined,
    lastAssistantMessageText: '',
  })
}

const isEarlyEndedTurn = (runtime: PiAgentRuntime) => {
  if (!runtime.lastAssistantMessageText.trim()) return false
  if (!TRANSITIONAL_ASSISTANT_TEXT_PATTERN.test(runtime.lastAssistantMessageText)) return false
  if (runtime.currentTurnToolNames.length === 0) return false
  return runtime.currentTurnToolNames.every((toolName) => READ_ONLY_TOOL_NAMES.has(toolName))
}

const interruptRuntime = (
  runtime: PiAgentRuntime,
  message: string,
  options?: { status?: 'interrupted' | 'failed' },
) => {
  const status = options?.status ?? 'interrupted'
  runtime.record.lastTurnEndedEarly = false
  runtime.record.lastStopReason = status
  runtime.record.endedWithToolResult = false
  runtime.record.lastObservedToolName = runtime.lastObservedToolName
  runtime.record.lastAssistantMessageText = runtime.lastAssistantMessageText
  runtime.pendingFollowUps = []
  runtime.activeTurnState = status
  syncRuntimeStatus(runtime, status, status)
  emitRuntimeEvent(runtime, {
    type: 'session.stop_diagnosis',
    sessionId: runtime.sessionId,
    stopReason: status,
    message,
    endedWithToolResult: runtime.record.endedWithToolResult,
    ...(runtime.lastObservedToolName ? { lastObservedToolName: runtime.lastObservedToolName } : {}),
    ...(runtime.lastAssistantMessageText ? { lastAssistantMessageText: runtime.lastAssistantMessageText } : {}),
  })
  emitRuntimeEvent(runtime, {
    type: 'session.interrupted',
    sessionId: runtime.sessionId,
    message,
  })
  if (status === 'failed') {
    emitRuntimeEvent(runtime, {
      type: 'error',
      sessionId: runtime.sessionId,
      message,
    })
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
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    systemPromptOverride: () => buildSystemPrompt(request),
  })
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
      resetTurnTracking(runtime)
      runtime.activeTurnState = 'responding'
      syncRuntimeStatus(runtime, 'running', 'running')
      logger.info('Pi Agent 开始运行', { sessionId: record.sessionId })
    } else if (event.type === 'agent_end') {
      const endedEarly = isEarlyEndedTurn(runtime)
      const endedWithToolResult = runtime.record.lastMessageRole === 'toolResult'
      const emptyToolResultStop = isEmptyToolResultStop(runtime)
      runtime.record.lastTurnEndedEarly = endedEarly
      runtime.record.endedWithToolResult = endedWithToolResult
      runtime.record.lastStopReason = emptyToolResultStop
        ? 'failed'
        : endedEarly
          ? 'read_only_observation_end'
          : 'normal'
      runtime.record.lastObservedToolName = runtime.lastObservedToolName
      runtime.record.lastAssistantMessageText = runtime.lastAssistantMessageText
      runtime.activeTurnState = emptyToolResultStop ? 'failed' : 'idle'
      syncRuntimeStatus(
        runtime,
        emptyToolResultStop ? 'failed' : 'completed',
        emptyToolResultStop ? 'failed' : 'completed',
      )
      emitRuntimeEvent(runtime, {
        type: 'session.stop_diagnosis',
        sessionId: record.sessionId,
        stopReason: runtime.record.lastStopReason,
        message: emptyToolResultStop
          ? '本轮未产生回复，可重试继续分析'
          : endedEarly
            ? '本轮在读取信息后已停止，可继续追问或继续分析'
            : '本轮已正常结束',
        endedWithToolResult,
        ...(runtime.lastObservedToolName ? { lastObservedToolName: runtime.lastObservedToolName } : {}),
        ...(runtime.lastAssistantMessageText ? { lastAssistantMessageText: runtime.lastAssistantMessageText } : {}),
      })
      if (endedEarly) {
        emitRuntimeEvent(runtime, {
          type: 'session.ended_early',
          sessionId: record.sessionId,
          message: '本轮在读取信息后已停止，可继续追问或继续分析',
        })
      } else if (emptyToolResultStop) {
        emitRuntimeEvent(runtime, {
          type: 'error',
          sessionId: runtime.sessionId,
          message: '本轮未产生回复，可重试继续分析',
        })
      }
      logger.info('Pi Agent 结束运行', { sessionId: record.sessionId })
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
      if (sseEvent.type === 'message.start') {
        syncTurnState(runtime, 'responding')
      } else if (sseEvent.type === 'message.completed') {
        runtime.lastAssistantMessageText = sseEvent.content
        runtime.record.lastAssistantMessageText = sseEvent.content
        runtime.record.lastMessageRole = 'assistant'
        runtime.record.endedWithToolResult = false
        if (runtime.runState === 'running') {
          syncTurnState(runtime, 'tooling')
        }
      } else if (sseEvent.type === 'tool.start') {
        runtime.currentTurnToolNames.push(sseEvent.toolCall.toolName)
        runtime.lastObservedToolName = sseEvent.toolCall.toolName
        runtime.record.lastObservedToolName = sseEvent.toolCall.toolName
        syncTurnState(runtime, 'tooling')
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
        syncPendingFollowUps(runtime)
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
        resetTurnTracking(runtime)
        runtime.activeTurnState = 'responding'
        syncRuntimeStatus(runtime, 'idle', 'idle')
        await (runtime.session as PiAgentContinueCapableSession).agent.continue()
      } else {
        logger.info('发送 prompt 到 Pi Agent')
        runtime.record.lastResumeTrigger = 'prompt'
        runtime.record.lastMessageRole = 'user'
        resetTurnTracking(runtime)
        runtime.activeTurnState = 'responding'
        syncRuntimeStatus(runtime, 'idle', 'idle')
        await runtime.session.prompt(message)
      }
    } catch (err: any) {
      logger.error('Pi Agent 发送消息失败', { error: err })
      interruptRuntime(runtime, err?.message || '未知错误')
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
    interruptRuntime(runtime, '当前会话已中断，可继续发送下一条消息。')
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
