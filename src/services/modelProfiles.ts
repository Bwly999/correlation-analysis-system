import type { WorkflowAiModelProfile, WorkflowAiModelTestResult } from '@/ai/types'
import { fetchWithWorkflowContext } from '@/services/workflowRequestContext'

const readJsonOrThrow = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : fallbackMessage
    throw new Error(message)
  }
  return payload as T
}

export const fetchSystemModelProfiles = async (): Promise<WorkflowAiModelProfile[]> => {
  const response = await fetchWithWorkflowContext('/api/workflow-ai/model-profiles')
  const payload = await readJsonOrThrow<{ profiles?: WorkflowAiModelProfile[] }>(response, '加载系统模型配置失败')
  return payload.profiles ?? []
}

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  const response = await fetchWithWorkflowContext('/api/workflow-ai/model-profiles/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile }),
  })

  return await readJsonOrThrow<WorkflowAiModelTestResult>(response, '模型配置测试失败')
}
