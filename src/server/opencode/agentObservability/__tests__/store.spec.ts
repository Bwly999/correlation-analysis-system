import { existsSync, readFileSync, rmSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentProjectionSnapshot, WorkflowAiPlanRequest } from '../../../../ai/types.js'
import {
  appendAgentObservabilityEvent,
  getAgentObservabilityDebugFiles,
  getAgentObservabilityDebugHealth,
  getAgentObservabilityDebugReplay,
  getAgentObservabilityDebugTrace,
  initializeAgentObservabilityTrace,
  recordAgentObservabilityProjection,
} from '../store.js'

const buildRequest = (): WorkflowAiPlanRequest => ({
  mode: 'edit',
  prompt: '分析价格、折扣与销量的关系',
  profile: {
    id: 'profile_1',
    name: '测试模型',
    baseUrl: 'http://example.com/v1',
    model: 'test-model',
    apiKey: 'test-key',
    enabled: true,
    source: 'custom',
  },
  workflowSnapshot: {
    name: '销量诊断流程',
    nodes: [],
    edges: [],
  },
  nodeCatalog: [],
})

const buildProjection = (): AgentProjectionSnapshot => ({
  workflow: {
    workflowId: null,
    workflowName: '销量诊断流程',
    draftNodeCount: 0,
    draftEdgeCount: 0,
    draftSummary: '尚未生成工作流草案',
    versionCount: 0,
    latestVersionId: null,
    proposedPlan: null,
  },
  analysis: {
    goal: '分析价格、折扣与销量的关系',
    summary: '等待分析',
    candidateTargets: [],
    candidateFactors: [],
    methods: [],
    findings: [],
    risks: [],
    recommendations: [],
  },
  execution: {
    status: 'idle',
    latestAction: '等待开始',
    toolCalls: [],
    pendingApprovals: [],
  },
  canvasSync: {
    status: 'idle',
    message: '尚未同步',
  },
  error: null,
  updatedAt: Date.now(),
})

describe('agent observability store', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'development'
    const rootDir = `${process.cwd()}\\.workflow-debug`
    rmSync(rootDir, { recursive: true, force: true })
    const health = getAgentObservabilityDebugHealth()
    expect(health.enabled).toBe(true)
  })

  it('records lifecycle, tool, raw message, parse failure and projection snapshots with stable sequence ids', async () => {
    const sessionId = 'session_trace_1'
    const projection = buildProjection()

    initializeAgentObservabilityTrace({
      sessionId,
      request: buildRequest(),
      userId: 'user_1',
      session: {
        id: sessionId,
        mode: 'edit',
        prompt: '分析价格、折扣与销量的关系',
        status: 'idle',
        profile: {
          id: 'profile_1',
          name: '测试模型',
          model: 'test-model',
        },
        workflowId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      projection,
    })

    appendAgentObservabilityEvent(sessionId, {
      source: 'session-store',
      kind: 'session.lifecycle',
      summary: '会话开始运行',
      payload: {
        status: 'running',
      },
    })

    appendAgentObservabilityEvent(sessionId, {
      source: 'opencode-event-pump',
      kind: 'tool.call',
      summary: '读取分析上下文完成',
      payload: {
        toolCall: {
          id: 'tool_1',
          toolName: 'workflow_get_session_context',
          displayName: '读取分析上下文',
          status: 'success',
          summary: '读取分析上下文完成',
        },
      },
    })

    appendAgentObservabilityEvent(sessionId, {
      source: 'gateway',
      kind: 'message.raw',
      summary: '收到原始消息',
      payload: {
        rawMessage: {
          messageId: 'msg_1',
          role: 'assistant',
          timestamp: Date.now(),
          text: '建议先做相关性分析',
          parts: [],
        },
      },
    })

    appendAgentObservabilityEvent(sessionId, {
      source: 'gateway',
      kind: 'message.parse',
      summary: 'structured payload parse failed',
      payload: {
        parseFailure: {
          messageId: 'msg_1',
          reason: 'structured payload parse failed',
          timestamp: Date.now(),
        },
      },
    })

    const nextProjection: AgentProjectionSnapshot = {
      ...projection,
      analysis: {
        ...projection.analysis,
        summary: '已识别价格和折扣是候选因子',
        findings: ['价格和折扣值得优先验证'],
      },
      execution: {
        ...projection.execution,
        status: 'running',
        latestAction: '正在更新分析结论',
      },
      updatedAt: Date.now() + 1,
    }

    recordAgentObservabilityProjection(sessionId, projection, nextProjection)

    const trace = getAgentObservabilityDebugTrace(sessionId)
    expect(trace).not.toBeNull()
    expect(trace?.events.map((event: any) => event.seq)).toEqual(
      Array.from({ length: trace?.events.length ?? 0 }, (_, index) => index + 1),
    )
    expect(trace?.summary.eventCount).toBe(trace?.events.length)
    expect(trace?.rawMessages).toHaveLength(1)
    expect(trace?.parseFailures).toHaveLength(1)
    expect(trace?.projectionSnapshots.length).toBeGreaterThan(0)
    expect(trace?.summary.projectionSnapshotCount).toBe(trace?.projectionSnapshots.length)
    expect(existsSync(trace?.files.manifestFile || '')).toBe(true)
    expect(existsSync(trace?.files.eventsFile || '')).toBe(true)
    expect(existsSync(trace?.files.projectionSnapshotsFile || '')).toBe(true)
    expect(existsSync(trace?.files.rawMessagesFile || '')).toBe(true)

    const summaryPayload = JSON.parse(readFileSync(trace!.files.summaryFile, 'utf8'))
    expect(summaryPayload.eventCount).toBe(trace?.events.length)
  })

  it('writes failure.json and rebuilds replay state at the requested seq', async () => {
    const sessionId = 'session_trace_2'
    const projection = buildProjection()

    initializeAgentObservabilityTrace({
      sessionId,
      request: buildRequest(),
      userId: 'user_2',
      session: {
        id: sessionId,
        mode: 'edit',
        prompt: '分析价格、折扣与销量的关系',
        status: 'idle',
        profile: {
          id: 'profile_1',
          name: '测试模型',
          model: 'test-model',
        },
        workflowId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      projection,
    })

    const updatedProjection: AgentProjectionSnapshot = {
      ...projection,
      execution: {
        ...projection.execution,
        status: 'failed',
        latestAction: 'Agent Kernel 执行失败',
        lastFailure: '模型超时',
      },
      error: {
        message: '模型超时',
        detail: 'Agent Kernel 执行超时',
        occurredAt: Date.now(),
      },
      updatedAt: Date.now() + 10,
    }

    const snapshotEntry = recordAgentObservabilityProjection(sessionId, projection, updatedProjection)
    const replay = getAgentObservabilityDebugReplay(sessionId, snapshotEntry?.seq)
    const files = getAgentObservabilityDebugFiles(sessionId)

    expect(replay?.state.latestProjection?.execution.latestAction).toBe('Agent Kernel 执行失败')
    expect(replay?.state.latestError?.summary).toBe('模型超时')
    expect(replay?.replayMarkers.some((marker: any) => marker.seq === snapshotEntry?.seq)).toBe(true)
    expect(files?.failureFile).toBeTruthy()
    expect(existsSync(files?.failureFile || '')).toBe(true)

    const failurePayload = JSON.parse(readFileSync(files!.failureFile!, 'utf8'))
    expect(failurePayload.summary).toBe('模型超时')
  })
})
