import { describe, it, expect } from 'vitest'
import { parseConclusion } from '../conclusionGenerator.js'

// 只测试纯函数 parseConclusion，不 mock AI SDK
describe('parseConclusion', () => {
  it('解析正确的 JSON 结论', () => {
    const input = JSON.stringify({
      summary: '数据相关性分析完成',
      findings: ['X与Y强相关(r=0.95)'],
      recommendations: ['建议增加样本量'],
      caveats: ['样本量较小'],
    })

    const result = parseConclusion(input)
    expect(result.summary).toBe('数据相关性分析完成')
    expect(result.findings).toHaveLength(1)
    expect(result.recommendations).toHaveLength(1)
    expect(result.caveats).toHaveLength(1)
  })

  it('处理带 code fence 的 JSON', () => {
    const input = '```json\n{"summary":"测试","findings":[],"recommendations":[],"caveats":[]}\n```'
    const result = parseConclusion(input)
    expect(result.summary).toBe('测试')
  })

  it('处理非 JSON 文本回退', () => {
    const input = '分析结果显示变量间存在显著相关性。'
    const result = parseConclusion(input)
    expect(result.summary).toContain('分析结果')
    expect(result.caveats).toHaveLength(1)
  })

  it('过滤非字符串的 findings', () => {
    const input = JSON.stringify({
      summary: '测试',
      findings: ['正确', 123, null],
      recommendations: [],
      caveats: [],
    })
    const result = parseConclusion(input)
    expect(result.findings).toEqual(['正确'])
  })
})
