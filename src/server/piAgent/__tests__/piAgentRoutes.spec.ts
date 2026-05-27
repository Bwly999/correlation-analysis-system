import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  createPiAgentSessionMock,
  sendPiAgentMessageMock,
  subscribePiAgentEventsMock,
  getPiAgentSessionMock,
  resolvePiAgentToolResultMock,
  syncPiAgentCanvasMock,
  getSystemModelProfilesMock,
  testWorkflowAiModelProfileMock,
} = vi.hoisted(() => ({
  createPiAgentSessionMock: vi.fn(),
  sendPiAgentMessageMock: vi.fn(),
  subscribePiAgentEventsMock: vi.fn(),
  getPiAgentSessionMock: vi.fn(),
  resolvePiAgentToolResultMock: vi.fn(),
  syncPiAgentCanvasMock: vi.fn(),
  getSystemModelProfilesMock: vi.fn(),
  testWorkflowAiModelProfileMock: vi.fn(),
}))

vi.mock('../gateway.js', () => ({
  createPiAgentSession: createPiAgentSessionMock,
  sendPiAgentMessage: sendPiAgentMessageMock,
  subscribePiAgentEvents: subscribePiAgentEventsMock,
  getPiAgentSession: getPiAgentSessionMock,
  resolvePiAgentToolResult: resolvePiAgentToolResultMock,
  syncPiAgentCanvas: syncPiAgentCanvasMock,
}))

vi.mock('../modelProfiles.js', () => ({
  getSystemModelProfiles: getSystemModelProfilesMock,
  resolveModelProfile: vi.fn((profile) => profile),
  toPublicModelProfile: vi.fn((profile) => profile),
}))

vi.mock('../runtimeFactory.js', () => ({
  testPiAgentRuntimeProfile: testWorkflowAiModelProfileMock,
}))

import '../../http/fastify.js'
import { createPiAgentRoutes } from '../../modules/piAgentRoutes.js'

const apps: FastifyInstance[] = []

const createTestApp = async () => {
  const app = Fastify()
  app.decorate('serverDependencies', {
    resolveStorageUser: () => ({
      id: 'pi-agent-route-user',
      name: 'Pi Agent 路由测试用户',
    }),
  } as any)

  await app.register(createPiAgentRoutes())
  await app.ready()
  apps.push(app)
  return app
}

