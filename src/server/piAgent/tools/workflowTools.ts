/**
 * 工作流操作类工具（创建、修改、校验、测试）
 */
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { WorkflowAiPlan, WorkflowAiPlanRequest, WorkflowAiOperation } from '../../../ai/types.js'
import { validateWorkflowAiPlanAgainstContext } from '../../../ai/planValidation.js'
import {
  createDraftGraphFromPlan,
  createDraftGraphFromWorkflowSnapshot,
  applyDraftMutations,
  buildDraftMutationsFromPlan,
} from '../../../ai/draft/graph.js'
import { buildServerWorkflowAiNodeCatalog } from '../../workflowAi/nodeCatalog.js'

const result = (text: string, isError = false) => ({
  content: [{ type: 'text' as const, text }],
  details: {},
  ...(isError ? { isError: true } : {}),
})

const operationItemSchema = Type.Object({
  id: Type.String({ description: '操作唯一标识' }),
  type: Type.String({ description: '操作类型' }),
  nodeType: Type.Optional(Type.String()),
  nodeLabel: Type.Optional(Type.String()),
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  sourceRef: Type.Optional(Type.String()),
  targetRef: Type.Optional(Type.String()),
  nodeRef: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  position: Type.Optional(Type.Object({ x: Type.Number(), y: Type.Number() })),
})

export function createWorkflowTools(request: WorkflowAiPlanRequest) {
  const createWorkflow = defineTool({
    name: 'workflow_create_workflow',
    label: '创建工作流',
    description: `创建一个新的工作流。提供 operations 数组，每个 operation 描述一个操作（创建节点、连接节点等）。

操作类型：
- createNode: 创建节点，需要 nodeType、nodeLabel、config
- connectNodes: 连接两个节点，需要 sourceRef（源节点 operation id）和 targetRef（目标节点 operation id）
- updateNodeConfig: 更新节点配置

注意：sourceRef/targetRef 引用的是同一批 operations 中 createNode 操作的 id 字段。`,
    parameters: Type.Object({
      summary: Type.String({ description: '工作流摘要说明' }),
      operations: Type.Array(operationItemSchema, { description: '操作列表' }),
    }),
    async execute(_callId, params, _signal, _onUpdate, _ctx) {
      const plan: WorkflowAiPlan = {
        summary: params.summary,
        assumptions: [],
        warnings: [],
        operations: params.operations as unknown as WorkflowAiOperation[],
      }

      const catalog = buildServerWorkflowAiNodeCatalog()
      const validation = validateWorkflowAiPlanAgainstContext(plan, {
        nodeCatalog: catalog,
        skipRequiredConfig: true,
      })

      if (!validation.valid) {
        return result(
          JSON.stringify({ success: false, message: '工作流校验失败', issues: validation.issues }, null, 2),
          true,
        )
      }

      const draft = createDraftGraphFromPlan(plan)

      return result(
        JSON.stringify(
          {
            success: true,
            message: '工作流创建成功',
            plan,
            draft: {
              summary: draft.summary,
              nodeCount: draft.nodes.length,
              edgeCount: draft.edges.length,
              nodes: draft.nodes.map((n) => ({
                ref: n.ref,
                nodeType: n.nodeType,
                label: n.label,
                status: n.status,
              })),
            },
          },
          null,
          2,
        ),
      )
    },
  })

  const updatePartialWorkflow = defineTool({
    name: 'workflow_update_partial_workflow',
    label: '增量修改工作流',
    description:
      '对已有工作流进行增量修改。提供 operations 数组描述要执行的变更操作。',
    parameters: Type.Object({
      operations: Type.Array(operationItemSchema, { description: '增量操作列表' }),
    }),
    async execute(_callId, params, _signal, _onUpdate, _ctx) {
      try {
        const draft = createDraftGraphFromWorkflowSnapshot(request.workflowSnapshot)
        const plan: WorkflowAiPlan = {
          summary: '增量修改',
          assumptions: [],
          warnings: [],
          operations: params.operations as unknown as WorkflowAiOperation[],
        }
        const mutations = buildDraftMutationsFromPlan(plan)
        const updatedDraft = applyDraftMutations(draft, mutations)

        return result(
          JSON.stringify(
            {
              success: true,
              message: '工作流修改成功',
              draft: {
                summary: updatedDraft.summary,
                nodeCount: updatedDraft.nodes.length,
                edgeCount: updatedDraft.edges.length,
                warnings: updatedDraft.warnings,
              },
            },
            null,
            2,
          ),
        )
      } catch (err: any) {
        return result(`修改失败: ${err?.message || '未知错误'}`, true)
      }
    },
  })

  const validateWorkflow = defineTool({
    name: 'workflow_validate_workflow',
    label: '校验工作流结构',
    description: '校验工作流计划的结构合法性，检查节点类型、配置完整性、连接规则等。',
    parameters: Type.Object({
      summary: Type.String({ description: '工作流摘要' }),
      operations: Type.Array(operationItemSchema, { description: '操作列表' }),
    }),
    async execute(_callId, params, _signal, _onUpdate, _ctx) {
      const plan: WorkflowAiPlan = {
        summary: params.summary,
        assumptions: [],
        warnings: [],
        operations: params.operations as unknown as WorkflowAiOperation[],
      }

      const catalog = buildServerWorkflowAiNodeCatalog()
      const existingNodes = (request.workflowSnapshot?.nodes || []) as any[]
      const existingEdges = (request.workflowSnapshot?.edges || []) as any[]

      const validation = validateWorkflowAiPlanAgainstContext(plan, {
        nodeCatalog: catalog,
        existingNodes,
        existingEdges,
      })

      return result(
        JSON.stringify(
          { valid: validation.valid, issueCount: validation.issues.length, issues: validation.issues },
          null,
          2,
        ),
      )
    },
  })

  const testWorkflow = defineTool({
    name: 'workflow_test_workflow',
    label: '测试完整工作流',
    description:
      '测试执行工作流计划。会校验结构并构建 draft graph。第一版暂不执行实际计算。',
    parameters: Type.Object({
      summary: Type.String({ description: '工作流摘要' }),
      operations: Type.Array(operationItemSchema, { description: '操作列表' }),
    }),
    async execute(_callId, params, _signal, _onUpdate, _ctx) {
      const plan: WorkflowAiPlan = {
        summary: params.summary,
        assumptions: [],
        warnings: [],
        operations: params.operations as unknown as WorkflowAiOperation[],
      }

      const catalog = buildServerWorkflowAiNodeCatalog()
      const validation = validateWorkflowAiPlanAgainstContext(plan, {
        nodeCatalog: catalog,
        skipRequiredConfig: true,
      })

      if (!validation.valid) {
        return result(
          JSON.stringify(
            { success: false, message: '工作流校验未通过，无法执行测试', issues: validation.issues },
            null,
            2,
          ),
          true,
        )
      }

      const draft = createDraftGraphFromPlan(plan)

      return result(
        JSON.stringify(
          {
            success: true,
            message: '工作流结构校验通过（第一版暂不执行实际计算）',
            plan: { summary: plan.summary, operationCount: plan.operations.length },
            draft: { nodeCount: draft.nodes.length, edgeCount: draft.edges.length },
          },
          null,
          2,
        ),
      )
    },
  })

  return [createWorkflow, updatePartialWorkflow, validateWorkflow, testWorkflow]
}
