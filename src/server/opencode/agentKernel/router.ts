import type { AgentKernelIntent, RouteAgentIntentInput } from './types.js'

const includesAny = (value: string, terms: string[]) =>
  terms.some((term) => value.includes(term))

export const routeAgentIntent = (input: RouteAgentIntentInput): AgentKernelIntent => {
  const currentMessage = input.message.toLowerCase()
  const message = `${input.message} ${input.request.prompt}`.toLowerCase()
  const autonomy = input.autonomy

  if (
    autonomy === 'chat'
    && includesAny(currentMessage, ['是什么', '解释', '说明', '你好', '聊聊'])
    && !includesAny(currentMessage, ['自动分析', '完整分析', '生成报告', '执行', '修复'])
  ) {
    return {
      kind: 'chat',
      autonomy,
      skillName: 'general-chat',
      requiresToolLoop: false,
      reason: '当前消息是普通对话或概念解释',
    }
  }

  if (includesAny(message, ['失败', '报错', '调试', '修复', 'debug', 'repair'])) {
    return {
      kind: 'workflow_repair',
      autonomy,
      skillName: 'workflow-repair',
      requiresToolLoop: autonomy !== 'chat',
      reason: '用户请求调试或修复工作流',
    }
  }

  if (includesAny(message, ['报告', '结论', 'evidence', '证据', '总结'])) {
    const isAnalysis = includesAny(message, ['分析', '相关', '因子', '销量', '字段', '数据'])
    if (!isAnalysis) {
      return {
        kind: 'reporting',
        autonomy,
        skillName: 'reporting',
        requiresToolLoop: autonomy !== 'chat',
        reason: '用户请求基于结果生成报告',
      }
    }
  }

  if (includesAny(message, ['自动分析', '完整分析', '相关性', '多因子', '影响因素', '销量', '数据分析', '生成报告'])) {
    return {
      kind: autonomy === 'chat' ? 'analysis_advice' : 'agentic_analysis',
      autonomy,
      skillName: 'agentic-data-analysis',
      requiresToolLoop: autonomy !== 'chat',
      reason: '用户请求数据分析或自主分析流程',
    }
  }

  return {
    kind: 'chat',
    autonomy,
    skillName: 'general-chat',
    requiresToolLoop: false,
    reason: '普通对话或概念解释',
  }
}
