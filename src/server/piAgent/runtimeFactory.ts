import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import type { WorkflowAiModelProfile, WorkflowAiModelTestResult, WorkflowAiPlanRequest } from '../../ai/types.js'

const DEFAULT_TEST_PROMPT = '请只回复 ok'

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
    contextWindow: 128000,
    maxTokens: 8192,
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
