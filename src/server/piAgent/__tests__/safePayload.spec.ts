import { describe, expect, it } from 'vitest'
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import {
  assertPiAgentSafeRequest,
  sanitizePiAgentDataSources,
} from '../safePayload.js'

const baseRequest = (): WorkflowAiPlanRequest => ({
  mode: 'edit',
  prompt: '分析销量与价格关系',
  profile: {
    id: 'profile_1',
    name: '测试模型',
    baseUrl: 'http://example.com',
    model: 'glm-4.7',
    enabled: true,
    source: 'custom',
  },
  nodeCatalog: [],
})

describe('pi agent safe payload', () => {
  it('rejects requests that contain raw rows in data source binding payload', () => {
    expect(() =>
      assertPiAgentSafeRequest({
        ...baseRequest(),
        dataSources: [
          {
            id: 'ds_1',
            kind: 'file',
            entryNodeType: 'file-import',
            label: '销售数据',
            schemaSummary: {
              nodeId: 'node_1',
              nodeLabel: '导入数据',
              resultKind: 'table',
              numericColumns: ['price'],
              candidateTargetColumns: ['sales'],
              candidateFeatureColumns: ['price'],
              blockedReasons: [],
            },
            bindingPayload: {
              rows: [{ price: 10, sales: 20 }],
            },
          },
        ],
      }),
    ).toThrow('Pi Agent 会话不允许包含完整行数据，请仅传递摘要上下文')
  })

  it('sanitizes data source payloads before exposing them to tools', () => {
    const dataSources = sanitizePiAgentDataSources([
      {
        id: 'ds_1',
        kind: 'file',
        entryNodeType: 'file-import',
        label: '销售数据',
        sourceMeta: {
          fileName: 'sales.xlsx',
        },
        schemaSummary: {
          nodeId: 'node_1',
          nodeLabel: '导入数据',
          resultKind: 'table',
          numericColumns: ['price'],
          candidateTargetColumns: ['sales'],
          candidateFeatureColumns: ['price'],
          blockedReasons: [],
        },
        bindingPayload: {
          rows: [{ price: 10, sales: 20 }],
          format: 'json',
        },
      },
    ])

    expect(dataSources).toEqual([
      {
        id: 'ds_1',
        kind: 'file',
        entryNodeType: 'file-import',
        label: '销售数据',
        sourceMeta: {
          fileName: 'sales.xlsx',
        },
        schemaSummary: expect.objectContaining({
          nodeId: 'node_1',
          nodeLabel: '导入数据',
        }),
      },
    ])
  })
})
