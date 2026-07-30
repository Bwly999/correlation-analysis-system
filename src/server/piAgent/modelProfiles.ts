import type { WorkflowAiModelProfile, WorkflowAiThinkingLevel } from '../../ai/types.js'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
const DEFAULT_MODEL = 'glm-4.7'

const DEFAULT_CONTEXT_WINDOW = 128000
const DEFAULT_MAX_TOKENS = 15000
const DEFAULT_THINKING_LEVEL: WorkflowAiThinkingLevel = 'high'

/**
 * 将字符串中的 ${VAR} 占位符替换为对应 process.env.VAR 的值。
 * 用于 NOTEBOOK_MODEL_PROFILES JSON 中复用已存在的独立 env 变量（如 ${DEEPSEEK_API_KEY}）。
 */
const interpolateEnvVars = (value: string): string =>
  value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name) => process.env[name]?.trim() ?? '')

interface RawProfileEntry {
  id?: unknown
  name?: unknown
  baseUrl?: unknown
  model?: unknown
  apiKey?: unknown
  contextWindow?: unknown
  maxTokens?: unknown
  thinkingLevel?: unknown
  isDefault?: unknown
  enabled?: unknown
  maxConcurrency?: unknown
  responseTimeoutMs?: unknown
  priority?: unknown
}

const coerceProfileEntry = (entry: RawProfileEntry, index: number): WorkflowAiModelProfile | null => {
  const baseUrl = typeof entry.baseUrl === 'string' ? entry.baseUrl.trim() : ''
  const model = typeof entry.model === 'string' ? entry.model.trim() : ''
  if (!baseUrl || !model) return null

  const rawApiKey = typeof entry.apiKey === 'string' ? entry.apiKey.trim() : ''
  const apiKey = rawApiKey ? interpolateEnvVars(rawApiKey) : undefined
  const contextWindow = typeof entry.contextWindow === 'number' ? entry.contextWindow : undefined
  const maxTokens = typeof entry.maxTokens === 'number' ? entry.maxTokens : undefined
  const thinkingLevelRaw = typeof entry.thinkingLevel === 'string' ? entry.thinkingLevel : undefined
  const thinkingLevel: WorkflowAiThinkingLevel | undefined =
    thinkingLevelRaw === 'low' || thinkingLevelRaw === 'medium' || thinkingLevelRaw === 'high' || thinkingLevelRaw === 'off'
      ? thinkingLevelRaw
      : undefined
  const maxConcurrency = typeof entry.maxConcurrency === 'number' ? entry.maxConcurrency : undefined
  const responseTimeoutMs = typeof entry.responseTimeoutMs === 'number' ? entry.responseTimeoutMs : undefined
  const priority = typeof entry.priority === 'number' ? entry.priority : undefined

  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `system-env-${index}`,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : model,
    baseUrl,
    model,
    apiKey,
    enabled: entry.enabled !== false,
    isDefault: entry.isDefault === true,
    source: 'system',
    capabilities: { create: true, edit: true },
    contextWindow,
    maxTokens,
    thinkingLevel,
    maxConcurrency,
    responseTimeoutMs,
    priority,
  }
}

const buildFallbackProfile = (): WorkflowAiModelProfile => {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[PiAgent] OPENAI_API_KEY 环境变量未设置，系统默认模型配置将不可用')
  }

  return {
    id: 'system-default-zhipu-glm-4-7',
    name: '默认智谱 GLM-4.7',
    baseUrl: process.env.OPENAI_COMPAT_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.WORKFLOW_AI_DEFAULT_MODEL?.trim() || DEFAULT_MODEL,
    apiKey,
    enabled: true,
    isDefault: true,
    source: 'system',
    capabilities: { create: true, edit: true },
  }
}

/**
 * 读取系统模型配置列表。
 *
 * 优先解析 NOTEBOOK_MODEL_PROFILES 环境变量（JSON 数组），支持配置多个模型，
 * apiKey 字段可用 ${VAR} 占位符引用独立 env 变量。
 *
 * 兜底：env 未配置或解析失败时，回退到原有单 profile 逻辑（读 OPENAI_API_KEY 等），
 * 保证现有部署升级后开箱不坏。
 */
export const getSystemModelProfiles = (): WorkflowAiModelProfile[] => {
  const raw = process.env.NOTEBOOK_MODEL_PROFILES?.trim()
  if (!raw) {
    return [buildFallbackProfile()]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn('[PiAgent] NOTEBOOK_MODEL_PROFILES 解析失败，回退到默认模型配置', error)
    return [buildFallbackProfile()]
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.warn('[PiAgent] NOTEBOOK_MODEL_PROFILES 非数组或为空，回退到默认模型配置')
    return [buildFallbackProfile()]
  }

  const profiles = parsed
    .map((entry, index) => coerceProfileEntry(entry as RawProfileEntry, index))
    .filter((profile): profile is WorkflowAiModelProfile => profile !== null)

  if (profiles.length === 0) {
    console.warn('[PiAgent] NOTEBOOK_MODEL_PROFILES 未包含有效模型配置，回退到默认模型配置')
    return [buildFallbackProfile()]
  }

  // 若没有显式标记 isDefault，则第一个作为默认
  if (!profiles.some((p) => p.isDefault)) {
    profiles[0]!.isDefault = true
  }

  return profiles
}

/**
 * 返回脱敏后的 profile（apiKey 抹除），供前端展示可选模型列表用。
 */
export const toPublicModelProfile = (profile: WorkflowAiModelProfile): WorkflowAiModelProfile => ({
  id: profile.id,
  name: profile.name,
  baseUrl: profile.baseUrl,
  model: profile.model,
  enabled: Boolean(profile.enabled && profile.apiKey),
  isDefault: Boolean(profile.isDefault),
  source: profile.source,
  capabilities: profile.capabilities ?? { create: true, edit: true },
  contextWindow: profile.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
  maxTokens: profile.maxTokens ?? DEFAULT_MAX_TOKENS,
  thinkingLevel: profile.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
  maxConcurrency: profile.maxConcurrency,
  responseTimeoutMs: profile.responseTimeoutMs,
  priority: profile.priority,
})

/**
 * 解析前端传入的 profile 引用：system 类型的从 env 配置中按 id 还原完整信息，
 * custom 类型原样返回。
 */
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
