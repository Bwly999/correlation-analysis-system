import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { WorkflowAiModelProfile } from '../../src/ai/types.js'
import type { BenchmarkCase, BenchmarkSuite } from './cases.js'

const DEFAULT_BENCHMARK_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
const DEFAULT_BENCHMARK_MODEL = 'glm-4.7'

export type BenchmarkCliOptions = {
  suite: BenchmarkSuite | 'all'
  caseId?: string
  runs: number
  jsonOut?: string
}

export type BenchmarkRunResult = {
  caseId: string
  caseName: string
  suite: BenchmarkSuite
  passed: boolean
  durationMs: number
  totalIterations: number
  totalSuccessfulExecutions: number
  planValid: boolean
  conclusionGenerated: boolean
  expectedNodesMatched: boolean
  keywordMatched: boolean
  nodeTypesGenerated: string[]
  failureReasons: string[]
  error?: string
}

export type BenchmarkCaseSummary = {
  caseId: string
  caseName: string
  suite: BenchmarkSuite
  runs: number
  passCount: number
  failCount: number
  passRate: number
  stable: boolean
  medianDurationMs: number
  medianIterations: number
  averageSuccessfulExecutions: number
  conclusionGenerationRate: number
  failureReasons: Record<string, number>
  latestNodeTypesGenerated: string[]
}

export type BenchmarkReport = {
  generatedAt: string
  profile: {
    baseUrl: string
    model: string
  }
  options: BenchmarkCliOptions
  summaries: BenchmarkCaseSummary[]
  totals: {
    caseCount: number
    runCount: number
    passCount: number
    failCount: number
    overallPassRate: number
    stableCaseCount: number
  }
}

const median = (values: number[]) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1] ?? 0
    const right = sorted[middle] ?? 0
    return (left + right) / 2
  }
  return sorted[middle] ?? 0
}

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`Benchmark 超时（>${timeoutMs}ms）`))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolvePromise(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        rejectPromise(error)
      })
  })

const normalizeFailureReason = (message: string) => {
  if (/OPENAI_API_KEY/i.test(message)) return 'missing_api_key'
  if (/超时|timed out|timeout/i.test(message)) return 'timeout'
  if (/unsupported_node_type/i.test(message)) return 'unsupported_node'
  return 'runtime_error'
}

const buildFailureReasons = (result: {
  error?: string
  planValid: boolean
  expectedNodesMatched: boolean
  totalSuccessfulExecutions: number
  conclusionGenerated: boolean
  keywordMatched: boolean
  benchmarkCase: BenchmarkCase
}) => {
  const reasons: string[] = []

  if (result.error) {
    reasons.push(normalizeFailureReason(result.error))
  }
  if (result.benchmarkCase.assertPlanValid && !result.planValid) {
    reasons.push('plan_invalid')
  }
  if (!result.expectedNodesMatched) {
    reasons.push('expected_nodes_missing')
  }
  if (result.totalSuccessfulExecutions < result.benchmarkCase.minExecutionCount) {
    reasons.push('execution_count_below_threshold')
  }
  if (result.benchmarkCase.assertConclusionPresent && !result.conclusionGenerated) {
    reasons.push('conclusion_missing')
  }
  if (!result.keywordMatched) {
    reasons.push('conclusion_keyword_missing')
  }

  return reasons
}

export const parseBenchmarkCliArgs = (args: string[]): BenchmarkCliOptions => {
  const suiteArg = args.find((arg) => arg.startsWith('--suite='))
  const caseArg = args.find((arg) => arg.startsWith('--case='))
  const runsArg = args.find((arg) => arg.startsWith('--runs='))
  const jsonOutArg = args.find((arg) => arg.startsWith('--json-out='))

  const suiteValue = suiteArg?.slice('--suite='.length)
  const parsedRuns = Number(runsArg?.slice('--runs='.length) ?? 3)

  return {
    suite:
      suiteValue === 'base' || suiteValue === 'adversarial' || suiteValue === 'all'
        ? suiteValue
        : 'all',
    caseId: caseArg?.slice('--case='.length) || undefined,
    runs: Number.isFinite(parsedRuns) && parsedRuns > 0 ? Math.floor(parsedRuns) : 3,
    jsonOut: jsonOutArg?.slice('--json-out='.length) || undefined,
  }
}

export const buildBenchmarkProfile = (
  env: NodeJS.ProcessEnv,
): WorkflowAiModelProfile => ({
  id: 'benchmark-profile',
  name: 'Benchmark Profile',
  baseUrl: env.OPENAI_COMPAT_BASE_URL || DEFAULT_BENCHMARK_BASE_URL,
  model: env.WORKFLOW_AI_DEFAULT_MODEL || DEFAULT_BENCHMARK_MODEL,
  apiKey: env.OPENAI_API_KEY || '',
  enabled: true,
  source: 'custom',
})

