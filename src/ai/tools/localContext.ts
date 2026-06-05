import type { Edge } from '@vue-flow/core'
import { searchWorkflowRecipes } from '@/ai/recipes/search'
import { inspectAiSchemaSummary } from '@/ai/schemaInspector/inspector'
import type {
  WorkflowAiContextHints,
  WorkflowAiPlanMode,
  WorkflowAiToolTraceItem,
} from '@/ai/types'
import type { WorkflowNode } from '@/utils/storage'

interface BuildLocalWorkflowAiContextInput {
  mode: WorkflowAiPlanMode
  prompt: string
  workflowName: string
  nodes: WorkflowNode[]
  edges: Edge[]
  inspectNode?: (nodeId: string) => Promise<unknown>
  getNodeOutput?: (nodeId: string) => unknown
}

interface BuildLocalWorkflowAiContextResult {
  contextHints: WorkflowAiContextHints
  toolTrace: WorkflowAiToolTraceItem[]
}

export const buildLocalWorkflowAiContext = async ({
  mode,
  prompt,
  workflowName,
  nodes,
  edges,
  inspectNode,
  getNodeOutput,
}: BuildLocalWorkflowAiContextInput): Promise<BuildLocalWorkflowAiContextResult> => {
  const toolTrace: WorkflowAiToolTraceItem[] = []
  const resolveNodeOutput = (node: WorkflowNode) =>
    typeof getNodeOutput === 'function' ? getNodeOutput(node.id) : node.data.output

  toolTrace.push({
    toolName: 'get_workflow_context',
    summary:
      mode === 'edit'
        ? `已读取当前工作流「${workflowName}」，共 ${nodes.length} 个节点、${edges.length} 条连线`
        : `当前为创建模式，工作流名「${workflowName}」`,
    status: 'success',
  })

  const recipeMatches = searchWorkflowRecipes({ prompt, mode }).slice(0, 3)
  const recipes = recipeMatches.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    reason: recipe.reason,
    minimalPattern: recipe.minimalPattern,
  }))

  toolTrace.push({
    toolName: 'search_recipes',
    summary: recipes.length
      ? `已召回 ${recipes.length} 个候选模板，首选 ${recipes[0]?.name}`
      : '未召回到明确模板，保留自由规划',
    status: 'success',
  })

  const schemaSummaries = nodes
    .map((node) => ({
      node,
      output: resolveNodeOutput(node),
    }))
    .filter(({ output }) => output != null)
    .slice(0, 3)
    .map(({ node, output }) => {
      const summary = inspectAiSchemaSummary({
        source: {
          kind: 'canvas-cache',
          nodeRef: node.id,
        },
        value: output,
      })

      return {
        nodeId: node.id,
        nodeLabel: node.data.label,
        resultKind: summary.resultKind,
        rowCount: summary.rowCount,
        numericColumns: summary.summary.numericColumns,
        categoricalColumns: summary.summary.categoricalColumns,
        datetimeColumns: summary.summary.datetimeColumns,
        candidateTargetColumns: summary.summary.candidateTargetColumns,
        candidateFeatureColumns: summary.summary.candidateFeatureColumns,
        blockedReasons: summary.summary.blockedReasons,
      }
    })

  if (schemaSummaries.length > 0) {
    toolTrace.push({
      toolName: 'inspect_cached_schema',
      summary: `已读取 ${schemaSummaries.length} 个节点缓存摘要`,
      status: 'success',
    })
  }

  if (inspectNode && schemaSummaries.length < 3) {
    const candidateNodes = nodes
      .filter((node) => resolveNodeOutput(node) == null && node.data.category !== 'terminal')
      .slice(0, Math.max(0, 3 - schemaSummaries.length))

    const ephemeralSummaries: typeof schemaSummaries = []

    for (const node of candidateNodes) {
      try {
        const inspectionResult = await inspectNode(node.id)
        if (!inspectionResult) continue

        const summary = inspectAiSchemaSummary({
          source: {
            kind: 'canvas-ephemeral-run',
            nodeRef: node.id,
          },
          value: inspectionResult,
        })

        ephemeralSummaries.push({
          nodeId: node.id,
          nodeLabel: node.data.label,
          resultKind: summary.resultKind,
          rowCount: summary.rowCount,
          numericColumns: summary.summary.numericColumns,
          categoricalColumns: summary.summary.categoricalColumns,
          datetimeColumns: summary.summary.datetimeColumns,
          candidateTargetColumns: summary.summary.candidateTargetColumns,
          candidateFeatureColumns: summary.summary.candidateFeatureColumns,
          blockedReasons: summary.summary.blockedReasons,
        })
      } catch {
        continue
      }
    }

    if (ephemeralSummaries.length > 0) {
      schemaSummaries.push(...ephemeralSummaries)
      toolTrace.push({
        toolName: 'inspect_ephemeral_schema',
        summary: `已临时执行 ${ephemeralSummaries.length} 个节点并提取字段摘要`,
        status: 'success',
      })
    }
  }

  return {
    contextHints: {
      ...(recipes.length ? { recipes } : {}),
      ...(schemaSummaries.length ? { schemaSummaries } : {}),
    },
    toolTrace,
  }
}
