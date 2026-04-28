import { describe, expect, it } from 'vitest'
import { BENCHMARK_CASES } from '../cases.js'
import {
  buildBenchmarkProfile,
  evaluateBenchmarkOutput,
  parseBenchmarkCliArgs,
  runBenchmarkSuite,
  selectBenchmarkCases,
} from '../core.js'

describe('agent benchmark core', () => {
  it('parses suite, case, runs and json output flags', () => {
    const options = parseBenchmarkCliArgs([
      '--suite=adversarial',
      '--case=empty-result-stop',
      '--runs=5',
      '--json-out=tmp/report.json',
    ])

    expect(options).toEqual({
      suite: 'adversarial',
      caseId: 'empty-result-stop',
      runs: 5,
      jsonOut: 'tmp/report.json',
    })
  })

  it('builds the benchmark profile with the coding endpoint by default', () => {
    const profile = buildBenchmarkProfile({})

    expect(profile.baseUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4')
    expect(profile.model).toBe('glm-4.7')
    expect(profile.apiKey).toBe('')
  })

  it('filters cases by suite and explicit case id', () => {
    const cases = selectBenchmarkCases(BENCHMARK_CASES, {
      suite: 'base',
      caseId: 'quick-pearson-demo',
      runs: 3,
    })

    expect(cases).toHaveLength(1)
    expect(cases[0]?.id).toBe('quick-pearson-demo')
  })

  it('fails when a forbidden node type is generated', () => {
    const result = evaluateBenchmarkOutput({
      id: 'non-numeric-profile-fallback',
      suite: 'adversarial',
      name: '非数值字段回退',
      description: '避免盲目相关性分析',
      prompt: '类别字段',
      expectedNodeTypes: ['manual-json-import'],
      forbiddenNodeTypes: ['pearson'],
      maxIterations: 1,
      assertPlanValid: true,
      assertConclusionPresent: true,
      expectedConclusionKeywords: ['类别', '数值'],
      minExecutionCount: 1,
      timeoutMs: 120_000,
    }, {
      iterations: [
        {
          iteration: 1,
          plan: {
            summary: '错误地直接做相关性',
            assumptions: [],
            warnings: [],
            questions: [],
            operations: [
              { id: 'node_1', type: 'createNode', nodeType: 'manual-json-import' },
              { id: 'node_2', type: 'createNode', nodeType: 'pearson' },
            ],
          },
          executionResults: [{ nodeId: 'node_1', success: true }],
          interpretation: null,
        },
      ],
      conclusion: {
        summary: '类别字段需要先转成数值',
        findings: [],
        recommendations: [],
        caveats: [],
      },
      totalIterations: 1,
      totalDurationMs: 10,
    })

    expect(result.forbiddenNodesAbsent).toBe(false)
    expect(result.failureReasons).toContain('forbidden_nodes_present')
  })

  it('captures plan and conclusion summaries for benchmark diagnostics', () => {
    const result = evaluateBenchmarkOutput(BENCHMARK_CASES[0]!, {
      iterations: [
        {
          iteration: 1,
          plan: {
            summary: '先导入 JSON，再计算 Pearson',
            assumptions: [],
            warnings: [],
            questions: [],
            operations: [
              { id: 'node_1', type: 'createNode', nodeType: 'manual-json-import' },
              { id: 'node_2', type: 'createNode', nodeType: 'pearson' },
            ],
          },
          executionResults: [
            { nodeId: 'node_1', success: true },
            { nodeId: 'node_2', success: true },
          ],
          interpretation: null,
        },
      ],
      conclusion: {
        summary: '相关分析已完成',
        findings: [],
        recommendations: [],
        caveats: [],
      },
      totalIterations: 1,
      totalDurationMs: 10,
    })

    expect(result.planSummary).toBe('先导入 JSON，再计算 Pearson')
    expect(result.conclusionSummary).toBe('相关分析已完成')
  })

  it('includes per-run diagnostics in JSON report data', async () => {
    const report = await runBenchmarkSuite([BENCHMARK_CASES[0]!], {
      suite: 'base',
      runs: 1,
    }, {})

    expect(report.runDetails).toEqual([
      expect.objectContaining({
        caseId: 'quick-pearson-demo',
        runs: [
          expect.objectContaining({
            failureReasons: ['missing_api_key'],
            planSummary: '',
            conclusionSummary: '',
          }),
        ],
      }),
    ])
  })
})
