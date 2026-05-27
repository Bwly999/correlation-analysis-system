import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { getPiWorkflowToolSpecsByTarget } from '../../../shared/piWorkflowTools.js'
import type { FrontendBridge } from '../frontendBridge.js'

const stringEnum = <T extends readonly string[]>(
  values: T,
  options?: Record<string, unknown>,
) =>
  Type.Unsafe<T[number]>({
    type: 'string',
    enum: [...values],
    ...options,
  } as any)

export function createFrontendBridgeTools(bridge: FrontendBridge) {
  const specs = getPiWorkflowToolSpecsByTarget('frontend_bridge')

  return specs.map((spec) => {
    if (spec.name === 'workflow_get_node_catalog') {
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
        async execute(toolCallId, params, _signal, onUpdate) {
          onUpdate?.({
            content: [{ type: 'text', text: '正在等待前端读取节点目录...' }],
            details: { status: 'waiting_frontend_bridge' },
          })
          return bridge.request(toolCallId, spec.name, params as Record<string, unknown>)
        },
      })
    }

    if (spec.name === 'workflow_get_node') {
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
        async execute(toolCallId, params, _signal, onUpdate) {
          onUpdate?.({
            content: [{ type: 'text', text: '正在等待前端读取节点信息...' }],
            details: { status: 'waiting_frontend_bridge' },
          })
          return bridge.request(toolCallId, spec.name, params as Record<string, unknown>)
        },
      })
    }

    throw new Error(`未注册 frontend_bridge tool factory: ${spec.executorKey}`)
  })
}
