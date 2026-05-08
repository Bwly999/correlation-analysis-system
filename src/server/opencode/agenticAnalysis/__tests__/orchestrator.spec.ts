import { describe, expect, it } from 'vitest'
import {
  AGENTIC_ANALYSIS_STAGE_ORDER,
  completeAgenticStage,
  createAgenticRunState,
  failAgenticStage,
  getNextAgenticStage,
  startAgenticStage,
} from '../types.js'
import { runAgenticAnalysis } from '../orchestrator.js'

const buildRequest = (overrides: Record<string, unknown> = {}) => ({
  mode: 'edit' as const,
  prompt: '分析价格和销量的关系',
  profile: {
    id: 'profile_1',
    name: '默认模型',
    baseUrl: 'http://example.com/v1',
    model: 'test-model',
    apiKey: 'secret',
    enabled: true,
    source: 'custom' as const,
  },
  contextHints: {
    schemaSummaries: [
      {
        nodeId: 'node_1',
        nodeLabel: '销量数据',
        resultKind: 'table' as const,
        numericColumns: ['price', 'sales'],
        candidateTargetColumns: ['sales'],
        candidateFeatureColumns: ['price'],
        blockedReasons: [],
      },
    ],
  },
  nodeCatalog: [],
  ...overrides,
})

describe('agentic analysis runtime state', () => {
  it('keeps the data analysis agent stages in the expected order', () => {
    expect(AGENTIC_ANALYSIS_STAGE_ORDER).toEqual([
      'intent',
      'data_profile',
      'method_planning',
      'workflow_build',
      'workflow_validation',
      'execution',
      'debugging',
      'interpretation',
      'reporting',
      'completed',
    ])
    expect(getNextAgenticStage('intent')).toBe('data_profile')
    expect(getNextAgenticStage('reporting')).toBe('completed')
    expect(getNextAgenticStage('completed')).toBeNull()
  })

  it('creates and records stage history for an agentic analysis run', () => {
    const run = createAgenticRunState({
      runId: 'run_1',
      sessionId: 'agent_1',
      goal: '分析价格和销量的关系',
      now: 100,
    })

    expect(run).toMatchObject({
      runId: 'run_1',
      sessionId: 'agent_1',
      stage: 'intent',
      goal: '分析价格和销量的关系',
      iteration: 0,
      maxIterations: 3,
      startedAt: 100,
      updatedAt: 100,
      stageHistory: [],
    })

    const started = startAgenticStage(run, 'data_profile', '开始读取数据画像', 110)
    expect(started.stage).toBe('data_profile')
    expect(started.stageHistory[started.stageHistory.length - 1]).toMatchObject({
      stage: 'data_profile',
      status: 'started',
      message: '开始读取数据画像',
      at: 110,
    })

    const completed = completeAgenticStage(started, '数据画像已完成', 120)
    expect(completed.stageHistory[completed.stageHistory.length - 1]).toMatchObject({
      stage: 'data_profile',
      status: 'completed',
      message: '数据画像已完成',
      at: 120,
    })

    const failed = failAgenticStage(completed, '执行失败', 130)
    expect(failed.stage).toBe('failed')
    expect(failed.stageHistory[failed.stageHistory.length - 1]).toMatchObject({
      stage: 'data_profile',
      status: 'failed',
      message: '执行失败',
      at: 130,
    })
  })

  it('waits for user input when no data source or schema summary is available', async () => {
    const events: any[] = []

    const result = await runAgenticAnalysis({
      sessionId: 'agent_1',
      message: '帮我分析价格和销量关系',
      request: buildRequest({
        contextHints: undefined,
        dataSources: [],
      }) as any,
      emitEvent: (event) => events.push(event),
      now: () => 100,
    })

    expect(result.run.stage).toBe('waiting_user')
    expect(events).toEqual([
      expect.objectContaining({
        type: 'agentic.stage.updated',
        run: expect.objectContaining({
          stage: 'waiting_user',
          message: '需要先提供可分析的数据源或字段摘要',
        }),
      }),
    ])
  })

  it('runs the MVP agentic stage chain when analysis context is available', async () => {
    const events: any[] = []
    let now = 100

    const result = await runAgenticAnalysis({
      sessionId: 'agent_1',
      message: '帮我分析价格和销量关系',
      request: buildRequest() as any,
      emitEvent: (event) => events.push(event),
      now: () => {
        now += 10
        return now
      },
    })

    expect(result.run.stage).toBe('completed')
    expect(result.run.stageHistory.map((item) => `${item.stage}:${item.status}`)).toEqual([
      'intent:started',
      'intent:completed',
      'data_profile:started',
      'data_profile:completed',
      'method_planning:started',
      'method_planning:completed',
      'workflow_build:started',
      'workflow_build:completed',
      'workflow_validation:started',
      'workflow_validation:completed',
      'execution:started',
      'execution:completed',
      'interpretation:started',
      'interpretation:completed',
      'reporting:started',
      'reporting:completed',
      'completed:started',
      'completed:completed',
    ])
    expect(events.map((event) => event.type)).toContain('agentic.stage.updated')
  })

  it('enters debugging and returns a repair plan when execution fails', async () => {
    const events: any[] = []

    const result = await runAgenticAnalysis({
      sessionId: 'agent_1',
      message: '帮我分析价格和销量关系',
      request: buildRequest() as any,
      emitEvent: (event) => events.push(event),
      stageRunner: async (stage) => {
        if (stage !== 'execution') return { ok: true }
        return {
          ok: false,
          failedNodeId: 'corr_1',
          nodeType: 'correlation-analysis',
          error: '缺少必填字段 targetColumn',
        }
      },
      now: () => 100,
    })

    expect(result.run.stage).toBe('debugging')
    expect(result.repairPlan).toMatchObject({
      confidence: 'medium',
      requiresUserConfirmation: false,
      summary: '尝试补齐节点 corr_1 的缺失配置',
    })
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'agentic.stage.updated',
          run: expect.objectContaining({
            stage: 'debugging',
            message: '正在根据失败节点生成修复计划',
          }),
        }),
      ]),
    )
  })
})
