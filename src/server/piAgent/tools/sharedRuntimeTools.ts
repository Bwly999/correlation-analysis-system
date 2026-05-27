import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { WorkflowAiNodeCatalogItem, WorkflowAiPlanRequest } from '../../../ai/types.js'
import { getPiWorkflowToolSpecsByTarget } from '../../../shared/piWorkflowTools.js'
import {
  buildServerWorkflowAiNodeCatalog,
  getServerNodeCatalogItem,
} from '../nodeCatalog.js'
import { sanitizePiAgentDataSources } from '../safePayload.js'

const stringEnum = <T extends readonly string[]>(
  values: T,
  options?: Record<string, unknown>,
) =>
  Type.Unsafe<T[number]>({
    type: 'string',
    enum: [...values],
    ...options,
  } as any)

const paginate = <T>(items: T[], input: { limit?: number; offset?: number } = {}) => {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 20), 1), 100)
  const offset = Math.max(Math.floor(input.offset ?? 0), 0)
  const pageItems = items.slice(offset, offset + limit)
  const nextOffset = offset + pageItems.length
  return {
    total: items.length,
    count: pageItems.length,
    offset,
    limit,
    hasMore: nextOffset < items.length,
    nextOffset: nextOffset < items.length ? nextOffset : null,
    items: pageItems,
  }
}

const toCompactNodeCatalogItem = (item: WorkflowAiNodeCatalogItem) => ({
  name: item.name,
  displayName: item.displayName,
  category: item.category,
  description: item.description,
  inputMode: item.inputMode,
  minInputs: item.minInputs,
  maxInputs: item.maxInputs,
  allowedNextCategories: item.allowedNextCategories,
  matchedUseCases: extractMatchedUseCases(item),
  recommendedFollowUp: `如果这个节点和当前问题相关，下一步用 workflow_get_node 查看 ${item.name} 的配置字段和运行要求。`,
})

const buildCompactNodeCatalog = () =>
  buildServerWorkflowAiNodeCatalog().map(toCompactNodeCatalogItem)

const buildResult = (structuredContent: Record<string, unknown>, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  details: structuredContent,
  ...(isError ? { isError: true } : {}),
})

const extractMatchedUseCases = (item: WorkflowAiNodeCatalogItem) => {
  const assistantHints = item.assistantHints as { useCases?: string[]; keywords?: string[] } | null | undefined
  return [...(assistantHints?.useCases ?? []), ...(assistantHints?.keywords ?? [])].slice(0, 4)
}

const buildNodeRecommendedNextStep = (item: WorkflowAiNodeCatalogItem) => {
  const requiredInputs = item.properties
    .filter((property) => property.required)
    .map((property) => property.displayName || property.name)
  const requiredText = requiredInputs.length > 0 ? `重点确认 ${requiredInputs.join('、')}。` : '重点确认可选配置和输入约束。'
  return `如果用户还没有得到最终答案，继续围绕 ${item.displayName} 的配置与适用场景补充说明；${requiredText}`
}

const buildNodeQuestionExamples = (item: WorkflowAiNodeCatalogItem) => {
  const useCases = extractMatchedUseCases(item)
  if (useCases.length > 0) {
    return useCases.map((useCase) => `${item.displayName} 是否适合${useCase}？`)
  }

  return [
    `${item.displayName} 需要配置哪些关键字段？`,
    `${item.displayName} 适合放在当前分析链路的哪个位置？`,
  ]
}

const enrichNodeInfoResult = (result: Record<string, unknown>) => {
  const item = result.item as WorkflowAiNodeCatalogItem | undefined
  if (!item || !Array.isArray(item.properties)) {
    return result
  }

  const keyProperties = item.properties
    .filter((property) => property.required || Boolean(property.description))
    .slice(0, 5)
    .map((property) => ({
      name: property.name,
      displayName: property.displayName,
      required: property.required,
      type: property.type,
      description: property.description,
    }))
  const requiredInputs = item.properties
    .filter((property) => property.required)
    .map((property) => property.name)

  return {
    ...result,
    keyProperties,
    requiredInputs,
    recommendedNextStep: buildNodeRecommendedNextStep(item),
    exampleQuestionsThisNodeCanAnswer: buildNodeQuestionExamples(item),
  }
}

export interface CreateSharedRuntimeToolsOptions {
  request: WorkflowAiPlanRequest
}

