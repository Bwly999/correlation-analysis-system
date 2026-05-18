import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  defineTool,
} from '@earendil-works/pi-coding-agent'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type {
  JsTransformAgentSafeDebugResult,
  JsTransformAgentSessionRequest,
  PiAgentSafeToolResult,
} from '../../ai/types.js'
import { buildModelFromProfile, createModelRegistryFromProfile } from './modelAdapter.js'
import { FrontendBridge } from './frontendBridge.js'
import { buildJsTransformAgentSystemPrompt } from './jsTransformAgentSystemPrompt.js'
import type { PiAgentSseEvent } from './eventBridge.js'
import { bridgePiEvent } from './eventBridge.js'
import { createSessionRecord, getSessionRecord, updateSessionRecord, appendMessage, type PiAgentSessionRecord } from './sessionStore.js'

interface JsTransformAgentRuntime {
  session: AgentSession
  sessionId: string
  record: PiAgentSessionRecord
  bridge: FrontendBridge
  isStreaming: boolean
  currentMessageId: { value: string }
  eventListeners: Set<(event: PiAgentSseEvent) => void>
  lastDebugResult: JsTransformAgentSafeDebugResult | null
  unsubscribe?: () => void
}

const runtimes = new Map<string, JsTransformAgentRuntime>()

const buildToolSummary = (summary: string): PiAgentSafeToolResult => ({
  ok: true,
  scope: 'single',
  executionId: null,
  status: 'success',
  summary,
  nodes: [],
  artifacts: [],
  warnings: [],
})

const errorToolResult = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  details: {
    ok: false,
    scope: 'single' as const,
    executionId: null,
    status: 'failed',
    summary: message,
    nodes: [],
    artifacts: [],
    warnings: [message],
  },
  isError: true,
})

const createJsTransformAgentTools = (runtime: {
  request: JsTransformAgentSessionRequest
  bridge: FrontendBridge
  state: { lastDebugResult: JsTransformAgentSafeDebugResult | null }
}) => {
  if (runtime.request.mode === 'ask') {
    return []
  }

  return [
    defineTool({
      name: 'js_get_context',
      label: '读取当前节点上下文',
      description: '读取当前 JS代码执行 节点的代码、输入样本、结构和最近调试摘要。',
      parameters: Type.Object({}),
      async execute() {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(runtime.request.nodeContext, null, 2),
            },
          ],
          details: runtime.request.nodeContext,
        }
      },
    }),
    defineTool({
      name: 'js_update_code',
      label: '更新当前代码',
      description: '实时覆盖当前 JS代码执行 节点的代码内容。',
      parameters: Type.Object({
        code: Type.String(),
      }),
      async execute(callId, params) {
        try {
          return await runtime.bridge.request(callId, 'js_update_code', params as Record<string, unknown>)
        } catch (error: any) {
          return errorToolResult(error?.message || '更新当前代码失败')
        }
      },
    }),
    defineTool({
      name: 'js_debug_node',
      label: '调试当前节点',
      description: '通过当前节点既有调试执行链路验证当前代码。',
      parameters: Type.Object({
        mode: Type.Optional(
          Type.Union([
            Type.Literal('reuse_cached_upstream'),
            Type.Literal('rerun_upstream'),
          ]),
        ),
      }),
      async execute(callId, params) {
        try {
          const result = await runtime.bridge.request(callId, 'js_debug_node', params as Record<string, unknown>)
          const details = result.details as unknown as JsTransformAgentSafeDebugResult
          runtime.state.lastDebugResult = details
          return result
        } catch (error: any) {
          return errorToolResult(error?.message || '调试当前节点失败')
        }
      },
    }),
    defineTool({
      name: 'js_get_last_debug_result',
      label: '读取最近调试结果',
      description: '读取最近一次当前节点调试的安全摘要。',
      parameters: Type.Object({}),
      async execute() {
        const summary = runtime.state.lastDebugResult ?? {
          ok: false,
          status: 'idle' as const,
          summary: '当前尚无调试结果',
          outputSample: [],
          errorMessage: '',
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
          details: buildToolSummary(summary.summary),
        }
      },
    }),
  ]
}

