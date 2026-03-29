import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'

const { generateTextMock, createOpenAICompatibleMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  createOpenAICompatibleMock: vi.fn(() => ({
    chatModel: (model: string) => ({ model }),
  })),
}))

vi.mock('ai', () => ({
  generateText: generateTextMock,
}))

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}))
import {
  generateWorkflowAiPlan,
  getSystemModelProfiles,
  normalizePlanWithCatalog,
  parsePlan,
  resolveModelProfile,
} from '../workflowAi/profiles.js'

describe('workflowAi profiles', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-system-key')
    generateTextMock.mockReset()
    createOpenAICompatibleMock.mockClear()
  })

  const baseRequest: WorkflowAiPlanRequest = {
    mode: 'create',
    prompt: '导入数据后做 Pearson 分析',
    profile: {
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.7',
      enabled: true,
      source: 'system',
    },
    nodeCatalog: [
      {
        name: 'manual-json-import',
        displayName: '手动输入数据',
        category: 'trigger',
        description: '导入 JSON 数据',
        inputMode: 'single',
        minInputs: 0,
        maxInputs: 1,
        allowedNextCategories: ['action', 'terminal'],
        properties: [
          {
            name: 'jsonData',
            displayName: 'JSON 数据',
            type: 'textarea',
            required: true,
            isRuntimeInput: false,
            defaultValue: '',
            description: 'JSON 字符串',
          },
        ],
        help: null,
        assistantHints: null,
      },
      {
        name: 'pearson',
        displayName: 'Pearson 相关系数',
        category: 'terminal',
        description: '相关性分析',
        inputMode: 'single',
        minInputs: 1,
        maxInputs: 1,
        allowedNextCategories: [],
        properties: [],
        help: null,
        assistantHints: null,
      },
    ],
  }

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
    expect(profile.apiKey).toBe('test-system-key')
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

  it('returns plan diagnostics when fenced JSON can be repaired directly', async () => {
    generateTextMock
      .mockResolvedValueOnce({
        text: '```json\n{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}\n```',
      })
      .mockResolvedValueOnce({
        text: '```json\n{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据","config":{"jsonData":"[]"}},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}\n```',
      })

    const result = await generateWorkflowAiPlan(baseRequest)

    expect(result.plan?.summary).toBe('创建相关性分析流')
    expect(result.plan?.operations).toHaveLength(3)
    expect(result.diagnostics.status).toBe('success')
    expect(result.diagnostics.stage).toBe('validate')
    expect(result.diagnostics.attempts).toHaveLength(2)
    expect(result.diagnostics.rawOutputExcerpt).toContain('创建相关性分析流')
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })

  it('retries once with a repair prompt when the first model output is not valid JSON', async () => {
    generateTextMock
      .mockResolvedValueOnce({
        text: '我建议先导入数据，再分析相关性。',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"最小可行相关性分析流","assumptions":[],"warnings":["未补充字段筛选"],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"最小可行相关性分析流","assumptions":[],"warnings":["未补充字段筛选"],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据","config":{"jsonData":"[]"}},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })

    const result = await generateWorkflowAiPlan(baseRequest)

    expect(generateTextMock).toHaveBeenCalledTimes(3)
    expect(generateTextMock.mock.calls[1]?.[0]?.prompt).toContain('上一轮失败原因')
    expect(result.plan?.summary).toBe('最小可行相关性分析流')
    expect(result.diagnostics.attempts).toHaveLength(3)
    expect(result.diagnostics.attempts[0]).toMatchObject({
      attempt: 1,
      trigger: 'initial',
      status: 'failed',
      stage: 'parse',
    })
    expect(result.diagnostics.attempts[1]).toMatchObject({
      attempt: 2,
      trigger: 'repair',
      status: 'success',
      stage: 'validate',
    })
    expect(result.diagnostics.attempts[2]).toMatchObject({
      attempt: 3,
      trigger: 'initial',
      status: 'success',
      stage: 'validate',
    })
  })

  it('uses a two-stage prompt strategy and narrows the configuration stage to the selected node subset', async () => {
    const extendedRequest: WorkflowAiPlanRequest = {
      ...baseRequest,
      nodeCatalog: [
        ...baseRequest.nodeCatalog,
        {
          name: 'data-export',
          displayName: '数据导出',
          category: 'terminal',
          description: '导出结果',
          inputMode: 'single',
          minInputs: 1,
          maxInputs: 1,
          allowedNextCategories: [],
          properties: [
            {
              name: 'format',
              displayName: '导出格式',
              type: 'options',
              required: false,
              isRuntimeInput: false,
              defaultValue: 'csv',
              description: '',
            },
          ],
          help: null,
          assistantHints: { keywords: ['导出', '下载'] },
        },
      ],
    }

    generateTextMock
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据","config":{"jsonData":"[]"}},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })

    await generateWorkflowAiPlan(extendedRequest)

    expect(generateTextMock).toHaveBeenCalledTimes(2)
    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('当前阶段是骨架规划')
    expect(generateTextMock.mock.calls[1]?.[0]?.system).toContain('当前阶段是配置补全')
    expect(generateTextMock.mock.calls[1]?.[0]?.system).toContain('manual-json-import')
    expect(generateTextMock.mock.calls[1]?.[0]?.system).toContain('pearson')
    expect(generateTextMock.mock.calls[1]?.[0]?.system).not.toContain('data-export')
  })

  it('adds weak-model guidance for json import intent and required config semantics', async () => {
    const realisticRequest: WorkflowAiPlanRequest = {
      ...baseRequest,
      prompt: '导入一份 JSON 表格，直接做 Pearson 相关分析，输出最小可运行工作流。',
      nodeCatalog: [
        {
          name: 'file-import',
          displayName: '本地文件导入',
          category: 'trigger',
          description: '从 CSV、JSON、Excel 等文件读取原始因子数据。',
          inputMode: 'single',
          minInputs: 0,
          maxInputs: 1,
          allowedNextCategories: ['action', 'terminal'],
          properties: [
            {
              name: 'fileData',
              displayName: '选择数据文件',
              type: 'file',
              required: true,
              isRuntimeInput: true,
              defaultValue: null,
              description: '请上传需要分析的原始数据集',
            },
          ],
          help: null,
          assistantHints: { keywords: ['文件', '上传'] },
        },
        {
          name: 'manual-json-import',
          displayName: '手动输入数据',
          category: 'trigger',
          description: '手动输入 JSON 格式的原始数据集，支持快速调试。',
          inputMode: 'single',
          minInputs: 0,
          maxInputs: 1,
          allowedNextCategories: ['action', 'terminal'],
          properties: [
            {
              name: 'jsonData',
              displayName: 'JSON 数据内容',
              type: 'json',
              required: true,
              isRuntimeInput: false,
              defaultValue: '[]',
              description: '请直接输入符合 JSON 标准的数组或对象数据',
            },
          ],
          help: null,
          assistantHints: { keywords: ['json', '粘贴', '样例'] },
        },
        {
          name: 'pearson',
          displayName: 'Pearson 相关系数',
          category: 'terminal',
          description: '相关性分析',
          inputMode: 'single',
          minInputs: 1,
          maxInputs: 1,
          allowedNextCategories: [],
          properties: [
            {
              name: 'xFields',
              displayName: 'X 字段',
              type: 'multi-options',
              required: true,
              isRuntimeInput: false,
              defaultValue: [],
              description: '选择参与相关性计算的 X 字段集合',
            },
            {
              name: 'yFields',
              displayName: 'Y 字段',
              type: 'multi-options',
              required: true,
              isRuntimeInput: false,
              defaultValue: [],
              description: '选择参与相关性计算的 Y 字段集合',
            },
          ],
          help: null,
          assistantHints: { keywords: ['相关性', 'pearson'] },
        },
      ],
    }

    generateTextMock
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据","config":{"jsonData":"[{\\"feature\\":1,\\"target\\":2}]"}},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数","config":{"xFields":["feature"],"yFields":["target"]}},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })

    await generateWorkflowAiPlan(realisticRequest)

    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('优先使用 manual-json-import')
    expect(generateTextMock.mock.calls[1]?.[0]?.system).toContain('X 字段')
    expect(generateTextMock.mock.calls[1]?.[0]?.system).toContain('选择参与相关性计算的 X 字段集合')
    expect(generateTextMock.mock.calls[1]?.[0]?.system).toContain('不要输出空数组')
  })

  it('returns a recoverable draft plan when configuration repair still fails after a missing-required-config validation error', async () => {
    const realisticRequest: WorkflowAiPlanRequest = {
      ...baseRequest,
      prompt: '导入一份 JSON 表格，直接做 Pearson 相关分析，输出最小可运行工作流。',
      nodeCatalog: [
        {
          name: 'file-import',
          displayName: '本地文件导入',
          category: 'trigger',
          description: '从 CSV、JSON、Excel 等文件读取原始因子数据。',
          inputMode: 'single',
          minInputs: 0,
          maxInputs: 1,
          allowedNextCategories: ['action', 'terminal'],
          properties: [
            {
              name: 'fileData',
              displayName: '选择数据文件',
              type: 'file',
              required: true,
              isRuntimeInput: true,
              defaultValue: null,
              description: '请上传需要分析的原始数据集',
            },
          ],
          help: null,
          assistantHints: null,
        },
        {
          name: 'pearson',
          displayName: 'Pearson 相关系数',
          category: 'terminal',
          description: '相关性分析',
          inputMode: 'single',
          minInputs: 1,
          maxInputs: 1,
          allowedNextCategories: [],
          properties: [
            {
              name: 'xFields',
              displayName: 'X 字段',
              type: 'multi-options',
              required: true,
              isRuntimeInput: false,
              defaultValue: [],
              description: '选择参与相关性计算的 X 字段集合',
            },
            {
              name: 'yFields',
              displayName: 'Y 字段',
              type: 'multi-options',
              required: true,
              isRuntimeInput: false,
              defaultValue: [],
              description: '选择参与相关性计算的 Y 字段集合',
            },
          ],
          help: null,
          assistantHints: null,
        },
      ],
    }

    generateTextMock
      .mockResolvedValueOnce({
        text: '{"summary":"导入 JSON 文件并进行 Pearson 相关性分析的最小工作流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import_1","type":"createNode","nodeType":"file-import","nodeLabel":"本地文件导入"},{"id":"node_pearson_1","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import_1","targetRef":"node_pearson_1"}]}',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"导入 JSON 文件并进行 Pearson 相关性分析的最小工作流","assumptions":["用户将上传 JSON 格式的文件"],"warnings":[],"questions":[],"operations":[{"id":"node_import_1","type":"createNode","nodeType":"file-import","nodeLabel":"本地文件导入","position":{"x":100,"y":100},"config":{}},{"id":"node_pearson_1","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数","position":{"x":400,"y":100},"config":{}},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import_1","targetRef":"node_pearson_1"}]}',
      })
      .mockResolvedValueOnce({
        text: '```json\n{"summary":"导入 JSON 文件并进行 Pearson 相关性分析的最小工作流","assumptions":["用户将上传 JSON 格式的文件"],"warnings":[],"questions":[],"operations":[{"id":"node_import_1","type":"createNode","nodeType":"file-import","nodeLabel":"本地文件导入","position":{"x":100,"y":100},"config":{}},{"id":"node_pearson_1","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数","position":{"x":400,"y":100},"config":{"xFields":[],"yFields":[]}},{"id":"edge_1",',
      })

    const result = await generateWorkflowAiPlan(realisticRequest)

    expect(generateTextMock).toHaveBeenCalledTimes(3)
    expect(result.plan.summary).toBe('导入 JSON 文件并进行 Pearson 相关性分析的最小工作流')
    expect(result.plan.questions).toContain('请为节点「Pearson 相关系数」补充以下必填配置：X 字段、Y 字段。')
    expect(result.plan.warnings).toContain('以下节点仍需手动补充配置后才能运行：Pearson 相关系数。')
    expect(result.diagnostics.status).toBe('failed')
    expect(result.diagnostics.stage).toBe('parse')
    expect(result.diagnostics.attempts).toHaveLength(3)
    expect(result.diagnostics.attempts[1]).toMatchObject({
      attempt: 2,
      trigger: 'initial',
      status: 'failed',
      stage: 'validate',
    })
    expect(result.diagnostics.attempts[2]).toMatchObject({
      attempt: 3,
      trigger: 'repair',
      status: 'failed',
      stage: 'parse',
    })
  })

  it('surfaces a clear timeout error without triggering repair retry when the model request stalls', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('Operation timed out after 45000ms'))

    await expect(generateWorkflowAiPlan(baseRequest)).rejects.toMatchObject({
      message: 'AI 模型请求超时，请稍后重试或切换模型配置',
      diagnostics: {
        stage: 'model_request',
        attempts: [
          {
            attempt: 1,
            trigger: 'initial',
            status: 'failed',
            stage: 'model_request',
            message: 'AI 模型请求超时，请稍后重试或切换模型配置',
          },
        ],
        issues: [
          {
            stage: 'model_request',
            operationId: 'plan',
            message: 'AI 模型请求超时，请稍后重试或切换模型配置',
          },
        ],
      },
    })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })
})
