import { describe, expect, it } from 'vitest'
import { evaluateDeepSeekAgenticSmoke } from '../core.js'

describe('DeepSeek agentic smoke evaluation', () => {
  it('passes only when agentic execution uses context, method, execution and evidence tools', () => {
    const result = evaluateDeepSeekAgenticSmoke({
      session: {
        id: 'agent_1',
        status: 'completed',
      },
      projection: {
        analysis: {
          summary: '已完成带证据的中文分析摘要。',
        },
        execution: {
          status: 'completed',
          latestAction: 'Agent Kernel 分析完成',
          toolCalls: [
            { toolName: 'workflow_get_session_context' },
            { toolName: 'workflow_recommend_methods' },
            { toolName: 'workflow_test_workflow' },
            { toolName: 'workflow_extract_result_evidence' },
          ],
        },
      },
    })

    expect(result).toMatchObject({
      ok: true,
      toolCallCount: 4,
    })
    expect(result.missingChecks).toBeUndefined()
  })

  it('fails when the run has no evidence extraction or Chinese summary', () => {
    const result = evaluateDeepSeekAgenticSmoke({
      session: {
        id: 'agent_1',
        status: 'running',
      },
      projection: {
        analysis: {
          summary: 'done',
        },
        execution: {
          status: 'running',
          latestAction: 'Agent Kernel 已启动',
          toolCalls: [
            { toolName: 'workflow_get_session_context' },
            { toolName: 'workflow_recommend_methods' },
            { toolName: 'workflow_test_workflow' },
          ],
        },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.missingChecks).toEqual(
      expect.arrayContaining([
        '缺少关键工具调用：workflow_extract_result_evidence',
        '分析摘要必须包含中文',
      ]),
    )
  })

  it('fails when execution status is failed even if tools were called', () => {
    const result = evaluateDeepSeekAgenticSmoke({
      session: {
        id: 'agent_1',
        status: 'failed',
      },
      projection: {
        analysis: {
          summary: '中文摘要',
        },
        execution: {
          status: 'failed',
          latestAction: 'Agent Kernel 执行失败',
          toolCalls: [
            { toolName: 'workflow_get_session_context' },
            { toolName: 'workflow_recommend_methods' },
            { toolName: 'workflow_test_workflow' },
            { toolName: 'workflow_extract_result_evidence' },
          ],
        },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.missingChecks).toContain('执行状态不能为 failed')
  })
})
