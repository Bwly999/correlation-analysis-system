import { BENCHMARK_CASES } from './cases.js'
import {
  parseBenchmarkCliArgs,
  printBenchmarkReport,
  runBenchmarkSuite,
  writeBenchmarkReport,
} from './core.js'

const main = async () => {
  const options = parseBenchmarkCliArgs(process.argv.slice(2))
  const report = await runBenchmarkSuite(BENCHMARK_CASES, options, process.env)

  printBenchmarkReport(report)

  if (options.jsonOut) {
    const outputPath = await writeBenchmarkReport(options.jsonOut, report)
    console.log(`\nJSON 报告已写入: ${outputPath}`)
  }

  process.exit(report.totals.failCount > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Benchmark 运行失败:', error)
  process.exit(1)
})
