import { describe, expect, it } from 'vitest'
import { createSharedRuntimeTools } from '../tools/sharedRuntimeTools.js'

describe('sharedRuntimeTools', () => {
  const createRequest = () => ({
    mode: 'edit' as const,
    prompt: '分析当前工作流',
    profile: {
      id: 'profile_1',
      name: '测试模型',
      baseUrl: 'http://example.com',
      model: 'glm-4.7',
      enabled: true,
      source: 'custom' as const,
    },
    workflowSnapshot: {
      name: '当前工作流',
      nodes: [],
      edges: [],
    },
    contextHints: {
      schemaSummaries: [],
      },
      dataSources: [],
      nodeCatalog: [],
    })

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

  it('keeps only the minimal read-only server tools', async () => {
    const tools = createSharedRuntimeTools({
      request: createRequest(),
    })

    expect(tools.map((item) => item.name)).toEqual([
      'workflow_get_session_context',
      'workflow_get_node_catalog',
      'workflow_get_node',
    ])
    expect(tools.find((item) => item.name === 'workflow_workflow_versions')).toBeUndefined()
  })

  it('returns compact node catalog entries and leaves details to workflow_get_node', async () => {
    const tools = createSharedRuntimeTools({
      request: createRequest(),
    })

    const tool = tools.find((item) => item.name === 'workflow_get_node_catalog')
    if (!tool) throw new Error('缺少 workflow_get_node_catalog 工具')

    const result = await tool.execute(
      'call_catalog',
      { limit: 1 },
      undefined as never,
      undefined as never,
      undefined as never,
    )
    const payload = JSON.parse((result.content[0] as any).text) as {
      items: Array<Record<string, unknown>>
    }
    const firstItem = payload.items[0]

    expect(firstItem).toEqual(expect.objectContaining({
      name: expect.any(String),
      displayName: expect.any(String),
      category: expect.any(String),
      description: expect.any(String),
      inputMode: expect.any(String),
      minInputs: expect.any(Number),
    }))
    expect(firstItem).not.toHaveProperty('properties')
    expect(firstItem).not.toHaveProperty('help')
    expect(firstItem).not.toHaveProperty('assistantHints')
    expect(firstItem).toHaveProperty('matchedUseCases')
    expect(firstItem).toHaveProperty('recommendedFollowUp')
  })

  it('adds stronger continuation guidance to node catalog and node detail tools', () => {
    const tools = createSharedRuntimeTools({
      request: createRequest(),
    })

    const catalogTool = tools.find((item) => item.name === 'workflow_get_node_catalog')
    const nodeTool = tools.find((item) => item.name === 'workflow_get_node')
    if (!catalogTool || !nodeTool) throw new Error('缺少节点读取工具')

    expect(catalogTool.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('不要结束本轮'),
      ]),
    )
    expect(nodeTool.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('多个节点'),
        expect.stringContaining('统一回答'),
        expect.stringContaining('不能在读完第一个节点后结束'),
      ]),
    )
  })

  it('returns actionable next-step hints in workflow_get_node info mode', async () => {
    const tools = createSharedRuntimeTools({
      request: createRequest(),
    })

    const tool = tools.find((item) => item.name === 'workflow_get_node')
    if (!tool) throw new Error('缺少 workflow_get_node 工具')

    const result = await tool.execute(
      'call_node',
      { nodeType: 'manual-json-import' },
      undefined as never,
      undefined as never,
      undefined as never,
    )
    const payload = JSON.parse((result.content[0] as any).text) as Record<string, any>

    expect(payload).toEqual(expect.objectContaining({
      recommendedNextStep: expect.any(String),
      exampleQuestionsThisNodeCanAnswer: expect.any(Array),
      keyProperties: expect.arrayContaining([
        expect.objectContaining({ name: 'jsonData', required: true }),
      ]),
      requiredInputs: expect.arrayContaining(['jsonData']),
    }))
  })
})
