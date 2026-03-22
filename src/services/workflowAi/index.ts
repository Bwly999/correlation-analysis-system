import { buildWorkflowAiNodeCatalog } from '@/ai/catalog'
import type { WorkflowAiModelProfile, WorkflowAiModelTestResult, WorkflowAiPlan, WorkflowAiPlanRequest } from '@/ai/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const readErrorMessage = async (response: Response, fallbackMessage: string) => {
  try {
    const data = (await response.json()) as { message?: string }
    return data.message || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

export const requestWorkflowAiPlan = async (request: WorkflowAiPlanRequest) => {
  if (!request.profile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  const response = await fetch(`${API_BASE_URL}/workflow-ai/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '生成 AI 计划失败'))
  }

  return (await response.json()) as WorkflowAiPlan
}

export const fetchSystemModelProfiles = async (): Promise<WorkflowAiModelProfile[]> => {
  const response = await fetch(`${API_BASE_URL}/workflow-ai/model-profiles`)
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '加载系统模型配置失败'))
  }
  const data = (await response.json()) as { profiles?: WorkflowAiModelProfile[] }
  return data.profiles ?? []
}

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  const response = await fetch(`${API_BASE_URL}/workflow-ai/model-profiles/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile }),
  })

  const data = (await response.json()) as WorkflowAiModelTestResult & { message?: string }
  if (!response.ok) {
    throw new Error(data.message || '模型配置测试失败')
  }

  return data
}
