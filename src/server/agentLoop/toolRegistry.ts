import { tool } from 'ai'
import { z } from 'zod'

export const concludeAnalysisTool = tool({
  description: '分析已充分完成，生成结论并结束循环。当你认为当前分析结果已经能够回答用户问题时，调用此工具。',
  inputSchema: z.object({
    summary: z.string().describe('分析总结，用中文简述主要发现'),
    should_continue: z.literal(false).describe('固定为 false，表示不再继续分析'),
  }),
  execute: async (input) => input,
})

export const requestAdditionalAnalysisTool = tool({
  description: '当前分析结果不足以回答用户问题，需要追加分析步骤。当你认为还需要做进一步的分析才能回答用户问题时，调用此工具。',
  inputSchema: z.object({
    reason: z.string().describe('为什么需要追加分析，用中文说明'),
    analysis_type: z
      .string()
      .describe('建议追加的分析类型，例如"特征筛选"、"回归分析"、"相关性分析"等'),
    target_fields: z.array(z.string()).optional().describe('建议关注的目标字段'),
    should_continue: z.literal(true).describe('固定为 true，表示需要继续分析'),
  }),
  execute: async (input) => input,
})

export const agentLoopTools = {
  conclude_analysis: concludeAnalysisTool,
  request_additional_analysis: requestAdditionalAnalysisTool,
} as const
