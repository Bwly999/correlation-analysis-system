import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const { generateWorkflowAiPlanMock, streamWorkflowAiPlanMock } = vi.hoisted(() => ({
  generateWorkflowAiPlanMock: vi.fn(),
  streamWorkflowAiPlanMock: vi.fn(),
}))

vi.mock('../workflowAi/profiles.js', () => ({
  generateWorkflowAiPlan: generateWorkflowAiPlanMock,
  streamWorkflowAiPlan: streamWorkflowAiPlanMock,
  getSystemModelProfiles: vi.fn(() => []),
  testWorkflowAiModelProfile: vi.fn(),
  toPublicModelProfile: vi.fn((profile) => profile),
}))

import { createServerHandler } from '../app.js'

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const createRequest = (method: string, url: string, body?: unknown) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from(payload ? [payload] : []) as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = {}
  return stream
}

const createResponse = () => {
  const headersMap: Record<string, string> = {}
  const response = {
    statusCode: 200,
    body: '',
    headersMap,
    setHeader(name: string, value: string) {
      headersMap[name] = value
      return this
    },
    write(chunk: string) {
      this.body += chunk ?? ''
      return true
    },
    end(chunk?: string) {
      this.body += chunk ?? ''
      return this
    },
  } as MockResponse

  return response
}

afterEach(() => {
  vi.restoreAllMocks()
  generateWorkflowAiPlanMock.mockReset()
  streamWorkflowAiPlanMock.mockReset()
})

describe('workflow ai routes', () => {
  it('returns diagnostics together with the generated plan', async () => {
    generateWorkflowAiPlanMock.mockResolvedValueOnce({
      plan: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
      },
      diagnostics: {
        status: 'success',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
        issues: [],
        rawOutputExcerpt: '{"summary":"已生成"}',
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/plan', {
        mode: 'create',
        prompt: '创建一个工作流',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      plan: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
      },
      diagnostics: expect.objectContaining({
        status: 'success',
      }),
    })
  })

  it('returns 422 with diagnostics when workflow ai generation fails with a typed planning error', async () => {
    const error = Object.assign(new Error('AI 计划校验失败'), {
      statusCode: 422,
      diagnostics: {
        status: 'failed',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'failed', stage: 'validate' }],
        issues: [{ stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' }],
        rawOutputExcerpt: '{"summary":"失败"}',
      },
    })
    generateWorkflowAiPlanMock.mockRejectedValueOnce(error)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/plan', {
        mode: 'create',
        prompt: '创建一个工作流',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(422)
    expect(JSON.parse(response.body)).toEqual({
      message: 'AI 计划校验失败',
      diagnostics: expect.objectContaining({
        status: 'failed',
        stage: 'validate',
        issues: [{ stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' }],
      }),
    })
  })

  it('streams workflow ai progress events from the dedicated stream route', async () => {
    streamWorkflowAiPlanMock.mockImplementationOnce(async (_body, emitEvent) => {
      emitEvent({ type: 'started', message: 'AI 编排已开始' })
      emitEvent({ type: 'text_delta', attempt: 1, delta: '{"summary":"流式输出"}' })
      emitEvent({
        type: 'completed',
        plan: {
          summary: '流式输出',
          assumptions: [],
          warnings: [],
          questions: [],
          operations: [],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
          rawOutputExcerpt: '{"summary":"流式输出"}',
        },
      })
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/plan/stream', {
        mode: 'create',
        prompt: '创建一个工作流',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.headersMap['Content-Type']).toContain('application/x-ndjson')
    const lines = response.body.trim().split('\n').map((line) => JSON.parse(line))
    expect(lines.map((line) => line.type)).toEqual(['started', 'text_delta', 'completed'])
    expect(lines[2].plan.summary).toBe('流式输出')
  })
})
