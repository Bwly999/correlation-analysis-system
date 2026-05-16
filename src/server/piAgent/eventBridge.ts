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
  | { type: 'message.start'; sessionId: string; messageId: string; role: string }
  | { type: 'message.delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'message.thinking_delta'; sessionId: string; messageId: string; delta: string }
  | { type: 'message.completed'; sessionId: string; messageId: string; content: string }
  | { type: 'tool.start'; sessionId: string; toolCall: PiAgentToolCall }
  | { type: 'tool.end'; sessionId: string; toolCallId: string; result: string; isError: boolean }
  | { type: 'tool.execute'; sessionId: string; toolCallId: string; toolName: string; params: Record<string, unknown> }
  | { type: 'workflow.apply'; sessionId: string; plan: WorkflowAiPlan }
  | { type: 'error'; sessionId: string; message: string }

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  workflow_get_session_context: '读取分析上下文',
  workflow_get_node_catalog: '读取节点目录',
  workflow_list_data_sources: '列出数据源',
  workflow_get_data_source_schema: '读取字段摘要',
  workflow_search_nodes: '搜索节点',
  workflow_get_node: '读取节点信息',
  workflow_get_node_options: '读取节点候选项',
  workflow_profile_data_source: '数据源画像',
  workflow_recommend_methods: '推荐分析方法',
  workflow_create_workflow: '创建工作流',
  workflow_get_workflow: '读取工作流',
  workflow_update_partial_workflow: '增量修改工作流',
  workflow_update_full_workflow: '整包更新工作流',
  workflow_validate_workflow: '校验工作流结构',
  workflow_debug_node: '调试节点',
  workflow_executions: '读取执行历史',
  workflow_list_workflow_versions: '读取版本列表',
  workflow_get_workflow_version: '读取版本详情',
  workflow_rollback_workflow_version: '回滚工作流版本',
  workflow_get_execution_result: '读取执行结果',
  workflow_extract_result_evidence: '抽取结果证据',
  // 原子工作流操作工具
  wf_addNode: '添加节点',
  wf_connectNodes: '连接节点',
  wf_updateNodeConfig: '更新节点配置',
  wf_renameNode: '重命名节点',
  wf_removeNode: '删除节点',
  wf_disconnectEdge: '断开连线',
  wf_moveNode: '移动节点',
  wf_executeWorkflow: '执行工作流',
}

const WORKFLOW_MUTATION_TOOLS = new Set([
  'workflow_create_workflow',
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
      updateSessionRecord(sessionId, { status: 'completed' })
      events.push({ type: 'session.status', sessionId, status: 'completed' })
      break
    }

    case 'message_start': {
      const msgId = randomUUID()
      currentMessageId.value = msgId
      appendMessage(sessionId, {
        id: msgId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: Date.now(),
      })
      events.push({ type: 'message.start', sessionId, messageId: msgId, role: 'assistant' })
      break
    }

    case 'message_update': {
      const msgEvent = piEvent.assistantMessageEvent
      if (!msgEvent) break
      const msgId = currentMessageId.value

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
      const msgId = currentMessageId.value
      // 从 piEvent.message 中提取最终文本
      const finalText = extractTextFromMessage(piEvent.message)
      // 更新 store 中的消息
      const msg = record.messages.find((m) => m.id === msgId)
      if (msg) {
        msg.content = finalText
        msg.status = 'completed'
      }
      events.push({ type: 'message.completed', sessionId, messageId: msgId, content: finalText })
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
      events.push({ type: 'tool.end', sessionId, toolCallId, result: resultText, isError })
      break
    }
  }

  return events
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
