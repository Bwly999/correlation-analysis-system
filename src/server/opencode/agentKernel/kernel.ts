import type { AgentSessionEvent, WorkflowAiPlanRequest } from '../../../ai/types.js'
import { routeAgentIntent } from './router.js'
import { getAgentSkillByName } from './skillRegistry.js'
import { verifyAgentKernelProgress } from './verifier.js'
import { createNoopAgentKernelAdapter, type AgentKernelRuntimeAdapter } from './opencodeAdapter.js'
import type {
  AgentKernelAutonomy,
  AgentKernelIntent,
  AgentKernelObservation,
  AgentKernelSkill,
  AgentKernelVerificationResult,
} from './types.js'

export type RunAgentKernelInput = {
  sessionId: string
  message: string
  request: WorkflowAiPlanRequest
  autonomy: AgentKernelAutonomy
  maxIterations?: number
  adapter?: AgentKernelRuntimeAdapter
  emitEvent?: (event: AgentSessionEvent) => void
}

export type RunAgentKernelOutput = {
  intent: AgentKernelIntent
  skill: AgentKernelSkill
  observations: AgentKernelObservation[]
  verification: AgentKernelVerificationResult
}

const publishAgenticStage = (
  input: RunAgentKernelInput,
  stage: string,
  message: string,
  iteration = 0,
) => {
  input.emitEvent?.({
    type: 'agentic.stage.updated',
    run: {
      runId: `kernel_${input.sessionId}`,
      stage,
      message,
      iteration,
    },
  } as AgentSessionEvent)
}

const shouldContinueAfterVerification = (verification: AgentKernelVerificationResult) =>
  verification.status === 'continue' || verification.status === 'needs_evidence'

export const runAgentKernel = async (
  input: RunAgentKernelInput,
): Promise<RunAgentKernelOutput> => {
  const intent = routeAgentIntent({
    message: input.message,
    request: input.request,
    autonomy: input.autonomy,
  })
  const skill = getAgentSkillByName(intent.skillName) ?? getAgentSkillByName('general-chat')

  if (!skill) {
    throw new Error(`未找到 Agent Skill: ${intent.skillName}`)
  }

  const initialVerification = verifyAgentKernelProgress({
    intentKind: intent.kind,
    autonomy: intent.autonomy,
    request: input.request,
    observations: [],
  })

  if (initialVerification.status === 'waiting_user') {
    publishAgenticStage(input, 'waiting_user', initialVerification.message)
    return {
      intent,
      skill,
      observations: [],
      verification: initialVerification,
    }
  }

  const adapter = input.adapter ?? createNoopAgentKernelAdapter()
  const maxIterations = Math.max(1, input.maxIterations ?? 3)
  let observations: AgentKernelObservation[] = []
  let verification: AgentKernelVerificationResult = initialVerification

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (!intent.requiresToolLoop && input.autonomy !== 'chat') {
      break
    }

    const adapterResult = await adapter.runPrompt({
      sessionId: input.sessionId,
      message: input.message,
      request: input.request,
      intent,
      skill,
      iteration,
      previousObservations: observations,
      verification: iteration === 1 ? undefined : verification,
    })

    observations = [
      ...observations,
      ...adapterResult.observations,
    ]

    verification = verifyAgentKernelProgress({
      intentKind: intent.kind,
      autonomy: intent.autonomy,
      request: input.request,
      observations,
    })

    if (verification.status === 'completed') {
      publishAgenticStage(input, 'completed', verification.message, iteration)
      break
    }

    if (!shouldContinueAfterVerification(verification)) {
      publishAgenticStage(input, verification.status, verification.message, iteration)
      break
    }

    if (iteration === maxIterations) {
      verification = {
        status: 'failed',
        message: `Agent Kernel 已达到最大迭代次数，仍未满足完成条件：${verification.message}`,
      }
      publishAgenticStage(input, 'failed', verification.message, iteration)
      break
    }

    publishAgenticStage(input, verification.status, verification.message, iteration)
  }

  return {
    intent,
    skill,
    observations,
    verification,
  }
}
