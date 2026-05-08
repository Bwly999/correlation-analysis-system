import { describe, expect, it } from 'vitest'
import { verifyAgentKernelProgress } from '../verifier.js'
import { shouldAgentKernelAskForDataSource } from '../context.js'

describe('agent kernel verifier', () => {
  it('keeps data context detection inside the agent kernel', () => {
    expect(shouldAgentKernelAskForDataSource({
      mode: 'edit',
      prompt: '分析销量',
      profile: {
        id: 'p',
        name: '模型',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        apiKey: 'key',
        enabled: true,
        source: 'custom',
      },
      nodeCatalog: [],
      dataSources: [],
    })).toBe(true)
  })

  it('requires user input when an agentic analysis has no data source or schema summary', () => {
    const result = verifyAgentKernelProgress({
      intentKind: 'agentic_analysis',
      autonomy: 'agentic',
      request: {
        mode: 'edit',
        prompt: '分析销量',
        profile: {
          id: 'p',
          name: '模型',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-flash',
          apiKey: 'key',
          enabled: true,
          source: 'custom',
        },
        nodeCatalog: [],
        dataSources: [],
      },
      observations: [],
    })

    expect(result).toMatchObject({
      status: 'waiting_user',
      message: '需要先提供可分析的数据源或字段摘要',
    })
  })

  it('requires evidence before completing an agentic report', () => {
    const result = verifyAgentKernelProgress({
      intentKind: 'agentic_analysis',
      autonomy: 'agentic',
      request: {
        mode: 'edit',
        prompt: '分析销量',
        profile: {
          id: 'p',
          name: '模型',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-flash',
          apiKey: 'key',
          enabled: true,
          source: 'custom',
        },
        nodeCatalog: [],
        contextHints: {
          schemaSummaries: [
            {
              nodeId: 'sales',
              nodeLabel: '销量表',
              resultKind: 'table',
              numericColumns: ['price', 'sales'],
              candidateTargetColumns: ['sales'],
              candidateFeatureColumns: ['price'],
              blockedReasons: [],
            },
          ],
        },
      },
      observations: [
        {
          type: 'assistant_message',
          content: '价格影响销量。',
        },
      ],
    })

    expect(result).toMatchObject({
      status: 'needs_evidence',
      message: '报告核心结论缺少可追溯 evidenceId',
    })
  })

  it('marks the run completed when execution and evidence are present', () => {
    const result = verifyAgentKernelProgress({
      intentKind: 'agentic_analysis',
      autonomy: 'agentic',
      request: {
        mode: 'edit',
        prompt: '分析销量',
        profile: {
          id: 'p',
          name: '模型',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-flash',
          apiKey: 'key',
          enabled: true,
          source: 'custom',
        },
        nodeCatalog: [],
        contextHints: {
          schemaSummaries: [
            {
              nodeId: 'sales',
              nodeLabel: '销量表',
              resultKind: 'table',
              numericColumns: ['price', 'sales'],
              candidateTargetColumns: ['sales'],
              candidateFeatureColumns: ['price'],
              blockedReasons: [],
            },
          ],
        },
      },
      observations: [
        {
          type: 'tool_result',
          toolName: 'workflow_test_workflow',
          structuredContent: {
            ok: true,
            executionId: 'exec_1',
            status: 'success',
          },
        },
        {
          type: 'tool_result',
          toolName: 'workflow_extract_result_evidence',
          structuredContent: {
            evidence: [
              {
                evidenceId: 'exec_1:node_pearson_1',
              },
            ],
          },
        },
      ],
    })

    expect(result).toMatchObject({
      status: 'completed',
      message: '已具备执行记录和可追溯证据',
    })
  })
})
