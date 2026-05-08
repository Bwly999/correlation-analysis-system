import type { AgentKernelSkill } from './types.js'

const AGENT_SKILLS: AgentKernelSkill[] = [
  {
    name: 'general-chat',
    description: '普通对话、概念解释和轻量问答，不主动进入完整分析工具闭环。',
    systemPrompt: [
      '你是多因子相关性分析系统中的普通对话助手。',
      '处理普通对话、概念解释和轻量建议时，直接用中文回答。',
      '不要为了普通对话调用写操作工具。',
    ].join('\n'),
    recommendedTools: [],
    guardrails: [
      '用户没有要求执行分析时不要主动修改工作流',
      '概念解释应清晰简洁',
    ],
    exitCriteria: [
      '已经直接回答用户问题',
    ],
  },
  {
    name: 'agentic-data-analysis',
    description: '数据画像、方法推荐、工作流搭建、执行验证、证据抽取和中文报告的完整分析 playbook。',
    systemPrompt: [
      '你是数据分析领域的 Agentic 分析代理。',
      '根据用户意图选择轻量回答、分析建议、完整自主分析或修复流程，不要把所有问题都强行套入固定流程。',
      '完整分析时优先完成：读取上下文、数据画像、方法推荐、最小工作流、校验、执行、调试、证据抽取、中文报告。',
      '核心结论必须引用 evidenceId；没有证据的判断只能作为假设、风险或建议。',
      '高风险操作必须请求用户确认。',
    ].join('\n'),
    recommendedTools: [
      'workflow_get_session_context',
      'workflow_list_data_sources',
      'workflow_get_data_source_schema',
      'workflow_profile_data_source',
      'workflow_recommend_methods',
      'workflow_search_nodes',
      'workflow_get_node',
      'workflow_get_node_options',
      'workflow_create_workflow',
      'workflow_update_partial_workflow',
      'workflow_validate_workflow',
      'workflow_test_workflow',
      'workflow_debug_node',
      'workflow_extract_result_evidence',
    ],
    guardrails: [
      '核心结论必须引用 evidenceId',
      '不编造字段、数据或执行结果',
      '优先最小可运行工作流',
      '删除节点、回滚版本、整包替换和低置信度修复必须请求确认',
    ],
    exitCriteria: [
      '已经得到成功执行记录或明确可解释的阻塞原因',
      '报告核心发现均绑定 evidenceId 或被标记为假设/风险',
      '风险与后续建议已用中文说明',
    ],
  },
  {
    name: 'workflow-repair',
    description: '针对失败工作流或失败节点执行调试、修复、校验和重跑。',
    systemPrompt: [
      '你是工作流修复代理。',
      '优先读取失败节点、执行记录和上游 trace。',
      '低风险配置修复可以继续推进；高风险结构变更必须请求用户确认。',
    ].join('\n'),
    recommendedTools: [
      'workflow_get_session_context',
      'workflow_get_workflow',
      'workflow_debug_node',
      'workflow_update_partial_workflow',
      'workflow_validate_workflow',
      'workflow_test_workflow',
    ],
    guardrails: [
      '不要静默删除节点或回滚版本',
      '每次修复后必须校验或重跑',
    ],
    exitCriteria: [
      '失败原因已定位',
      '修复后通过校验或已说明阻塞原因',
    ],
  },
  {
    name: 'reporting',
    description: '基于已有执行结果和证据生成中文分析报告。',
    systemPrompt: [
      '你是分析报告代理。',
      '只基于执行结果和 evidenceId 生成报告。',
      '没有证据的内容必须写入风险或建议。',
    ].join('\n'),
    recommendedTools: [
      'workflow_executions',
      'workflow_extract_result_evidence',
    ],
    guardrails: [
      '报告核心发现必须引用 evidenceId',
      '不要编造执行结果',
    ],
    exitCriteria: [
      '报告摘要、核心发现、风险和建议已生成',
    ],
  },
]

export const listAgentSkills = () => AGENT_SKILLS

export const getAgentSkillByName = (name: string) =>
  AGENT_SKILLS.find((skill) => skill.name === name) ?? null
