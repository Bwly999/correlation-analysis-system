import { describe, it, expect } from 'vitest'
import { agentLoopTools, concludeAnalysisTool, requestAdditionalAnalysisTool } from '../toolRegistry.js'

describe('agentLoopTools', () => {
  it('包含 conclude_analysis 工具', () => {
    expect(agentLoopTools.conclude_analysis).toBeDefined()
  })

  it('包含 request_additional_analysis 工具', () => {
    expect(agentLoopTools.request_additional_analysis).toBeDefined()
  })

  it('conclude_analysis 的 execute 返回输入', async () => {
    const input = { summary: '分析完成', should_continue: false as const }
    const result = await concludeAnalysisTool.execute!(input, { toolCallId: 'test', messages: [] })
    expect(result).toEqual(input)
  })

  it('request_additional_analysis 的 execute 返回输入', async () => {
    const input = {
      reason: '需要更多数据',
      analysis_type: '相关性分析',
      should_continue: true as const,
    }
    const result = await requestAdditionalAnalysisTool.execute!(input, { toolCallId: 'test', messages: [] })
    expect(result).toEqual(input)
  })

  it('request_additional_analysis 支持 target_fields', async () => {
    const input = {
      reason: '需要分析更多字段',
      analysis_type: '特征筛选',
      target_fields: ['field_a', 'field_b'],
      should_continue: true as const,
    }
    const result = await requestAdditionalAnalysisTool.execute!(input, { toolCallId: 'test', messages: [] })
    expect(result).toEqual(input)
  })
})