export const selectBenchmarkCases = (
  cases: BenchmarkCase[],
  options: BenchmarkCliOptions,
) => cases.filter((benchmarkCase) => {
  const suiteMatches = options.suite === 'all' || benchmarkCase.suite === options.suite
  const caseMatches = !options.caseId || benchmarkCase.id === options.caseId
  return suiteMatches && caseMatches
})

export const runSingleBenchmarkCase = async (
  benchmarkCase: BenchmarkCase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BenchmarkRunResult> => {
  const startedAt = Date.now()
  const profile = buildBenchmarkProfile(env)

  if (!profile.apiKey) {
    return {
      caseId: benchmarkCase.id,
      caseName: benchmarkCase.name,
      suite: benchmarkCase.suite,
      passed: false,
      durationMs: Date.now() - startedAt,
      totalIterations: 0,
      totalSuccessfulExecutions: 0,
      planValid: false,
      conclusionGenerated: false,
      expectedNodesMatched: false,
      keywordMatched: false,
      nodeTypesGenerated: [],
      failureReasons: ['missing_api_key'],
      error: 'OPENAI_API_KEY 环境变量未设置',
    }
  }

  try {
    const [{ buildServerWorkflowAiNodeCatalog }, { runAgentLoop }] = await Promise.all([
      import('../../src/server/workflowAi/nodeCatalog.js'),
      import('../../src/server/agentLoop/engine.js'),
    ])

    const request = {
      mode: 'create' as const,
      prompt: benchmarkCase.prompt,
      profile,
      nodeCatalog: buildServerWorkflowAiNodeCatalog(),
    }

    const output = await withTimeout(
      runAgentLoop(
        request,
        {
          maxIterations: benchmarkCase.maxIterations,
          autoExecute: true,
          generateConclusion: benchmarkCase.assertConclusionPresent,
        },
        () => {},
      ),
      benchmarkCase.timeoutMs,
    )

    const lastIteration = output.iterations[output.iterations.length - 1]
    const nodeTypes = output.iterations.flatMap((iteration) =>
      iteration.plan.operations
        .filter((operation) => operation.type === 'createNode')
        .map((operation) => operation.nodeType),
    )

    const planValid = lastIteration ? lastIteration.plan.operations.length > 0 : false
    const conclusionGenerated = output.conclusion !== null
    const expectedNodesMatched = benchmarkCase.expectedNodeTypes.every((expected) =>
      nodeTypes.some((nodeType) => nodeType === expected),
    )
    const totalSuccessfulExecutions = output.iterations.reduce(
      (sum, iteration) => sum + iteration.executionResults.filter((result) => result.success).length,
      0,
    )
    const keywordMatched = !benchmarkCase.expectedConclusionKeywords?.length
      || (output.conclusion
        ? benchmarkCase.expectedConclusionKeywords.some((keyword) =>
            output.conclusion!.summary.includes(keyword),
          )
        : false)

    const failureReasons = buildFailureReasons({
      benchmarkCase,
      planValid,
      expectedNodesMatched,
      totalSuccessfulExecutions,
      conclusionGenerated,
      keywordMatched,
    })

    return {
      caseId: benchmarkCase.id,
      caseName: benchmarkCase.name,
      suite: benchmarkCase.suite,
      passed: failureReasons.length === 0,
      durationMs: Date.now() - startedAt,
      totalIterations: output.totalIterations,
      totalSuccessfulExecutions,
      planValid,
      conclusionGenerated,
      expectedNodesMatched,
      keywordMatched,
      nodeTypesGenerated: [...new Set(nodeTypes)],
      failureReasons,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      caseId: benchmarkCase.id,
      caseName: benchmarkCase.name,
      suite: benchmarkCase.suite,
      passed: false,
      durationMs: Date.now() - startedAt,
      totalIterations: 0,
      totalSuccessfulExecutions: 0,
      planValid: false,
      conclusionGenerated: false,
      expectedNodesMatched: false,
      keywordMatched: false,
      nodeTypesGenerated: [],
      failureReasons: [normalizeFailureReason(message)],
      error: message,
    }
  }
}

const summarizeCaseRuns = (
  benchmarkCase: BenchmarkCase,
  runResults: BenchmarkRunResult[],
): BenchmarkCaseSummary => {
  const passCount = runResults.filter((result) => result.passed).length
  const failureReasonCounts = runResults.reduce<Record<string, number>>((accumulator, result) => {
    result.failureReasons.forEach((reason) => {
      accumulator[reason] = (accumulator[reason] ?? 0) + 1
    })
    return accumulator
  }, {})

  return {
    caseId: benchmarkCase.id,
    caseName: benchmarkCase.name,
    suite: benchmarkCase.suite,
    runs: runResults.length,
    passCount,
    failCount: runResults.length - passCount,
    passRate: runResults.length === 0 ? 0 : passCount / runResults.length,
    stable: passCount === runResults.length,
    medianDurationMs: median(runResults.map((result) => result.durationMs)),
    medianIterations: median(runResults.map((result) => result.totalIterations)),
    averageSuccessfulExecutions: average(
      runResults.map((result) => result.totalSuccessfulExecutions),
    ),
    conclusionGenerationRate: average(
      runResults.map((result) => (result.conclusionGenerated ? 1 : 0)),
    ),
    failureReasons: failureReasonCounts,
    latestNodeTypesGenerated: runResults[runResults.length - 1]?.nodeTypesGenerated ?? [],
  }
}

export const runBenchmarkSuite = async (
  cases: BenchmarkCase[],
  options: BenchmarkCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BenchmarkReport> => {
  const selectedCases = selectBenchmarkCases(cases, options)
  if (selectedCases.length === 0) {
    throw new Error(`未找到匹配的 benchmark 用例，suite=${options.suite} case=${options.caseId ?? 'all'}`)
  }

  const perCaseRuns = new Map<string, BenchmarkRunResult[]>()

  for (const benchmarkCase of selectedCases) {
    const runResults: BenchmarkRunResult[] = []
    for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
      runResults.push(await runSingleBenchmarkCase(benchmarkCase, env))
    }
    perCaseRuns.set(benchmarkCase.id, runResults)
  }

  const summaries = selectedCases.map((benchmarkCase) =>
    summarizeCaseRuns(benchmarkCase, perCaseRuns.get(benchmarkCase.id) ?? []),
  )
  const allRuns = summaries.reduce((sum, summary) => sum + summary.runs, 0)
  const allPasses = summaries.reduce((sum, summary) => sum + summary.passCount, 0)
  const profile = buildBenchmarkProfile(env)

  return {
    generatedAt: new Date().toISOString(),
    profile: {
      baseUrl: profile.baseUrl,
      model: profile.model,
    },
    options,
    summaries,
    totals: {
      caseCount: summaries.length,
      runCount: allRuns,
      passCount: allPasses,
      failCount: allRuns - allPasses,
      overallPassRate: allRuns === 0 ? 0 : allPasses / allRuns,
      stableCaseCount: summaries.filter((summary) => summary.stable).length,
    },
  }
}

export const printBenchmarkReport = (report: BenchmarkReport) => {
  console.log(`\n🧪 Agent Benchmark`)
  console.log(`模型: ${report.profile.model}`)
  console.log(`Endpoint: ${report.profile.baseUrl}`)
  console.log(`Suite: ${report.options.suite}`)
  console.log(`重复次数: ${report.options.runs}`)
  console.log('─'.repeat(72))

  for (const summary of report.summaries) {
    const status = summary.stable ? '✅ 稳定' : summary.passCount > 0 ? '⚠️ 波动' : '❌ 失败'
    console.log(`\n▶ ${summary.caseName} [${summary.suite}]`)
    console.log(`  状态: ${status}`)
    console.log(`  通过: ${summary.passCount}/${summary.runs} (${(summary.passRate * 100).toFixed(0)}%)`)
    console.log(`  中位耗时: ${(summary.medianDurationMs / 1000).toFixed(1)}s`)
    console.log(`  中位轮次: ${summary.medianIterations}`)
    console.log(`  平均成功执行节点: ${summary.averageSuccessfulExecutions.toFixed(1)}`)
    console.log(`  结论生成率: ${(summary.conclusionGenerationRate * 100).toFixed(0)}%`)
    console.log(`  节点: ${summary.latestNodeTypesGenerated.join(', ') || '无'}`)
    if (Object.keys(summary.failureReasons).length > 0) {
      console.log(
        `  失败原因: ${Object.entries(summary.failureReasons)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ')}`,
      )
    }
  }

  console.log('\n' + '─'.repeat(72))
  console.log(`总用例: ${report.totals.caseCount}`)
  console.log(`总运行: ${report.totals.runCount}`)
  console.log(`总通过: ${report.totals.passCount}`)
  console.log(`总失败: ${report.totals.failCount}`)
  console.log(`总体通过率: ${(report.totals.overallPassRate * 100).toFixed(0)}%`)
  console.log(`稳定用例数: ${report.totals.stableCaseCount}/${report.totals.caseCount}`)
}

export const writeBenchmarkReport = async (
  jsonOut: string,
  report: BenchmarkReport,
) => {
  const outputPath = resolve(jsonOut)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8')
  return outputPath
}
