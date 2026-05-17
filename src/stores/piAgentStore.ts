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
import type { WorkflowExecutionResult, WorkflowNodeDebugResult } from './workflowStore'
import {
  createPiAgentSession,
  resolvePiAgentToolResult,
  sendPiAgentMessage,
  syncPiAgentCanvas,
  streamPiAgentEvents,
} from '@/services/piAgentClient'

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
type RawExecutionResult = WorkflowExecutionResult | WorkflowNodeDebugResult

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

export const usePiAgentStore = defineStore('piAgent', () => {
  // --- State ---
  const sessionId = ref<string | null>(null)
  const status = ref<SessionStatus>('idle')
  const messages = ref<PiAgentMessage[]>([])
  const errorMessage = ref('')
  const inputText = ref('')
  const localExecutionCache = new Map<string, RawExecutionResult>()
  const STRUCTURE_SYNC_TOOL_NAMES = new Set([
    'wf_addNode',
    'wf_connectNodes',
    'wf_updateNodeConfig',
    'wf_renameNode',
    'wf_removeNode',
    'wf_disconnectEdge',
  ])

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
      content,
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

  function connectEventStream(sid: string) {
    const controller = new AbortController()
    eventSource = controller

    streamPiAgentEvents(sid, {
      onEvent: (event) => {
        handleEvent(event)
      },
    })
      .then((res) => {
        return res
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

      case 'tool.execute': {
        handleToolExecute(event)
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

  /**
   * Tool Name → WorkflowApi 方法的轻量路由映射
   * 遵循"不做 switch-case，用映射表"的原则
   */
  const executorImplementations: Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>> = {
    addNode: (p) =>
      WorkflowApi.addNode(
        p.nodeType as string,
        p.label as string | undefined,
        p.position as { x: number; y: number } | undefined,
        p.config as Record<string, unknown> | undefined,
      ),
    connectNodes: (p) =>
      WorkflowApi.connectNodes(
        p.sourceId as string,
        p.targetId as string,
        p.sourceHandle || p.targetHandle
          ? { sourceHandle: p.sourceHandle as string, targetHandle: p.targetHandle as string }
          : undefined,
      ),
    updateNodeConfig: (p) =>
      WorkflowApi.updateNodeConfig(p.nodeId as string, p.config as Record<string, unknown>),
    renameNode: (p) =>
      WorkflowApi.renameNode(p.nodeId as string, p.label as string),
    removeNode: (p) =>
      WorkflowApi.removeNode(p.nodeId as string),
    disconnectEdge: (p) =>
      WorkflowApi.disconnectEdge(p.edgeId as string),
    moveNode: (p) =>
      WorkflowApi.moveNode(p.nodeId as string, p.position as { x: number; y: number }),
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
  }

  const TOOL_EXECUTORS = Object.fromEntries(
    getPiWorkflowToolSpecsByTarget('frontend_canvas')
      .map((spec) => [spec.name, executorImplementations[spec.executorKey]])
      .filter((entry) => typeof entry[1] === 'function'),
  ) as Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>

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

    try {
      const result = await executor(event.params)
      const safeResult = toSafeToolResult(event.toolName, event.toolCallId, result)

      if (STRUCTURE_SYNC_TOOL_NAMES.has(event.toolName)) {
        await syncCanvasSnapshotIfNeeded()
      }

      await sendToolResult(event.sessionId, event.toolCallId, {
        content: [{ type: 'text', text: safeResult.summary }],
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
    }
  }

  async function syncCanvasSnapshotIfNeeded() {
    if (!sessionId.value) return
    const workflowStore = useWorkflowStore()
    await syncPiAgentCanvas(sessionId.value, workflowStore.createAgentWorkflowSnapshot())
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
    ndjsonReader = null
    localExecutionCache.clear()
  }

  function reset() {
    disconnect()
    sessionId.value = null
    status.value = 'idle'
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

    return {
      ok: true,
      scope: 'global',
      executionId: null,
      status: 'success',
      summary: typeof result === 'string' ? result : '操作已完成',
      nodes: [],
      artifacts: [],
      warnings: [],
    }
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
    syncCanvasSnapshotIfNeeded,
    disconnect,
    reset,
    handleEvent,
  }
})