export function createSharedRuntimeTools(options: CreateSharedRuntimeToolsOptions) {
  const { request } = options
  const specs = getPiWorkflowToolSpecsByTarget('server_runtime')
  const safeDataSources = sanitizePiAgentDataSources(request.dataSources)

  return specs.map((spec) => {
    switch (spec.name) {
      case 'workflow_get_session_context':
        return defineTool({
          name: spec.name,
          label: '读取分析上下文',
          description: spec.description,
          promptSnippet: '读取当前工作流、数据源摘要和用户需求上下文',
          promptGuidelines: [
            '开始规划前先读取 workflow_get_session_context，确认当前画布、数据源摘要和用户目标。',
            '数据源信息已包含在 session context 中，不要再寻找独立的数据源列表工具。',
          ],
          parameters: Type.Object({}),
          async execute() {
            return buildResult({
              mode: request.mode,
              prompt: request.prompt,
              workflowSnapshotSummary: request.workflowSnapshot ?? null,
              contextHints: request.contextHints ?? null,
              dataSources: safeDataSources,
            })
          },
        })
      case 'workflow_get_node_catalog':
        return defineTool({
          name: spec.name,
          label: '读取节点目录',
          description: spec.description,
          promptSnippet: '读取可用节点目录的简单介绍',
          promptGuidelines: [
            '需要选择节点类型时先读取 workflow_get_node_catalog，目录只包含节点简单介绍。',
            '需要配置字段、帮助文档或运行时要求时，再调用 workflow_get_node 读取单个节点详情。',
            '节点目录较长时使用 limit/offset 分页，避免一次读取过多上下文。',
            '目录只用于选型；读完目录后要继续 workflow_get_node 或继续回答用户问题，不要结束本轮。',
          ],
          parameters: Type.Object({
            limit: Type.Optional(Type.Number({ description: '单页返回数量，默认 20，最大 100' })),
            offset: Type.Optional(Type.Number({ description: '从第几条开始返回，默认 0' })),
          }),
          async execute(_callId, params) {
            return buildResult(paginate(buildCompactNodeCatalog(), params))
          },
        })
      case 'workflow_get_node':
        return defineTool({
          name: spec.name,
          label: '读取节点信息',
          description: spec.description,
          promptSnippet: '读取单个节点详情、文档、属性或运行时要求',
          promptGuidelines: [
            '确定节点类型后，用 workflow_get_node 查看配置字段和运行时要求。',
            '需要查属性时使用 mode=search_properties 并提供 propertyQuery。',
            '如果用户提到了多个节点、要比较差异或要求给实例，需要连续读取所有相关节点后再统一回答。',
            '不能在读完第一个节点后结束；若用户问题还没回答完，继续补充下一步读取或直接给结论。',
          ],
          parameters: Type.Object({
            nodeType: Type.String({ description: '节点类型名称' }),
            mode: Type.Optional(stringEnum(['info', 'docs', 'search_properties', 'runtime_requirements'] as const, {
              description: '读取模式',
            })),
            propertyQuery: Type.Optional(Type.String({ description: '属性搜索关键词' })),
            config: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: '当前节点配置' })),
          }),
          async execute(_callId, params) {
            const item = getServerNodeCatalogItem(params.nodeType)
            const mode = params.mode ?? 'info'

            if (!item) {
              return buildResult({
                found: false,
                message: `未找到节点定义: ${params.nodeType}`,
              }, true)
            }

            if (mode === 'docs') {
              return buildResult({
                found: true,
                item,
                docs: [
                  `# ${item.displayName}`,
                  '',
                  item.description,
                  '',
                  ...item.properties.map((property) =>
                    `- ${property.displayName}（${property.name}）: ${property.description ?? '无说明'}`),
                ].join('\n'),
              })
            }

            if (mode === 'search_properties') {
              const query = typeof params.propertyQuery === 'string' ? params.propertyQuery.trim().toLowerCase() : ''
              const properties = item.properties.filter((property) =>
                `${property.name} ${property.displayName} ${property.description ?? ''}`.toLowerCase().includes(query))
              return buildResult({
                found: true,
                item,
                properties,
              })
            }

            if (mode === 'runtime_requirements') {
              const config = params.config ?? {}
              const runtimeRequirements = item.properties.map((property) => ({
                name: property.name,
                displayName: property.displayName,
                required: property.required ?? false,
                isRuntimeInput: property.isRuntimeInput ?? false,
                visible: !property.visibleWhen || property.visibleWhen(config),
                dependsOn: property.dependsOn ?? [],
                type: property.type,
                description: property.description ?? '',
              }))
              return buildResult({
                found: true,
                item,
                runtimeRequirements,
              })
            }

            const result = {
              found: true,
              item,
            }
            const structuredResult = (!params.mode || params.mode === 'info')
              ? enrichNodeInfoResult(result)
              : result
            return buildResult(structuredResult)
          },
        })
      default:
        return null
    }
  }).filter((tool): tool is NonNullable<typeof tool> => tool !== null)
}
