import { describe, expect, it, vi } from 'vitest'
import { buildLocalWorkflowAiContext } from '../localContext'

describe('buildLocalWorkflowAiContext', () => {
  it('uses runtime output accessors for cached schema summaries and skips ephemeral inspect for cached nodes', async () => {
    const inspectNode = vi.fn(async () => ({
      kind: 'table',
      payload: [{ fallback: 1 }],
      schema: {
        fields: [{ name: 'fallback', type: 'number', nullable: false }],
      },
    }))

    const result = await buildLocalWorkflowAiContext({
      mode: 'edit',
      prompt: '分析相关性',
      workflowName: '测试工作流',
      nodes: [
        {
          id: 'source-node',
          type: 'custom',
          label: '来源节点',
          position: { x: 0, y: 0 },
          data: {
            label: '来源节点',
            type: 'manual-json-import',
            category: 'trigger',
            config: {},
            status: 'success',
            logs: [],
          },
        } as any,
        {
          id: 'empty-node',
          type: 'custom',
          label: '空节点',
          position: { x: 200, y: 0 },
          data: {
            label: '空节点',
            type: 'field-selection',
            category: 'action',
            config: {},
            status: 'idle',
            logs: [],
          },
        } as any,
      ],
      edges: [],
      inspectNode,
      getNodeOutput: (nodeId) =>
        nodeId === 'source-node'
          ? {
              kind: 'table',
              payload: [{ temperature: 12.3, batchCode: 'A-01' }],
              schema: {
                fields: [
                  { name: 'temperature', type: 'number', nullable: false },
                  { name: 'batchCode', type: 'string', nullable: false },
                ],
              },
            }
          : null,
    })

    expect(result.contextHints.schemaSummaries).toBeTruthy()
    expect(result.contextHints.schemaSummaries).toHaveLength(2)
    expect(result.contextHints.schemaSummaries?.[0]).toMatchObject({
      nodeId: 'source-node',
      resultKind: 'table',
    })
    expect(inspectNode).toHaveBeenCalledTimes(1)
    expect(inspectNode).toHaveBeenCalledWith('empty-node')
    expect(result.toolTrace.some((item) => item.toolName === 'inspect_cached_schema')).toBe(true)
  })
})
