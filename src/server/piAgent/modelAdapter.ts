/**
 * 模型适配器：将现有 WorkflowAiModelProfile 转换为 Pi SDK 可用的 Model 对象
 */
import {
  AuthStorage,
  ModelRegistry,
} from '@earendil-works/pi-coding-agent'
import type { WorkflowAiModelProfile } from '../../ai/types.js'

/**
 * 根据 baseUrl 推断 Pi SDK 的 provider id 和对应的环境变量名
 */
function inferProviderFromBaseUrl(baseUrl: string): { providerId: string; envKey: string } {
  const url = baseUrl.toLowerCase()
  if (url.includes('deepseek')) return { providerId: 'deepseek', envKey: 'DEEPSEEK_API_KEY' }
  if (url.includes('anthropic')) return { providerId: 'anthropic', envKey: 'ANTHROPIC_API_KEY' }
  if (url.includes('openai.com')) return { providerId: 'openai', envKey: 'OPENAI_API_KEY' }
  if (url.includes('bigmodel.cn')) return { providerId: 'openai', envKey: 'OPENAI_API_KEY' }
  if (url.includes('openrouter')) return { providerId: 'openrouter', envKey: 'OPENROUTER_API_KEY' }
  if (url.includes('groq')) return { providerId: 'groq', envKey: 'GROQ_API_KEY' }
  if (url.includes('mistral')) return { providerId: 'mistral', envKey: 'MISTRAL_API_KEY' }
  // 默认当作 OpenAI compatible
  return { providerId: 'openai', envKey: 'OPENAI_API_KEY' }
}

/**
 * 构造一个兼容 Pi SDK 的 Model 对象
 *
 * 注意：Pi SDK 内部使用 model.provider 作为字符串 key 进行 Map 查找、
 * AuthStorage.getApiKey() 调用和错误消息字符串插值（"${model.provider}"），
 * 因此 provider 必须是纯字符串而非对象。
 */
export function buildModelFromProfile(profile: WorkflowAiModelProfile) {
  const { providerId } = inferProviderFromBaseUrl(profile.baseUrl)

  return {
    id: profile.model,
    name: profile.name || profile.model,
    api: 'openai-completions' as const,
    provider: providerId,
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
 * 创建 ModelRegistry，注入 API Key
 *
 * 将 apiKey 通过 AuthStorage.setRuntimeApiKey() 直接注册为运行时覆盖，
 * 这是 Pi SDK 官方支持的 API key 注入方式，优先级高于环境变量和 auth.json。
 */
export function createModelRegistryFromProfile(profile: WorkflowAiModelProfile) {
  const { providerId } = inferProviderFromBaseUrl(profile.baseUrl)

  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.inMemory(authStorage)

  // 将 API key 注册为运行时覆盖（Pi SDK 最高优先级来源）
  if (profile.apiKey) {
    authStorage.setRuntimeApiKey(providerId, profile.apiKey)
  }

  return { authStorage, modelRegistry }
}