afterEach(async () => {
  vi.restoreAllMocks()
  createPiAgentSessionMock.mockReset()
  sendPiAgentMessageMock.mockReset()
  subscribePiAgentEventsMock.mockReset()
  getPiAgentSessionMock.mockReset()
  resolvePiAgentToolResultMock.mockReset()
  syncPiAgentCanvasMock.mockReset()
  getSystemModelProfilesMock.mockReset()
  testWorkflowAiModelProfileMock.mockReset()

  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

describe('piAgentRoutes', () => {
  it('returns system model profiles from the pi-agent namespace', async () => {
    getSystemModelProfilesMock.mockReturnValueOnce([
      {
        id: 'profile_1',
        name: '测试模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
    ])

    const app = await createTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/pi-agent/model-profiles',
      headers: {
        'x-workflow-user-id': 'pi-agent-route-user',
        'x-workflow-user-name': 'Pi Agent 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      profiles: [
        {
          id: 'profile_1',
          name: '测试模型',
          baseUrl: 'http://example.com',
          model: 'glm-4.7',
          enabled: true,
          source: 'system',
        },
      ],
    })
  })

  it('tests model profiles from the pi-agent namespace', async () => {
    testWorkflowAiModelProfileMock.mockResolvedValueOnce({
      success: true,
      message: '连接成功',
      latencyMs: 120,
    })

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/pi-agent/model-profiles/test',
      payload: {
        profile: {
          id: 'profile_1',
          name: '测试模型',
          baseUrl: 'http://example.com',
          model: 'glm-4.7',
          enabled: true,
          source: 'custom',
        },
      },
      headers: {
        'x-workflow-user-id': 'pi-agent-route-user',
        'x-workflow-user-name': 'Pi Agent 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(testWorkflowAiModelProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'profile_1',
        model: 'glm-4.7',
      }),
      expect.any(Function),
    )
    expect(response.json()).toEqual({
      success: true,
      message: '连接成功',
      latencyMs: 120,
    })
  })

  it('rejects unsafe session payloads that contain raw rows', async () => {
    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/pi-agent/sessions',
      payload: {
        mode: 'edit',
        prompt: '分析销量',
        profile: {
          id: 'profile_1',
          name: '测试模型',
          baseUrl: 'http://example.com',
          model: 'glm-4.7',
          enabled: true,
          source: 'custom',
        },
        nodeCatalog: [],
        dataSources: [
          {
            id: 'ds_1',
            kind: 'file',
            entryNodeType: 'file-import',
            label: '销售数据',
            schemaSummary: {
              nodeId: 'node_1',
              nodeLabel: '导入数据',
              resultKind: 'table',
              numericColumns: ['sales'],
              candidateTargetColumns: ['sales'],
              candidateFeatureColumns: ['price'],
              blockedReasons: [],
            },
            bindingPayload: {
              rows: [{ sales: 100 }],
            },
          },
        ],
      },
      headers: {
        'x-workflow-user-id': 'pi-agent-route-user',
        'x-workflow-user-name': 'Pi Agent 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      message: 'Pi Agent 会话不允许包含完整行数据，请仅传递摘要上下文',
    })
    expect(createPiAgentSessionMock).not.toHaveBeenCalled()
  })

  it('streams ndjson events from the pi agent namespace', async () => {
    getPiAgentSessionMock.mockReturnValueOnce({ sessionId: 'session_1' })
    subscribePiAgentEventsMock.mockImplementationOnce((_sessionId, write) => {
      write({ type: 'message', content: 'hello' })
      return undefined
    })

    const app = await createTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/pi-agent/sessions/session_1/events',
      headers: {
        'x-workflow-user-id': 'pi-agent-route-user',
        'x-workflow-user-name': 'Pi Agent 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/x-ndjson')
    expect(response.body).toBe('{"type":"message","content":"hello"}\n')
  })

  it('forwards canvas sync requests to the pi agent gateway', async () => {
    syncPiAgentCanvasMock.mockResolvedValueOnce({
      projection: {
        workflow: {
          workflowName: '当前画布',
          draftNodeCount: 1,
          draftEdgeCount: 0,
        },
      },
      syncSummary: '已同步当前画布，共 1 个节点、0 条连线',
    })

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/pi-agent/sessions/session_1/canvas-sync',
      payload: {
        workflowSnapshot: {
          name: '当前画布',
          nodes: [{ id: 'node_1', type: 'custom' }],
          edges: [],
        },
      },
      headers: {
        'x-workflow-user-id': 'pi-agent-route-user',
        'x-workflow-user-name': 'Pi Agent 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(syncPiAgentCanvasMock).toHaveBeenCalledWith({
      sessionId: 'session_1',
      workflowSnapshot: {
        name: '当前画布',
        nodes: [{ id: 'node_1', type: 'custom' }],
        edges: [],
      },
    })
  })

  it('returns 404 when canvas sync target session does not exist', async () => {
    syncPiAgentCanvasMock.mockRejectedValueOnce(new Error('未找到 Pi Agent 会话'))

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/pi-agent/sessions/missing/canvas-sync',
      payload: {
        workflowSnapshot: {
          name: '当前画布',
          nodes: [],
          edges: [],
        },
      },
      headers: {
        'x-workflow-user-id': 'pi-agent-route-user',
        'x-workflow-user-name': 'Pi Agent 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      message: '未找到 Pi Agent 会话',
    })
  })
})
