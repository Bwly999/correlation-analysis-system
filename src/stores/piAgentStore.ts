/**
 * Pi Agent Store - 简化版 Agent 状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePiAgentConfigStore } from './piAgentConfigStore'
import { useWorkflowStore } from './workflowStore'
import { WorkflowApi } from '@/api/workflowApi'
import type { WorkflowExecutionOptions } from '@/api/workflowApi'
import { getPiWorkflowToolSpecsByTarget } from '@/shared/piWorkflowTools'
import { buildPiAgentSafeToolResult } from './piAgentSafeToolResult'
import type { PiAgentSafeToolResult } from '@/ai/types'
import { queryPiAgentNode, queryPiAgentNodeCatalog } from '@/services/piAgentNodeQuery'
import type { WorkflowExecutionResult, WorkflowNodeDebugResult } from './workflowStore'
import {
  createPiAgentSession,
  getPiAgentSession,
  type PiAgentSessionDetailResponse,
  type PiAgentSessionMessageDto,
  type PiAgentSessionToolCallDto,
  resolvePiAgentToolResult,
  reportPiAgentToolProgress,
  sendPiAgentMessage,
  syncPiAgentCanvas,
  streamPiAgentEvents,
} from '@/services/piAgentClient'
import { buildSanitizedWorkflowSnapshot } from './piAgentSanitize'
import type { WorkflowAiOperation } from '@/ai/types'

export interface PiAgentMessage {
  id: string
  role: 'user' | 'assistant'
  visibility: 'user' | 'assistant_visible' | 'assistant_debug'
  content: string
  rawContent?: string
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

type SessionStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'failed' | 'interrupted'
type StopReason = 'normal' | 'read_only_observation_end' | 'interrupted' | 'failed'
type RawExecutionResult = WorkflowExecutionResult | WorkflowNodeDebugResult
type LocalToolStructuredResult = {
  content: Array<{ type: 'text'; text: string }>
  details: Record<string, unknown>
}

const isWorkflowExecutionResult = (value: unknown): value is WorkflowExecutionResult =>
  Boolean(value)
  && typeof value === 'object'
  && 'scope' in (value as Record<string, unknown>)
  && 'status' in (value as Record<string, unknown>)
  && ((value as Record<string, unknown>).scope === 'global')

const isWorkflowNodeDebugResult = (value: unknown): value is WorkflowNodeDebugResult =>
  Boolean(value)
  && typeof value === 'object'
  && 'scope' in (value as Record<string, unknown>)
  && (value as Record<string, unknown>).scope === 'single'
  && 'output' in (value as Record<string, unknown>)

const isLocalToolStructuredResult = (value: unknown): value is LocalToolStructuredResult =>
  Boolean(value)
  && typeof value === 'object'
  && 'content' in (value as Record<string, unknown>)
  && Array.isArray((value as { content?: unknown }).content)
  && 'details' in (value as Record<string, unknown>)
  && Boolean((value as { details?: unknown }).details)
  && typeof (value as { details?: unknown }).details === 'object'

export const usePiAgentStore = defineStore('piAgent', () => {
  // --- State ---
  const sessionId = ref<string | null>(null)
  const status = ref<SessionStatus>('idle')
  const lastStopReason = ref<StopReason>('normal')
  const messages = ref<PiAgentMessage[]>([])
  const errorMessage = ref('')
  const inputText = ref('')
  const localExecutionCache = new Map<string, RawExecutionResult>()
  const TOOL_PROGRESS_HEARTBEAT_MS = 10_000
  const STRUCTURE_SYNC_TOOL_NAMES = new Set([
    'workflow_update_partial_workflow',
  ])

  // SSE 连接
  let eventSource: AbortController | null = null
  let eventStreamTask: Promise<void> | null = null
  let eventStreamReadyTask: Promise<void> | null = null
  const isEventStreamConnected = ref(false)
  const isRecoveringSession = ref(false)

  // --- Computed ---
  const isStreaming = computed(() => status.value === 'running')
  const canSend = computed(
    () => inputText.value.trim().length > 0 && status.value !== 'connecting',
  )

  const stopHintMessage = (stopReason: StopReason, fallbackMessage?: string) => {
    if (stopReason === 'read_only_observation_end') {
      return fallbackMessage || '本轮在读取信息后已停止，可继续追问或继续分析'
    }
    if (stopReason === 'interrupted') {
      return fallbackMessage || '本轮已中断，可继续发送下一条消息'
    }
    if (stopReason === 'failed') {
      return fallbackMessage || '当前处理失败，请重试'
    }
    return fallbackMessage || ''
  }

  const buildToolCall = (toolCall: PiAgentSessionToolCallDto): PiAgentToolCall => ({
    id: toolCall.id,
    toolName: toolCall.toolName,
    displayName: toolCall.displayName,
    args: toolCall.args,
    status: toolCall.status,
    ...(toolCall.result ? { result: toolCall.result } : {}),
    ...(toolCall.isError !== undefined ? { isError: toolCall.isError } : {}),
  })

  const buildMessage = (
    message: PiAgentSessionMessageDto,
    fallbackToolCalls: PiAgentToolCall[] = [],
  ): PiAgentMessage => ({
    id: message.id,
    role: message.role,
    visibility: message.visibility,
    content: message.content,
    rawContent: message.rawContent,
    thinking: message.thinking ?? '',
    status: message.status,
    toolCalls: (message.toolCalls?.map(buildToolCall) ?? fallbackToolCalls).map((toolCall) => ({ ...toolCall })),
    createdAt: message.createdAt,
  })

  const applySessionSnapshot = (detail: PiAgentSessionDetailResponse) => {
    if (!detail) return
    const pendingFollowUps = detail.pendingFollowUps ?? []
    const lastTurnEndedEarly = detail.lastTurnEndedEarly ?? false
    const stopReason = detail.lastStopReason ?? (lastTurnEndedEarly ? 'read_only_observation_end' : 'normal')
    lastStopReason.value = stopReason

    const fallbackToolCalls = detail.toolCalls.map(buildToolCall)
    let assignedToolCalls = false

    messages.value = detail.messages.map((message) => {
      if (message.role !== 'assistant' || assignedToolCalls || message.toolCalls?.length) {
        return buildMessage(message)
      }

      assignedToolCalls = fallbackToolCalls.length > 0
      return buildMessage(message, fallbackToolCalls)
    })
    status.value = detail.status
    if (stopReason === 'read_only_observation_end' || lastTurnEndedEarly) {
      errorMessage.value = stopHintMessage('read_only_observation_end')
    } else if (stopReason === 'failed' && detail.endedWithToolResult && !detail.lastAssistantMessageText?.trim()) {
      status.value = 'failed'
      errorMessage.value = '本轮未产生回复，可重试继续分析'
    } else if (pendingFollowUps.length > 0) {
      errorMessage.value = `已加入继续处理队列，前面还有 ${pendingFollowUps.length} 条待处理消息`
    } else if (stopReason === 'interrupted') {
      errorMessage.value = stopHintMessage('interrupted')
    } else if (stopReason === 'failed') {
      status.value = 'failed'
      errorMessage.value = stopHintMessage('failed')
    } else {
      errorMessage.value = ''
    }
  }

  const recoverSessionState = async (sid: string, reason: string) => {
    if (isRecoveringSession.value) return
    isRecoveringSession.value = true

    try {
      const detail = await getPiAgentSession(sid)
      if (!detail) {
        status.value = 'failed'
        errorMessage.value = reason
        return
      }

      applySessionSnapshot(detail)
      if (detail.status === 'running') {
        status.value = 'interrupted'
      }
      if (detail.status === 'interrupted' || detail.status === 'running') {
        lastStopReason.value = 'interrupted'
        errorMessage.value = stopHintMessage('interrupted')
      } else if ((detail.lastStopReason ?? 'normal') === 'read_only_observation_end' || (detail.lastTurnEndedEarly ?? false)) {
        lastStopReason.value = 'read_only_observation_end'
        errorMessage.value = stopHintMessage('read_only_observation_end')
      } else if ((detail.lastStopReason ?? 'normal') === 'failed' && detail.endedWithToolResult && !detail.lastAssistantMessageText?.trim()) {
        lastStopReason.value = 'failed'
        status.value = 'failed'
        errorMessage.value = '本轮未产生回复，可重试继续分析'
      } else if ((detail.pendingFollowUps ?? []).length > 0) {
        errorMessage.value = `已加入继续处理队列，前面还有 ${(detail.pendingFollowUps ?? []).length} 条待处理消息`
      } else if (detail.status === 'failed') {
        lastStopReason.value = 'failed'
        status.value = 'failed'
        errorMessage.value = reason
      }
    } catch (err: any) {
      status.value = 'failed'
      errorMessage.value = err?.message || reason
    } finally {
      isRecoveringSession.value = false
    }
  }

  // --- Actions ---

  async function ensureSession(prompt: string) {
    if (sessionId.value) return true

    const configStore = usePiAgentConfigStore()
    const workflowStore = useWorkflowStore()

    // 确保 profiles 已加载
    if (!configStore.selectedProfile) {
      await configStore.loadProfiles()
    }

    const profile = configStore.selectedProfile
    if (!profile) {
      errorMessage.value = '未配置模型，请在 .env.local 中设置 OPENAI_API_KEY 等环境变量'
      status.value = 'failed'
      return false
    }

    const contextHints = await configStore.buildContextHints(workflowStore as any, prompt)
    const workflowSnapshot = workflowStore.nodes.length > 0
      ? buildSanitizedWorkflowSnapshot({
          name: workflowStore.workflowName || '未命名工作流',
          nodes: workflowStore.nodes as any[],
          edges: workflowStore.edges as any[],
          getNodeOutput: workflowStore.getNodeOutput,
          getNodeError: workflowStore.getNodeError,
          getNodeLogs: workflowStore.getNodeLogs,
        })
      : undefined

    // 构建 session 请求
    const request = {
      mode: 'create' as const,
      prompt,
      profile,
      workflowSnapshot,
      contextHints: contextHints ?? undefined,
      dataSources: contextHints?.schemaSummaries?.map((s: any) => ({
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
      const data = await createPiAgentSession(request)
      sessionId.value = data.sessionId
      await connectEventStream(data.sessionId)
      status.value = 'idle'
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
    errorMessage.value = ''
    lastStopReason.value = 'normal'

    // 如果没有 session，先创建
    if (!sessionId.value) {
      const ok = await ensureSession(content)
      if (!ok) return
    } else if (!isEventStreamConnected.value) {
      status.value = 'connecting'
      try {
        await connectEventStream(sessionId.value)
        status.value = 'idle'
      } catch (err: any) {
        status.value = 'failed'
        errorMessage.value = err?.message || '连接 Pi Agent 事件流失败'
        return
      }
    }

    try {
      await syncCanvasSnapshotIfNeeded()
    } catch (err: any) {
      status.value = 'failed'
      errorMessage.value = err?.message || '同步当前画布失败'
      return
    }

    // 添加用户消息
    messages.value.push({
      id: `user_${Date.now()}`,
      role: 'user',
      visibility: 'user',
      content,
      rawContent: content,
      thinking: '',
      status: 'completed',
      toolCalls: [],
      createdAt: Date.now(),
    })

    status.value = 'running'

    try {
      const result = await sendPiAgentMessage(sessionId.value!, content)
      if (!result.ok) {
        throw new Error(result.error || '发送消息失败')
      }
    } catch (err: any) {
      status.value = 'failed'
      errorMessage.value = err?.message || '发送消息失败'
    }
  }

  async function connectEventStream(sid: string) {
    if (eventSource && !eventSource.signal.aborted) {
      if (isEventStreamConnected.value) {
        return Promise.resolve()
      }
      return eventStreamReadyTask ?? Promise.resolve()
    }

    const controller = new AbortController()
    eventSource = controller
    isEventStreamConnected.value = false
    let markReady!: () => void
    let markReadyFailed!: (error: Error) => void
    let readySettled = false

    eventStreamReadyTask = new Promise<void>((resolve, reject) => {
      markReady = () => {
        if (readySettled) return
        readySettled = true
        resolve()
      }
      markReadyFailed = (error: Error) => {
        if (readySettled) return
        readySettled = true
        reject(error)
      }
    })

    eventStreamTask = streamPiAgentEvents(sid, {
      onOpen: () => {
        isEventStreamConnected.value = true
        markReady()
      },
      onEvent: (event) => {
        handleEvent(event)
      },
      signal: controller.signal,
    })
      .then(async () => {
        if (eventSource !== controller || controller.signal.aborted) return
        isEventStreamConnected.value = false
        eventSource = null
        eventStreamTask = null
        eventStreamReadyTask = null
        markReadyFailed(new Error('Pi Agent 事件流已结束'))
        await recoverSessionState(sid, '本轮已中断，可继续发送下一条消息')
      })
      .catch(async (err: any) => {
        if (controller.signal.aborted) {
          isEventStreamConnected.value = false
          if (eventSource === controller) {
            eventSource = null
          }
          eventStreamTask = null
          eventStreamReadyTask = null
          markReadyFailed(err instanceof Error ? err : new Error('Pi Agent 事件流已取消'))
          return
        }

        isEventStreamConnected.value = false
        if (eventSource === controller) {
          eventSource = null
        }
        eventStreamTask = null
        eventStreamReadyTask = null
        markReadyFailed(err instanceof Error ? err : new Error('连接 Pi Agent 事件流失败'))
        await recoverSessionState(sid, err?.message || '本轮已中断，可继续发送下一条消息')
      })

    return eventStreamReadyTask
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
        } else if (event.status === 'interrupted') {
          status.value = 'interrupted'
        }
        break
      }

      case 'session.interrupted': {
        status.value = 'interrupted'
        lastStopReason.value = 'interrupted'
        errorMessage.value = stopHintMessage('interrupted', event.message)
        break
      }

      case 'session.ended_early': {
        status.value = 'completed'
        lastStopReason.value = 'read_only_observation_end'
        errorMessage.value = stopHintMessage('read_only_observation_end', event.message)
        break
      }

      case 'session.stop_diagnosis': {
        lastStopReason.value = event.stopReason ?? 'normal'
        if (event.stopReason === 'read_only_observation_end') {
          status.value = 'completed'
          errorMessage.value = stopHintMessage('read_only_observation_end', event.message)
        } else if (event.stopReason === 'interrupted') {
          status.value = 'interrupted'
          errorMessage.value = stopHintMessage('interrupted', event.message)
        } else if (event.stopReason === 'failed') {
          status.value = 'failed'
          errorMessage.value = event.endedWithToolResult
            ? '本轮未产生回复，可重试继续分析'
            : stopHintMessage('failed', event.message)
        }
        break
      }

      case 'follow_up_queued': {
        status.value = 'completed'
        lastStopReason.value = 'normal'
        errorMessage.value = event.queueLength > 1
          ? `已加入继续处理队列，前面还有 ${event.queueLength} 条待处理消息`
          : '已加入继续处理队列，当前分析结束后会自动继续'
        break
      }

      case 'follow_up_drained': {
        status.value = 'running'
        lastStopReason.value = 'normal'
        errorMessage.value = ''
        break
      }

      case 'message.start': {
        messages.value.push({
          id: event.messageId,
          role: 'assistant',
          visibility: event.visibility ?? 'assistant_visible',
          content: '',
          rawContent: '',
          thinking: '',
          status: 'streaming',
          toolCalls: [],
          createdAt: Date.now(),
        })
        break
      }

      case 'message.delta': {
        const msg = messages.value.find((m) => m.id === event.messageId)
        if (msg) {
          msg.content += event.delta
          msg.rawContent = `${msg.rawContent ?? ''}${event.delta}`
        }
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
          msg.rawContent = event.rawContent || event.content || msg.rawContent
          msg.visibility = event.visibility ?? msg.visibility
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

      case 'tool.execute': {
        handleToolExecute(event)
        break
      }

      case 'error': {
        status.value = 'failed'
        lastStopReason.value = 'failed'
        errorMessage.value = event.message
        break
      }
    }
  }

  /**
   * Tool Name → WorkflowApi 方法的轻量路由映射
   * 遵循"不做 switch-case，用映射表"的原则
   */
  const executorImplementations: Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>> = {
    updatePartialWorkflow: (p) =>
      WorkflowApi.applyPartialWorkflowUpdate({
        operations: p.operations as WorkflowAiOperation[],
        summary: p.summary as string | undefined,
        validateAfterApply: p.validateAfterApply as boolean | undefined,
      }),
    runWorkflow: async (p) => {
      const mode =
        p.mode === 'reuse_cached_upstream' || p.mode === 'rerun_upstream'
          ? p.mode
          : undefined

      const executionOptions: WorkflowExecutionOptions =
        p.scope === 'node'
          ? {
              scope: 'node',
              nodeId: p.nodeId as string,
              ...(mode ? { mode } : {}),
            }
          : {
              scope: 'workflow',
              ...(mode ? { mode } : {}),
            }

      return WorkflowApi.executeWorkflow(executionOptions)
    },
    getNodeCatalog: (p) =>
      queryPiAgentNodeCatalog({
        limit: typeof p.limit === 'number' ? p.limit : undefined,
        offset: typeof p.offset === 'number' ? p.offset : undefined,
      }),
    getNode: (p) =>
      queryPiAgentNode({
        nodeType: String(p.nodeType ?? ''),
        mode:
          p.mode === 'info'
          || p.mode === 'docs'
          || p.mode === 'search_properties'
          || p.mode === 'runtime_requirements'
            ? p.mode
            : undefined,
        propertyQuery: typeof p.propertyQuery === 'string' ? p.propertyQuery : undefined,
        config:
          p.config && typeof p.config === 'object' && !Array.isArray(p.config)
            ? (p.config as Record<string, unknown>)
            : undefined,
      }),
  }

  const registerToolExecutors = (target: 'frontend_canvas' | 'frontend_bridge') =>
    getPiWorkflowToolSpecsByTarget(target).map((spec) => {
      const executor = executorImplementations[spec.executorKey]
      if (typeof executor !== 'function') {
        throw new Error(`未注册 ${target} tool executor: ${spec.executorKey}`)
      }
      return [spec.name, executor] as const
    })

  const TOOL_EXECUTORS = Object.fromEntries([
    ...registerToolExecutors('frontend_canvas'),
    ...registerToolExecutors('frontend_bridge'),
  ]) as Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>

  /**
   * 处理 tool.execute 事件：
   * 1. 执行对应的 WorkflowApi 操作
   * 2. 将结果通过 HTTP POST 返回给后端
   */
  async function handleToolExecute(event: {
    sessionId: string
    toolCallId: string
    toolName: string
    params: Record<string, unknown>
  }) {
    const executor = TOOL_EXECUTORS[event.toolName]
    const requestedScope = event.params.scope === 'node' ? 'single' : 'global'
    if (!executor) {
      await sendToolResult(event.sessionId, event.toolCallId, {
        content: [{ type: 'text', text: `未知工具: ${event.toolName}` }],
        details: {
          ok: false,
          scope: requestedScope,
          executionId: null,
          status: 'failed',
          summary: `未知工具: ${event.toolName}`,
          nodes: [],
          artifacts: [],
          warnings: [`未知工具: ${event.toolName}`],
        },
        isError: true,
      })
      return
    }

    const stopHeartbeat = createToolProgressHeartbeat(event.sessionId, event.toolCallId)
    try {
      const result = await executor(event.params)
      const safeResult = toSafeToolResult(event.toolName, event.toolCallId, result)
      const toolContent = isLocalToolStructuredResult(result)
        ? result.content
        : [{ type: 'text' as const, text: safeResult.summary }]

      if (STRUCTURE_SYNC_TOOL_NAMES.has(event.toolName)) {
        await syncCanvasSnapshotIfNeeded()
      }

      await sendToolResult(event.sessionId, event.toolCallId, {
        content: toolContent,
        details: safeResult,
        })
    } catch (err: any) {
      await sendToolResult(event.sessionId, event.toolCallId, {
        content: [{ type: 'text', text: err?.message || '执行失败' }],
        details: {
          ok: false,
          scope: requestedScope,
          executionId: null,
          status: 'failed',
          summary: err?.message || '执行失败',
          nodes: [],
          artifacts: [],
          warnings: [err?.message || '执行失败'],
        },
        isError: true,
      })
    } finally {
      stopHeartbeat()
    }
  }

  const createToolProgressHeartbeat = (sid: string, toolCallId: string) => {
    const timer = window.setInterval(() => {
      void reportPiAgentToolProgress(sid, toolCallId).catch(() => {
        console.warn('[PiAgent] 续期工具执行失败')
      })
    }, TOOL_PROGRESS_HEARTBEAT_MS)

    return () => {
      window.clearInterval(timer)
    }
  }

  async function syncCanvasSnapshotIfNeeded() {
    if (!sessionId.value) return
    const workflowStore = useWorkflowStore()
    const snapshot = workflowStore.createAgentWorkflowSnapshot()
    await syncPiAgentCanvas(sessionId.value, buildSanitizedWorkflowSnapshot({
      name: snapshot.name,
      nodes: snapshot.nodes as any[],
      edges: snapshot.edges as any[],
      getNodeOutput: workflowStore.getNodeOutput,
      getNodeError: workflowStore.getNodeError,
      getNodeLogs: workflowStore.getNodeLogs,
    }))
  }

  /**
   * 将工具执行结果通过 HTTP POST 发送回后端
   */
  async function sendToolResult(
    sid: string,
    toolCallId: string,
    result: { content: Array<{ type: 'text'; text: string }>; details: PiAgentSafeToolResult; isError?: boolean },
  ) {
    try {
      await resolvePiAgentToolResult(sid, toolCallId, result)
    } catch {
      console.warn('[PiAgent] 发送工具结果失败')
    }
  }

  function disconnect() {
    eventSource?.abort()
    eventSource = null
    eventStreamTask = null
    eventStreamReadyTask = null
    isEventStreamConnected.value = false
    localExecutionCache.clear()
  }

  function reset() {
    disconnect()
    sessionId.value = null
    status.value = 'idle'
    lastStopReason.value = 'normal'
    messages.value = []
    errorMessage.value = ''
    inputText.value = ''
  }

  function cacheExecutionResult(
    sid: string,
    toolCallId: string,
    result: RawExecutionResult,
  ) {
    const executionId = 'executionId' in result && result.executionId ? result.executionId : null
    const cacheKey = executionId ? `${sid}:${executionId}` : `${sid}:${toolCallId}`
    localExecutionCache.set(cacheKey, result)
  }

  function toSafeToolResult(
    toolName: string,
    toolCallId: string,
    result: unknown,
  ): PiAgentSafeToolResult {
    if (isWorkflowExecutionResult(result) || isWorkflowNodeDebugResult(result)) {
      cacheExecutionResult(sessionId.value ?? 'unknown', toolCallId, result)
      return buildPiAgentSafeToolResult({
        toolName,
        toolCallId,
        rawResult: result,
      })
    }

    if (isLocalToolStructuredResult(result)) {
      const details = (result as {
        details: {
          summary?: unknown
        }
      }).details

      return {
        ok: true,
        scope: 'global',
        executionId: null,
        status: 'success',
        summary: typeof details.summary === 'string' ? details.summary : '操作已完成',
        nodes: [],
        artifacts: [],
        warnings: [],
      }
    }

    return {
      ok: true,
      scope: 'global',
      executionId: null,
      status: 'success',
      summary:
        typeof result === 'string'
          ? result
          : result && typeof result === 'object' && 'details' in result
            ? ((result as { details?: { summary?: unknown } }).details?.summary as string | undefined) ?? '操作已完成'
            : '操作已完成',
      nodes: [],
      artifacts: [],
      warnings: [],
    }
  }

  return {
    // State
    sessionId,
    status,
    lastStopReason,
    messages,
    errorMessage,
    inputText,
    // Computed
    isStreaming,
    canSend,
    // Actions
    ensureSession,
    sendMessage,
    syncCanvasSnapshotIfNeeded,
    disconnect,
    reset,
    handleEvent,
  }
})
