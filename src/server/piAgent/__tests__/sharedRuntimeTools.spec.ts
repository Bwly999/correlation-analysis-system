import { describe, expect, it } from 'vitest'
import { createSharedRuntimeTools } from '../tools/sharedRuntimeTools.js'

describe('sharedRuntimeTools', () => {
  it('returns workflow snapshot as summary semantics in session context tool', async () => {
    const tools = createSharedRuntimeTools({
      request: {
        mode: 'edit',
        prompt: '分析当前工作流',
        profile: {
          id: 'profile_1',
          name: '测试模型',
          baseUrl: 'http://example.com',
          model: 'glm-4.7',
          enabled: true,
          source: 'custom',
        },
        workflowSnapshot: {
          name: '当前工作流',
          nodes: [
            {
              id: 'node_1',
              data: {
                label: '导入数据',
              },
            },
          ],
          edges: [],
        },
        contextHints: {
          schemaSummaries: [
            {
              nodeId: 'node_1',
              nodeLabel: '导入数据',
              resultKind: 'table',
              numericColumns: ['sales'],
              candidateTargetColumns: ['sales'],
              candidateFeatureColumns: ['price'],
              blockedReasons: [],
            },
          ],
        },
        dataSources: [],
        nodeCatalog: [],
      },
      runtime: {
        searchNodes: () => ({ items: [] }),
        getNode: () => ({}),
        getNodeOptions: async () => ({}),
        profileDataSource: () => ({}),
        recommendMethods: () => ({}),
        createWorkflow: async () => ({}),
        getWorkflow: async () => ({}),
        updatePartialWorkflow: async () => ({}),
        updateFullWorkflow: async () => ({}),
        validateWorkflow: async () => ({}),
        executions: async () => ({}),
        listWorkflowVersions: async () => ({}),
        getWorkflowVersion: async () => ({}),
        rollbackWorkflowVersion: async () => ({}),
      } as any,
      userId: 'user_1',
    })

    const tool = tools.find((item) => item.name === 'workflow_get_session_context')
    if (!tool) throw new Error('缺少 workflow_get_session_context 工具')

    const result = await tool.execute('call_1', {}, undefined as never, undefined as never, undefined as never)
    const firstContent = result.content[0]
    const text = firstContent && 'text' in firstContent ? firstContent.text : '{}'
    const payload = JSON.parse(text) as Record<string, unknown>

    const workflowSnapshotSummary = payload.workflowSnapshotSummary as Record<string, any>

    expect(workflowSnapshotSummary).toEqual({
      name: '当前工作流',
      nodes: [
        {
          id: 'node_1',
          data: {
            label: '导入数据',
          },
        },
      ],
      edges: [],
    })
    expect(payload.workflowSnapshot).toBeUndefined()
  })
})
