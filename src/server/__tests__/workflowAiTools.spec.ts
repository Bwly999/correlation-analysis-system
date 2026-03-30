import { describe, expect, it } from 'vitest'
import { inspectUpstreamSchemaTool } from '../workflowAi/tools/inspectUpstreamSchema.js'
import { mutateDraftTool } from '../workflowAi/tools/mutateDraft.js'
import { finalizePlanTool } from '../workflowAi/tools/finalizePlan.js'
import { createTableResult } from '../../nodes/result.js'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'

describe('workflowAi tools', () => {
  it('inspects schema from workflow snapshot cached outputs without relying on front-end summaries', async () => {
    const request: WorkflowAiPlanRequest = {
      mode: 'edit',
      prompt: '继续完善分析流程',
      profile: {
        id: 'custom',
        name: '测试模型',
        baseUrl: 'http://example.com',
        model: 'test',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
      workflowSnapshot: {
        name: '测试工作流',
        nodes: [
          {
            id: 'node_import_1',
            label: '手动输入数据',
            type: 'manual-json-import',
            category: 'trigger',
            position: { x: 0, y: 0 },
            config: {
              jsonData: '[{"feature":1,"target":2}]',
            },
            output: createTableResult([
              { feature: 1, target: 2 },
              { feature: 2, target: 3 },
            ]),
          },
        ],
        edges: [],
      },
      nodeCatalog: [],
    }

    const result = await inspectUpstreamSchemaTool(request, {
      targetNodeRefs: ['node_import_1'],
    })

    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0]).toMatchObject({
      nodeId: 'node_import_1',
      resultKind: 'table',
      numericColumns: ['feature', 'target'],
      candidateTargetColumns: ['target'],
    })
  })

  it('inspects schema from a draft branch via server-side ephemeral execution', async () => {
    const request: WorkflowAiPlanRequest = {
      mode: 'edit',
      prompt: '继续完善分析流程',
      profile: {
        id: 'custom',
        name: '测试模型',
        baseUrl: 'http://example.com',
        model: 'test',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
      workflowSnapshot: {
        name: '测试工作流',
        nodes: [
          {
            id: 'node_import_1',
            label: '手动输入数据',
            type: 'manual-json-import',
            category: 'trigger',
            position: { x: 0, y: 0 },
            config: {
              jsonData: '[{"feature":1,"target":2,"group":"A"},{"feature":2,"target":3,"group":"B"}]',
            },
          },
        ],
        edges: [],
      },
      nodeCatalog: [],
    }

    const result = await inspectUpstreamSchemaTool(request, {
      draft: {
        summary: '草稿字段选择',
        assumptions: [],
        warnings: [],
        questions: [],
        nodes: [
          {
            ref: 'node_import_1',
            source: 'existing',
            nodeType: 'manual-json-import',
            label: '手动输入数据',
            config: {
              jsonData: '[{"feature":1,"target":2,"group":"A"},{"feature":2,"target":3,"group":"B"}]',
            },
            status: 'clean',
          },
          {
            ref: 'draft:node_select_1',
            source: 'draft',
            nodeType: 'field-selection',
            label: '字段选择',
            config: {
              mode: 'include',
              fields: ['feature', 'target'],
            },
            status: 'added',
          },
        ],
        edges: [
          {
            ref: 'draft:edge_1',
            sourceRef: 'node_import_1',
            targetRef: 'draft:node_select_1',
            status: 'added',
          },
        ],
      },
      targetNodeRefs: ['draft:node_select_1'],
    })

    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0]).toMatchObject({
      nodeId: 'draft:node_select_1',
      numericColumns: ['feature', 'target'],
      sourceKind: 'draft-ephemeral-run',
    })
  })

  it('mutates an existing draft graph with granular draft operations and finalizes it back to a plan', () => {
    const mutated = mutateDraftTool(
      {
        summary: '初始草稿',
        assumptions: [],
        warnings: [],
        questions: [],
        nodes: [],
        edges: [],
      },
      [
        {
          type: 'createNode',
          ref: 'draft:node_import_1',
          nodeType: 'manual-json-import',
          label: '手动输入数据',
          config: {
            jsonData: '[{"feature":1,"target":2}]',
          },
        },
        {
          type: 'createNode',
          ref: 'draft:node_pearson_1',
          nodeType: 'pearson',
          label: 'Pearson 相关系数',
          config: {
            xFields: ['feature'],
            yFields: ['target'],
          },
        },
        {
          type: 'connectNodes',
          ref: 'draft:edge_1',
          sourceRef: 'draft:node_import_1',
          targetRef: 'draft:node_pearson_1',
        },
        {
          type: 'setSummary',
          summary: '已生成最小相关性分析草稿',
        },
      ] as any,
    )

    expect(mutated.ok).toBe(true)
    expect(mutated.data?.nodes).toHaveLength(2)
    expect(mutated.data?.edges).toHaveLength(1)
    expect(mutated.data?.summary).toBe('已生成最小相关性分析草稿')

    const finalized = finalizePlanTool(mutated.data!)
    expect(finalized.ok).toBe(true)
    expect(finalized.data?.summary).toBe('已生成最小相关性分析草稿')
    expect(finalized.data?.operations).toEqual([
      expect.objectContaining({
        type: 'createNode',
        nodeType: 'manual-json-import',
      }),
      expect.objectContaining({
        type: 'createNode',
        nodeType: 'pearson',
      }),
      expect.objectContaining({
        type: 'connectNodes',
      }),
    ])
  })
})
