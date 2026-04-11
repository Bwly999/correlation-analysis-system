import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowAiPlanRequest, WorkflowAiStreamEvent } from '../../ai/types.js'

const { generateTextMock, streamTextMock, createOpenAICompatibleMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  streamTextMock: vi.fn(),
  createOpenAICompatibleMock: vi.fn(() => ({
    chatModel: (model: string) => ({ model }),
  })),
}))

vi.mock('ai', () => ({
  generateText: generateTextMock,
  streamText: streamTextMock,
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
  streamWorkflowAiPlan,
} from '../workflowAi/profiles.js'
import { buildServerWorkflowAiNodeCatalog } from '../workflowAi/nodeCatalog.js'

describe('workflowAi profiles', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-system-key')
    generateTextMock.mockReset()
    streamTextMock.mockReset()
    createOpenAICompatibleMock.mockClear()
  })

  const baseRequest: WorkflowAiPlanRequest = {
    mode: 'create',
    prompt: '导入数据后做 Pearson 分析',
    profile: {
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
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
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
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
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
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
    expect(generateTextMock.mock.calls[0]?.[0]?.system).not.toContain('data-export')
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

  it('injects recipe guidance into the skeleton prompt for common intents', async () => {
    const realisticRequest: WorkflowAiPlanRequest = {
      ...baseRequest,
      prompt: '导入一份 JSON 表格，快速演示 Pearson 相关分析，给我最小可运行流程。',
    }

    generateTextMock
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据","config":{"jsonData":"[]"}},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })

    await generateWorkflowAiPlan(realisticRequest)

    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('候选编排模板')
    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('quick-json-demo')
    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('manual-json-import')
  })

  it('injects local context hints from app-internal tools into the skeleton prompt', async () => {
    const realisticRequest: WorkflowAiPlanRequest = {
      ...baseRequest,
      prompt: '修改现有流程，继续做 Pearson 相关分析。',
      mode: 'edit',
      workflowSnapshot: {
        name: '测试工作流',
        nodes: [],
        edges: [],
      },
      contextHints: {
        recipes: [
          {
            id: 'single-table-correlation',
            name: '单表相关性分析',
            reason: '命中关键词：相关、pearson',
            minimalPattern: ['manual-json-import', 'pearson'],
          },
        ],
        schemaSummaries: [
          {
            nodeId: 'node_import_1',
            nodeLabel: '手动输入数据',
            resultKind: 'table',
            rowCount: 2,
            numericColumns: ['feature', 'target'],
            candidateTargetColumns: ['target'],
            candidateFeatureColumns: ['feature'],
            blockedReasons: [],
          },
        ],
      },
    }

    generateTextMock
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据","config":{"jsonData":"[]"}},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })

    await generateWorkflowAiPlan(realisticRequest)

    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('应用内工具已提供以下上下文摘要')
    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('single-table-correlation')
    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('"candidateTargetColumns"')
    expect(generateTextMock.mock.calls[0]?.[0]?.system).toContain('"target"')
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

  it('bypasses streaming for the bigmodel coding endpoint and uses non-streaming generation directly', async () => {
    generateTextMock
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })
      .mockResolvedValueOnce({
        text: '{"summary":"创建相关性分析流","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据","config":{"jsonData":"[{\\"feature\\":1,\\"target\\":2}]"}},{"id":"node_pearson","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import","targetRef":"node_pearson"}]}',
      })

    const events: Array<{ type: string }> = []
    const result = await streamWorkflowAiPlan(baseRequest, (event) => {
      events.push({ type: event.type })
    })

    expect(result.plan.summary).toBe('创建相关性分析流')
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(generateTextMock).toHaveBeenCalledTimes(2)
    expect(events.some((event) => event.type === 'text_delta')).toBe(true)
  })

  it('uses local heuristic planning for inline-json correlation prompts without calling the model', async () => {
    const request: WorkflowAiPlanRequest = {
      ...baseRequest,
      prompt: '帮我分析以下数据的相关性：[{"x1":1,"x2":2,"y":3},{"x1":2,"x2":4,"y":6},{"x1":3,"x2":6,"y":9}]',
      nodeCatalog: buildServerWorkflowAiNodeCatalog(),
    }

    const result = await generateWorkflowAiPlan(request)

    expect(generateTextMock).not.toHaveBeenCalled()
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(result.plan.operations).toEqual([
      expect.objectContaining({
        id: 'node_import_1',
        type: 'createNode',
        nodeType: 'manual-json-import',
        config: expect.objectContaining({
          jsonData: expect.any(String),
        }),
      }),
      expect.objectContaining({
        id: 'node_terminal_1',
        type: 'createNode',
        nodeType: 'pearson',
        config: {
          xFields: ['x1', 'x2'],
          yFields: ['y'],
          topN: 3,
        },
      }),
      expect.objectContaining({
        type: 'connectNodes',
        sourceRef: 'node_import_1',
        targetRef: 'node_terminal_1',
      }),
    ])
    expect(JSON.parse((result.plan.operations[0] as Extract<typeof result.plan.operations[number], { type: 'createNode' }>).config!.jsonData as string)).toHaveLength(3)
    expect(result.diagnostics.status).toBe('success')
    expect(result.diagnostics.attempts).toHaveLength(1)
  })

  it('uses local heuristic planning for inline-json filter prompts in streaming mode', async () => {
    const request: WorkflowAiPlanRequest = {
      ...baseRequest,
      prompt: '先筛选出 score 大于 999 的记录，再说明还能做什么分析：[{"score":70,"x":1,"y":2},{"score":85,"x":2,"y":4},{"score":90,"x":3,"y":7}]',
      nodeCatalog: buildServerWorkflowAiNodeCatalog(),
    }

    const events: WorkflowAiStreamEvent[] = []
    const result = await streamWorkflowAiPlan(request, (event) => {
      events.push(event)
    })

    expect(generateTextMock).not.toHaveBeenCalled()
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(result.plan.operations).toEqual([
      expect.objectContaining({
        id: 'node_import_1',
        type: 'createNode',
        nodeType: 'manual-json-import',
      }),
      expect.objectContaining({
        id: 'node_filter_1',
        type: 'createNode',
        nodeType: 'data-filter',
        config: {
          matchMode: 'all',
          conditions: [
            {
              field: 'score',
              operator: 'gt',
              value: 999,
            },
          ],
        },
      }),
      expect.objectContaining({
        type: 'connectNodes',
        sourceRef: 'node_import_1',
        targetRef: 'node_filter_1',
      }),
    ])
    expect(events.some((event) => event.type === 'completed')).toBe(true)
    expect(events.some((event) => event.type === 'text_delta')).toBe(true)
  })
})
