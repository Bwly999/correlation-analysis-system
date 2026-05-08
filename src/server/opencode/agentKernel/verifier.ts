import type {
  AgentKernelObservation,
  AgentKernelVerificationResult,
  VerifyAgentKernelProgressInput,
} from './types.js'
import { shouldAgentKernelAskForDataSource } from './context.js'

const extractEvidenceItems = (observations: AgentKernelObservation[]) =>
  observations.flatMap((observation) => {
    if (observation.type !== 'tool_result') return []
    if (observation.toolName !== 'workflow_extract_result_evidence') return []
    const evidence = observation.structuredContent.evidence
    return Array.isArray(evidence) ? evidence : []
  })

const hasSuccessfulExecution = (observations: AgentKernelObservation[]) =>
  observations.some((observation) =>
    observation.type === 'tool_result'
    && ['workflow_test_workflow', 'workflow_execute_plan'].includes(observation.toolName)
    && (
      observation.structuredContent.ok === true
      || observation.structuredContent.status === 'success'
      || observation.structuredContent.status === 'completed'
    ))

const hasAssistantClaim = (observations: AgentKernelObservation[]) =>
  observations.some((observation) =>
    observation.type === 'assistant_message' && observation.content.trim().length > 0)

export const verifyAgentKernelProgress = (
  input: VerifyAgentKernelProgressInput,
): AgentKernelVerificationResult => {
  if (input.intentKind === 'chat' || input.autonomy === 'chat') {
    return {
      status: hasAssistantClaim(input.observations) ? 'completed' : 'continue',
      message: hasAssistantClaim(input.observations) ? '普通对话已回复' : '继续生成普通回复',
    }
  }

  if (input.intentKind === 'agentic_analysis' && shouldAgentKernelAskForDataSource(input.request)) {
    return {
      status: 'waiting_user',
      message: '需要先提供可分析的数据源或字段摘要',
    }
  }

  if (input.intentKind === 'agentic_analysis' || input.intentKind === 'reporting') {
    const evidenceItems = extractEvidenceItems(input.observations)
    if (hasSuccessfulExecution(input.observations) && evidenceItems.length > 0) {
      return {
        status: 'completed',
        message: '已具备执行记录和可追溯证据',
      }
    }

    if (hasAssistantClaim(input.observations) && evidenceItems.length === 0) {
      return {
        status: 'needs_evidence',
        message: '报告核心结论缺少可追溯 evidenceId',
      }
    }
  }

  return {
    status: 'continue',
    message: '继续执行 agentic 工具闭环',
  }
}
