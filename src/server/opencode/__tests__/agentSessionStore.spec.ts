import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildInitialProjection } from '../projection.js'
import {
  createAgentSessionRecord,
  getAgentSessionRecord,
  getAgentSessionStoreSnapshot,
} from '../agentSessionStore.js'

const buildAgentRequest = () => ({
  mode: 'create' as const,
  prompt: '请分析价格、折扣与销量之间的关系',
  profile: {
    id: 'custom-model',
    name: '自定义模型',
    baseUrl: 'http://example.com/v1',
    model: 'test-model',
    apiKey: 'test-key',
    enabled: true,
    source: 'custom' as const,
  },
  workflowSnapshot: {
    name: '销量诊断流程',
    nodes: [],
    edges: [],
  },
  contextHints: {
    schemaSummaries: [],
  },
  nodeCatalog: [],
})

describe('agent session store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T00:00:00.000Z'))
    process.env.AGENT_SESSION_TTL_MS = '1000'
  })

  it('evicts expired agent sessions before serving subsequent reads', () => {
    const request = buildAgentRequest()
    const projection = buildInitialProjection(request)
    const created = createAgentSessionRecord({
      request,
      projection,
      userId: 'user_1',
    })

    expect(getAgentSessionRecord(created.session.id)).not.toBeNull()

    vi.advanceTimersByTime(1001)

    expect(getAgentSessionRecord(created.session.id)).toBeNull()
    expect(getAgentSessionStoreSnapshot()).toMatchObject({
      activeSessions: 0,
      expiredSessionsCleaned: expect.any(Number),
    })
  })
})
