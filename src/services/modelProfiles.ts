import type { WorkflowAiModelProfile, WorkflowAiModelTestResult } from '@/ai/types'
import { httpClient } from '@/services/httpClient'

const readJsonOrThrow = <T>(response: { status: number; data: unknown }, fallbackMessage: string): T => {
  const payload = response.data
  if (response.status < 200 || response.status >= 300) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : fallbackMessage
    throw new Error(message)
  }
  return payload as T
}

export const fetchSystemModelProfiles = async (): Promise<WorkflowAiModelProfile[]> => {
  const response = await httpClient.request({
    url: '/pi-agent/model-profiles',
    method: 'GET',
  })
  const payload = readJsonOrThrow<{ profiles?: WorkflowAiModelProfile[] }>(response, '加载系统模型配置失败')
  return payload.profiles ?? []
}

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  const response = await httpClient.request({
    url: '/pi-agent/model-profiles/test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { profile },
  })

  return readJsonOrThrow<WorkflowAiModelTestResult>(response, '模型配置测试失败')
}
