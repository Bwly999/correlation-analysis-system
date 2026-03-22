import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'
import type {
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiNodeCatalogItem,
  WorkflowAiPlan,
  WorkflowAiPlanMode,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-4.7'
const DEFAULT_API_KEY = ''

const stripCodeFence = (value: string) =>
  value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

const parsePlan = (rawText: string): WorkflowAiPlan => {
  const normalized = stripCodeFence(rawText)
  const parsed = JSON.parse(normalized) as Partial<WorkflowAiPlan>

  return {
    summary: parsed.summary ?? 'LLM 已生成工作流计划',
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    operations: Array.isArray(parsed.operations) ? parsed.operations : [],
  }
}

const buildSystemPrompt = (mode: WorkflowAiPlanMode, nodeCatalog: WorkflowAiNodeCatalogItem[]) => {
  const modeLabel = mode === 'create' ? '从零创建工作流' : '修改现有工作流'
  const catalog = JSON.stringify(nodeCatalog, null, 2)

  return [
    '你是多因子相关性分析系统的工作流编排助手。',
    `当前任务模式：${modeLabel}。`,
    '你只能使用系统提供的现有节点，不能发明新节点，也不能输出解释性散文。',
    '你必须输出一个 JSON 对象，字段为 summary、assumptions、warnings、questions、operations。',
    'operations 必须只使用以下类型：createNode、updateNodeConfig、renameNode、removeNode、connectNodes、disconnectEdge、moveNode。',
    '如果信息不足，可以在 questions 返回需要追问的简短中文问题，并让 operations 为空数组。',
    '如果用户要求修改现有工作流，优先最小改动，不要重建整个流程。',
    '节点 label、summary、warnings、questions 都必须使用中文。',
    '请严格遵守节点连接规则、单输入/多输入限制和属性名称。',
    '以下是系统可用节点目录 JSON：',
    catalog,
  ].join('\n')
}

const buildUserPrompt = (request: WorkflowAiPlanRequest) => {
  const snapshot = request.workflowSnapshot
    ? `\n当前工作流快照 JSON：\n${JSON.stringify(request.workflowSnapshot, null, 2)}`
    : '\n当前没有现有工作流快照，请从零创建。'

  return [
    `用户需求：${request.prompt}`,
    snapshot,
    '请只返回 JSON，不要返回 Markdown 代码块之外的解释。',
  ].join('\n')
}

const createProvider = (profile: WorkflowAiModelProfile) =>
  createOpenAICompatible({
    name: 'workflow-ai',
    baseURL: profile.baseUrl,
    apiKey: profile.apiKey,
    supportsStructuredOutputs: false,
  })

export const getSystemModelProfiles = (): WorkflowAiModelProfile[] => [
  {
    id: 'system-default-zhipu-glm-4-7',
    name: '默认智谱 GLM-4.7',
    baseUrl: process.env.OPENAI_COMPAT_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.WORKFLOW_AI_DEFAULT_MODEL?.trim() || DEFAULT_MODEL,
    apiKey: process.env.OPENAI_API_KEY?.trim() || DEFAULT_API_KEY,
    enabled: true,
    isDefault: true,
    source: 'system',
    capabilities: { create: true, edit: true },
  },
]

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

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  if (!profile.baseUrl || !profile.apiKey || !profile.model) {
    throw new Error('模型配置不完整，无法测试连通性')
  }

  const provider = createProvider(profile)
  const startedAt = Date.now()
  await generateText({
    model: provider.chatModel(profile.model),
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

export const generateWorkflowAiPlan = async (request: WorkflowAiPlanRequest): Promise<WorkflowAiPlan> => {
  if (!request.profile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  if (!request.profile.apiKey) {
    throw new Error('模型配置缺少 API Key')
  }

  const provider = createProvider(request.profile)
  const result = await generateText({
    model: provider.chatModel(request.profile.model),
    system: buildSystemPrompt(request.mode, request.nodeCatalog),
    prompt: buildUserPrompt(request),
    temperature: 0.2,
  })

  return parsePlan(result.text)
}