export async function createJsTransformAgentSession(
  request: JsTransformAgentSessionRequest,
  userId: string,
): Promise<{ sessionId: string; status: string; mode: string; prompt: string }> {
  const record = createSessionRecord(
    {
      mode: 'edit',
      prompt: request.prompt,
      profile: request.profile,
      nodeCatalog: [],
      dataSources: [],
    },
    userId,
  )

  const eventListeners = new Set<(event: PiAgentSseEvent) => void>()
  const bridge = new FrontendBridge((event) => {
    const sseEvent: PiAgentSseEvent = {
      type: 'tool.execute',
      sessionId: record.sessionId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      params: event.params,
    }
    for (const listener of eventListeners) {
      listener(sseEvent)
    }
  })

  const state = { lastDebugResult: null as JsTransformAgentSafeDebugResult | null }
  const tools = createJsTransformAgentTools({ request, bridge, state })
  const { authStorage, modelRegistry } = createModelRegistryFromProfile(request.profile)
  const model = buildModelFromProfile(request.profile)

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    systemPromptOverride: () => buildJsTransformAgentSystemPrompt(request),
  })
  await resourceLoader.reload()

  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    model: model as never,
    thinkingLevel: 'low',
    cwd: process.cwd(),
    customTools: tools,
    resourceLoader,
    noTools: 'builtin',
  })

  const runtime: JsTransformAgentRuntime = {
    session,
    sessionId: record.sessionId,
    record,
    bridge,
    isStreaming: false,
    currentMessageId: { value: '' },
    eventListeners,
    lastDebugResult: null,
  }

  runtime.unsubscribe = session.subscribe((event) => {
    if (event.type === 'agent_start') {
      runtime.isStreaming = true
    } else if (event.type === 'agent_end') {
      runtime.isStreaming = false
    }

    const sseEvents = bridgePiEvent(event, record, runtime.currentMessageId)
    for (const sseEvent of sseEvents) {
      for (const listener of eventListeners) {
        listener(sseEvent)
      }
    }
  })

  runtimes.set(record.sessionId, runtime)

  return {
    sessionId: record.sessionId,
    status: record.status,
    mode: request.mode,
    prompt: request.prompt,
  }
}

export async function sendJsTransformAgentMessage(
  sessionId: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return { ok: false, error: '会话不存在' }

  appendMessage(sessionId, {
    id: `user_${Date.now()}`,
    role: 'user',
    visibility: 'user',
    content: message,
    rawContent: message,
    status: 'completed',
    createdAt: Date.now(),
  })

  const sendPromise = (async () => {
    try {
      if (runtime.isStreaming) {
        await runtime.session.followUp(message)
      } else {
        await runtime.session.prompt(message)
      }
    } catch {
      updateSessionRecord(sessionId, { status: 'failed' })
    }
  })()

  sendPromise.catch(() => {})
  return { ok: true }
}

export function subscribeJsTransformAgentEvents(
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

export function getJsTransformAgentSession(sessionId: string) {
  return getSessionRecord(sessionId) || null
}

export function resolveJsTransformAgentToolResult(
  sessionId: string,
  toolCallId: string,
  result: {
    content: Array<{ type: 'text'; text: string }>
    details: PiAgentSafeToolResult | JsTransformAgentSafeDebugResult
    isError?: boolean
  },
): boolean {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return false

  const maybeDebugResult = result.details as Partial<JsTransformAgentSafeDebugResult>
  if ('outputSample' in maybeDebugResult && 'summary' in maybeDebugResult && 'status' in maybeDebugResult) {
    runtime.lastDebugResult = maybeDebugResult as JsTransformAgentSafeDebugResult
  }

  if (result.isError) {
    return runtime.bridge.rejectResult(toolCallId, new Error(result.content[0]?.text || '前端执行错误'))
  }
  return runtime.bridge.resolveResult(toolCallId, result as never)
}

export function disposeJsTransformAgentSession(sessionId: string): void {
  const runtime = runtimes.get(sessionId)
  if (!runtime) return

  runtime.bridge.dispose()
  runtime.unsubscribe?.()
  runtime.session.dispose()
  runtime.eventListeners.clear()
  runtimes.delete(sessionId)
}

export function disposeAllJsTransformAgentSessions(): void {
  for (const sessionId of runtimes.keys()) {
    disposeJsTransformAgentSession(sessionId)
  }
}
