/**
 * 模型适配器：将现有 WorkflowAiModelProfile 转换为 Pi SDK 可用的 Model 对象
 */
import {
  AuthStorage,
  ModelRegistry,
} from '@earendil-works/pi-coding-agent'
import type { WorkflowAiModelProfile } from '../../ai/types.js'

/**
 * 构造一个兼容 Pi SDK 的 Model 对象
 * Pi SDK 的 Model 接口支持 baseUrl + openai-completions API
 */
export function buildModelFromProfile(profile: WorkflowAiModelProfile) {
  return {
    id: profile.model,
    name: profile.name || profile.model,
    api: 'openai-completions' as const,
    provider: { id: `custom_${profile.id}`, name: profile.name },
    baseUrl: profile.baseUrl,
    reasoning: false,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    headers: profile.apiKey
      ? { Authorization: `Bearer ${profile.apiKey}` }
      : undefined,
  }
}

/**
 * 创建 ModelRegistry（内存模式）
 * 通过环境变量注入 API Key（Pi SDK 的 AuthStorage.create() 从环境变量读取）
 */
export function createModelRegistryFromProfile(profile: WorkflowAiModelProfile) {
  // Pi SDK 的 AuthStorage 从环境变量读取 API Key
  // 临时设置环境变量让 SDK 能找到 key
  if (profile.apiKey) {
    process.env.OPENAI_API_KEY = profile.apiKey
  }
  if (profile.baseUrl) {
    process.env.OPENAI_BASE_URL = profile.baseUrl
  }

  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.inMemory(authStorage)
  return { authStorage, modelRegistry }
}
