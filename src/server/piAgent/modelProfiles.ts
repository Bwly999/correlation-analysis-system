import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'
import type { WorkflowAiModelProfile, WorkflowAiModelTestResult } from '../../ai/types.js'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
const DEFAULT_MODEL = 'glm-4.7'

export const getSystemModelProfiles = (): WorkflowAiModelProfile[] => {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[PiAgent] OPENAI_API_KEY 环境变量未设置，系统默认模型配置将不可用')
  }

  return [
    {
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: process.env.OPENAI_COMPAT_BASE_URL?.trim() || DEFAULT_BASE_URL,
      model: process.env.WORKFLOW_AI_DEFAULT_MODEL?.trim() || DEFAULT_MODEL,
      apiKey,
      enabled: true,
      isDefault: true,
      source: 'system',
      capabilities: { create: true, edit: true },
    },
  ]
}

export const toPublicModelProfile = (profile: WorkflowAiModelProfile): WorkflowAiModelProfile => ({
  id: profile.id,
  name: profile.name,
  baseUrl: profile.baseUrl,
  model: profile.model,
  enabled: Boolean(profile.enabled && profile.apiKey),
  isDefault: Boolean(profile.isDefault),
  source: profile.source,
  capabilities: profile.capabilities ?? { create: true, edit: true },
})

export const resolveModelProfile = (profile: WorkflowAiModelProfile): WorkflowAiModelProfile => {
  if (profile.source !== 'system') {
    return profile
  }

  const systemProfile = getSystemModelProfiles().find((item) => item.id === profile.id)
  if (!systemProfile) {
    throw new Error('未找到系统模型配置')
  }

  return {
    ...systemProfile,
    model: profile.model || systemProfile.model,
    baseUrl: profile.baseUrl || systemProfile.baseUrl,
    enabled: profile.enabled,
  }
}

export const createProvider = (profile: WorkflowAiModelProfile) =>
  createOpenAICompatible({
    name: 'pi-agent',
    baseURL: profile.baseUrl,
    apiKey: profile.apiKey,
  })

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  const resolvedProfile = resolveModelProfile(profile)

  if (!resolvedProfile.baseUrl || !resolvedProfile.apiKey || !resolvedProfile.model) {
    throw new Error('模型配置不完整，无法测试连通性')
  }

  const provider = createProvider(resolvedProfile)
  const startedAt = Date.now()
  await generateText({
    model: provider.chatModel(resolvedProfile.model),
    prompt: '请只回复 ok',
    temperature: 0,
    maxOutputTokens: 8,
  })

  return {
    success: true,
    message: '模型配置可用',
    latencyMs: Date.now() - startedAt,
  }
}
