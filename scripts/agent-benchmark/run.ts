import { BENCHMARK_CASES, type BenchmarkCase } from './cases.js'

interface BenchmarkResult {
  caseId: string
  caseName: string
  passed: boolean
  durationMs: number
  totalIterations: number
  planValid: boolean
  conclusionGenerated: boolean
  nodeTypesGenerated: string[]
  error?: string
}

const runSingleCase = async (benchmarkCase: BenchmarkCase): Promise<BenchmarkResult> => {
  const startedAt = Date.now()

  try {
    // 动态导入避免编译时依赖问题
    const { buildWorkflowAiNodeCatalog } = await import('../../src/ai/catalog.js')
    const { runAgentLoop } = await import('../../src/server/agentLoop/engine.js')

    const profile = {
      id: 'benchmark-profile',
      name: 'Benchmark Profile',
      baseUrl: process.env.OPENAI_COMPAT_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.WORKFLOW_AI_DEFAULT_MODEL || 'glm-4.7',
      apiKey: process.env.OPENAI_API_KEY || '',
      enabled: true,
      source: 'system' as const,
    }

    if (!profile.apiKey) {
      return {
        caseId: benchmarkCase.id,
        caseName: benchmarkCase.name,
        passed: false,
        durationMs: Date.now() - startedAt,
        totalIterations: 0,
        planValid: false,
        conclusionGenerated: false,
        nodeTypesGenerated: [],
        error: 'OPENAI_API_KEY 环境变量未设置',
      }
    }

    const request = {
      mode: 'create' as const,
      prompt: benchmarkCase.prompt,
      profile,
      nodeCatalog: buildWorkflowAiNodeCatalog(),
    }

    const events: any[] = []
    const output = await runAgentLoop(
      request,
      {
        maxIterations: benchmarkCase.maxIterations,
        autoExecute: true,
        generateConclusion: benchmarkCase.assertConclusionPresent,
      },
      (event) => {
        events.push(event)
      },
    )

    const lastIteration = output.iterations[output.iterations.length - 1]
    const nodeTypes = output.iterations.flatMap((it) =>
      it.plan.operations
        .filter((op) => op.type === 'createNode')
        .map((op) => op.nodeType),
    )

    const planValid = lastIteration
      ? lastIteration.plan.operations.length > 0
      : false

    const conclusionGenerated = output.conclusion !== null

    const hasExpectedNodes = benchmarkCase.expectedNodeTypes.every((expected) =>
      nodeTypes.some((nt) => nt === expected),
    )

    const totalExecCount = output.iterations.reduce(
      (sum, it) => sum + it.executionResults.filter((r) => r.success).length,
      0,
    )

    const minExecMet = totalExecCount >= benchmarkCase.minExecutionCount

    const keywordMatch = !benchmarkCase.expectedConclusionKeywords?.length
      || (output.conclusion
        && benchmarkCase.expectedConclusionKeywords.some((kw) =>
          output.conclusion!.summary.includes(kw),
        ))

    const passed =
      (benchmarkCase.assertPlanValid ? planValid : true)
      && (benchmarkCase.assertConclusionPresent ? conclusionGenerated : true)
      && hasExpectedNodes
      && minExecMet
      && keywordMatch

    return {
      caseId: benchmarkCase.id,
      caseName: benchmarkCase.name,
      passed,
      durationMs: Date.now() - startedAt,
      totalIterations: output.totalIterations,
      planValid,
      conclusionGenerated,
      nodeTypesGenerated: [...new Set(nodeTypes)],
    }
  } catch (error) {
    return {
      caseId: benchmarkCase.id,
      caseName: benchmarkCase.name,
      passed: false,
      durationMs: Date.now() - startedAt,
      totalIterations: 0,
      planValid: false,
      conclusionGenerated: false,
      nodeTypesGenerated: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const main = async () => {
  const caseFilter = process.argv.find((arg) => arg.startsWith('--case='))
  const filterCase = caseFilter?.replace('--case=', '')

  const casesToRun = filterCase
    ? BENCHMARK_CASES.filter((c) => c.id === filterCase)
    : BENCHMARK_CASES

  if (casesToRun.length === 0) {
    console.log(`未找到测试用例: ${filterCase}`)
    process.exit(1)
  }

  console.log(`\n🧪 Agent Benchmark - 共 ${casesToRun.length} 个用例\n`)
  console.log('─'.repeat(60))

  const results: BenchmarkResult[] = []

  for (const benchmarkCase of casesToRun) {
    console.log(`\n▶ 运行: ${benchmarkCase.name}`)
    console.log(`  描述: ${benchmarkCase.description}`)

    const result = await runSingleCase(benchmarkCase)
    results.push(result)

    const status = result.passed ? '✅ 通过' : '❌ 失败'
    console.log(`  状态: ${status}`)
    console.log(`  耗时: ${(result.durationMs / 1000).toFixed(1)}s`)
    console.log(`  迭代: ${result.totalIterations} 轮`)
    console.log(`  节点: ${result.nodeTypesGenerated.join(', ') || '无'}`)
    console.log(`  结论: ${result.conclusionGenerated ? '已生成' : '未生成'}`)

    if (result.error) {
      console.log(`  错误: ${result.error}`)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log('\n📊 汇总报告\n')

  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.length - passedCount
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0)

  console.log(`总计: ${results.length} 个用例`)
  console.log(`通过: ${passedCount} ✅`)
  console.log(`失败: ${failedCount} ❌`)
  console.log(`通过率: ${((passedCount / results.length) * 100).toFixed(0)}%`)
  console.log(`总耗时: ${(totalDurationMs / 1000).toFixed(1)}s`)

  console.log('\n详细结果:')
  for (const result of results) {
    const status = result.passed ? '✅' : '❌'
    console.log(`  ${status} ${result.caseName} (${(result.durationMs / 1000).toFixed(1)}s, ${result.totalIterations}轮)`)
    if (result.error) {
      console.log(`     错误: ${result.error}`)
    }
  }

  process.exit(failedCount > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Benchmark 运行失败:', error)
  process.exit(1)
})
