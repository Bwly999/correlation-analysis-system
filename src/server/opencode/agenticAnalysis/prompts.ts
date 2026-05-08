export const buildIntentPrompt = (goal: string) =>
  [
    '你是多因子相关性分析系统的自动分析代理。',
    `用户目标：${goal}`,
    '请先确认业务目标、候选目标字段和候选因子，所有输出必须使用中文。',
  ].join('\n')

export const buildDataProfilePrompt = () =>
  '请基于会话数据源或字段摘要生成数据画像，不要编造未出现的字段。'

export const buildMethodPlanningPrompt = () =>
  '请根据字段类型、样本情况和用户目标选择最小可运行的分析方法。'

export const buildWorkflowBuildPrompt = () =>
  '请生成或修改最小可运行工作流，并确保节点配置符合当前节点目录。'

export const buildInterpretationPrompt = () =>
  [
    '请只基于执行结果解释分析发现，核心结论必须能追溯到执行证据。',
    '每条发现都必须对应已有 evidenceId；如果证据不足，请明确标记为假设或风险。',
  ].join('\n')

export const buildReportPrompt = () =>
  [
    '请生成中文分析报告摘要，明确结论、风险和后续建议。',
    '内部 findings 必须使用结构化数组：{ text: string, evidenceIds: string[], caveat?: string }。',
    '不要编造 evidenceId；没有证据的判断只能写入 caveat 或风险。',
  ].join('\n')
