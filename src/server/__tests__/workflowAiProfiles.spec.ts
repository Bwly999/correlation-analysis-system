import { describe, expect, it } from 'vitest'
import {
  getSystemModelProfiles,
  normalizePlanWithCatalog,
  parsePlan,
  resolveModelProfile,
} from '../workflowAi/profiles.js'

describe('workflowAi profiles', () => {
  it('provides zhipu glm-4.7 as the default system profile', () => {
    const profiles = getSystemModelProfiles()

    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.7',
      enabled: true,
      isDefault: true,
      source: 'system',
    })
  })

  it('restores the hidden api key for system profiles by id', () => {
    const profile = resolveModelProfile({
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.7',
      enabled: true,
      source: 'system',
    })

    expect(profile.apiKey).toBeTruthy()
    expect(profile.model).toBe('glm-4.7')
  })

  it('normalizes legacy glm operation aliases into the workflow schema', () => {
    const plan = parsePlan(`{
      "summary": "创建一个简单工作流",
      "assumptions": ["使用默认样例数据"],
      "warnings": [],
      "questions": [],
      "operations": [
        {
          "type": "createNode",
          "id": "node_import",
          "name": "manual-json-import",
          "config": {}
        },
        {
          "type": "createNode",
          "id": "node_pearson",
          "name": "pearson",
          "config": {}
        },
        {
          "type": "connectNodes",
          "id": "edge_1",
          "sourceNodeId": "node_import",
          "targetNodeId": "node_pearson"
        }
      ]
    }`)

    expect(plan.operations).toEqual([
      {
        id: 'node_import',
        type: 'createNode',
        nodeType: 'manual-json-import',
        nodeLabel: undefined,
        position: undefined,
        config: {},
      },
      {
        id: 'node_pearson',
        type: 'createNode',
        nodeType: 'pearson',
        nodeLabel: undefined,
        position: undefined,
        config: {},
      },
      {
        id: 'edge_1',
        type: 'connectNodes',
        sourceRef: 'node_import',
        targetRef: 'node_pearson',
        sourceHandle: undefined,
        targetHandle: undefined,
      },
    ])
  })

  it('maps abstract category node types back to concrete catalog nodes', () => {
    const plan = normalizePlanWithCatalog(
      {
        summary: '创建一个简单工作流',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [
          {
            id: 'node_import',
            type: 'createNode',
            nodeType: 'trigger',
            nodeLabel: '手动输入数据',
          },
          {
            id: 'node_pearson',
            type: 'createNode',
            nodeType: 'terminal',
            nodeLabel: 'Pearson 相关系数',
          },
        ],
      },
      [
        {
          name: 'manual-json-import',
          displayName: '手动输入数据',
          category: 'trigger',
          description: '',
          inputMode: 'single',
          minInputs: 0,
          maxInputs: 1,
          allowedNextCategories: ['action', 'terminal'],
          properties: [],
          help: null,
          assistantHints: null,
        },
        {
          name: 'pearson',
          displayName: 'Pearson 相关系数',
          category: 'terminal',
          description: '',
          inputMode: 'single',
          minInputs: 1,
          maxInputs: 1,
          allowedNextCategories: [],
          properties: [],
          help: null,
          assistantHints: null,
        },
      ],
    )

    expect(plan.operations).toEqual([
      {
        id: 'node_import',
        type: 'createNode',
        nodeType: 'manual-json-import',
        nodeLabel: '手动输入数据',
      },
      {
        id: 'node_pearson',
        type: 'createNode',
        nodeType: 'pearson',
        nodeLabel: 'Pearson 相关系数',
      },
    ])
  })
})

