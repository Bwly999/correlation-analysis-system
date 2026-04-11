import { describe, expect, it } from 'vitest'
import { BENCHMARK_CASES } from '../cases.js'
import {
  buildBenchmarkProfile,
  parseBenchmarkCliArgs,
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
})
