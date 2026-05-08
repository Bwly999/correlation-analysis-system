import { describe, expect, it } from 'vitest'
import { getAgentSkillByName } from '../skillRegistry.js'

describe('agent kernel skill registry', () => {
  it('describes the agentic data analysis playbook without hard-coding a single flow', () => {
    const skill = getAgentSkillByName('agentic-data-analysis')

    expect(skill).not.toBeNull()
    if (!skill) throw new Error('缺少 agentic-data-analysis skill')

    expect(skill).toMatchObject({
      name: 'agentic-data-analysis',
      recommendedTools: expect.arrayContaining([
        'workflow_profile_data_source',
        'workflow_recommend_methods',
        'workflow_validate_workflow',
        'workflow_test_workflow',
        'workflow_extract_result_evidence',
      ]),
      guardrails: expect.arrayContaining([
        '核心结论必须引用 evidenceId',
        '不编造字段、数据或执行结果',
      ]),
      exitCriteria: expect.arrayContaining([
        '已经得到成功执行记录或明确可解释的阻塞原因',
        '报告核心发现均绑定 evidenceId 或被标记为假设/风险',
      ]),
    })
    expect(skill.systemPrompt).toContain('根据用户意图选择轻量回答、分析建议、完整自主分析或修复流程')
  })

  it('keeps general chat skill free from write tools', () => {
    const skill = getAgentSkillByName('general-chat')

    expect(skill?.recommendedTools).toEqual([])
    expect(skill?.systemPrompt).toContain('普通对话')
  })
})
