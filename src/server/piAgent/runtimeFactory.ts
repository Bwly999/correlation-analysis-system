import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import type { WorkflowAiModelProfile, WorkflowAiModelTestResult, WorkflowAiPlanRequest, WorkflowAiThinkingLevel } from '../../ai/types.js'

const DEFAULT_TEST_PROMPT = '请只回复 ok'

/** 默认模型参数：contextWindow 128k / maxTokens 15000（notebook 场景约定） */
const DEFAULT_CONTEXT_WINDOW = 128000
const DEFAULT_MAX_TOKENS = 15000

function inferProviderFromBaseUrl(baseUrl: string): string {
  const url = baseUrl.toLowerCase()
  if (url.includes('deepseek')) return 'deepseek'
  if (url.includes('anthropic')) return 'anthropic'
  if (url.includes('openai.com')) return 'openai'
  if (url.includes('bigmodel.cn')) return 'openai'
  if (url.includes('openrouter')) return 'openrouter'
  if (url.includes('groq')) return 'groq'
  if (url.includes('mistral')) return 'mistral'
  return 'openai'
}

export function buildModelFromProfile(profile: WorkflowAiModelProfile) {
  const providerId = inferProviderFromBaseUrl(profile.baseUrl)

  return {
    id: profile.model,
    name: profile.name || profile.model,
    api: 'openai-completions' as const,
    provider: providerId,
    baseUrl: profile.baseUrl,
    reasoning: false,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: profile.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: profile.maxTokens ?? DEFAULT_MAX_TOKENS,
    headers: profile.apiKey
      ? { Authorization: `Bearer ${profile.apiKey}` }
      : undefined,
  }
}

export function createModelRegistryFromProfile(profile: WorkflowAiModelProfile) {
  const providerId = inferProviderFromBaseUrl(profile.baseUrl)
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.inMemory(authStorage)

  if (profile.apiKey) {
    authStorage.setRuntimeApiKey(providerId, profile.apiKey)
  }

  return { authStorage, modelRegistry }
}

/**
 * 为多个 profile 构建共享的 authStorage + modelRegistry。
 *
 * 遍历所有 profile，把每个 profile 的 apiKey 按 provider 注册到同一个 authStorage，
 * 并为每个 profile 预建 Model 对象缓存到 Map。
 *
 * 用途：notebook agent 会话需要支持对话中热切换模型（session.setModel），
 * 而 setModel 要求目标模型的 apiKey 在会话创建时已注册到 authStorage。
 * 故创建会话时一次性预注册所有可用模型（后台 + 用户自定义）。
 *
 * @returns authStorage / modelRegistry（传给 createAgentSession）+
 *          models Map（profileId → Model，切换时查表用）+
 *          profiles Map（profileId → profile，读取参数用）
 */
export function createModelRegistryFromProfiles(profiles: WorkflowAiModelProfile[]) {
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.inMemory(authStorage)
  const models = new Map<string, ReturnType<typeof buildModelFromProfile>>()
  const profileMap = new Map<string, WorkflowAiModelProfile>()

  for (const profile of profiles) {
    if (!profile.apiKey) continue
    const providerId = inferProviderFromBaseUrl(profile.baseUrl)
    authStorage.setRuntimeApiKey(providerId, profile.apiKey)
    models.set(profile.id, buildModelFromProfile(profile))
    profileMap.set(profile.id, profile)
  }

  return { authStorage, modelRegistry, models, profileMap }
}

export function createPiAgentResourceLoader(systemPromptOverride: () => string) {
  return new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    systemPromptOverride,
  })
}

export async function testPiAgentRuntimeProfile(
  profile: WorkflowAiModelProfile,
  buildSystemPrompt: (request: WorkflowAiPlanRequest) => string,
): Promise<WorkflowAiModelTestResult> {
  if (!profile.baseUrl || !profile.apiKey || !profile.model) {
    throw new Error('模型配置不完整，无法测试连通性')
  }

  const startedAt = Date.now()
  const request: WorkflowAiPlanRequest = {
    mode: 'create',
    prompt: DEFAULT_TEST_PROMPT,
    profile,
    nodeCatalog: [],
    dataSources: [],
  }
  const resourceLoader = createPiAgentResourceLoader(() => buildSystemPrompt(request))
  await resourceLoader.reload()

  const { authStorage, modelRegistry } = createModelRegistryFromProfile(profile)
  const model = buildModelFromProfile(profile)
  const sessionManager = SessionManager.inMemory()

  const { session } = await createAgentSession({
    sessionManager,
    authStorage,
    modelRegistry,
    model: model as never,
    thinkingLevel: 'low',
    cwd: process.cwd(),
    customTools: [],
    resourceLoader,
    noTools: 'builtin',
  })

  try {
    await session.prompt(DEFAULT_TEST_PROMPT)
  } finally {
    session.dispose()
  }

  return {
    success: true,
    message: '模型配置可用',
    latencyMs: Date.now() - startedAt,
  }
}
