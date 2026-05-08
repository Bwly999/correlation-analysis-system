import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentWorkspace from '../../../components/agent/AgentWorkspace.vue'
import { useWorkflowAiStore } from '../../../stores/workflowAiStore.js'
import { useWorkflowStore } from '../../../stores/workflowStore.js'
import { evaluateDeepSeekAgenticSmoke } from '../../../../scripts/deepseek-agentic-smoke/core.js'
import type { AgentProjectionSnapshot, AgentSessionGetResponse } from '../../../ai/types.js'

const liveEnabled = process.env.AGENT_E2E_LIVE === '1'
const liveApiKey = process.env.OPENCODE_LIVE_API_KEY?.trim()
const liveModelId = process.env.OPENCODE_LIVE_MODEL_ID?.trim()
const liveBaseUrl = process.env.OPENCODE_LIVE_BASE_URL?.trim()
  || 'https://open.bigmodel.cn/api/coding/paas/v4'
const liveTimeoutMs = Number(process.env.AGENT_E2E_TIMEOUT_MS || '180000')

const requiredLiveEnv = {
  AGENT_E2E_LIVE: process.env.AGENT_E2E_LIVE,
  OPENCODE_LIVE_API_KEY: liveApiKey ? '<set>' : '',
  OPENCODE_LIVE_MODEL_ID: liveModelId,
}

type StartedServer = {
  server: Server
  baseUrl: string
  port: number
}

const dialogStub = {
  props: ['visible'],
  template: '<div v-if="visible" data-testid="dialog-stub"><slot name="header" /><slot /></div>',
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const containsChinese = (value: string) => /[\u4e00-\u9fa5]/.test(value)

const startTestServer = async (): Promise<StartedServer> => {
  const { createServerHandler } = await import('../../app.js')

  return new Promise<StartedServer>((resolve, reject) => {
    const server = createServer(createServerHandler())
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('无法获取 live E2E 测试服务端口'))
        return
      }

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
        port: (address as AddressInfo).port,
      })
    })
  })
}

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.()
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

const buildLiveFetch = (baseUrl: string, originalFetch: typeof fetch): typeof fetch =>
  ((input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const targetUrl = rawUrl.startsWith('/api/') ? `${baseUrl}${rawUrl}` : rawUrl

    if (typeof input === 'string' || input instanceof URL) {
      return originalFetch(targetUrl, init)
    }

    return originalFetch(new Request(targetUrl, input), init)
  }) as typeof fetch

const configureWorkflowContext = () => {
  const workflowStore = useWorkflowStore()
  workflowStore.workflowName = 'Agent Live E2E 销量诊断流程'
  workflowStore.nodes = [
    {
      id: 'sales_table',
      type: 'custom',
      label: '销量表',
      position: { x: 0, y: 0 },
      data: {
        label: '销量表',
        type: 'manual-json-import',
        category: 'trigger',
        status: 'idle',
        config: {
          data: [
            { price: 10, discount: 0.1, sales: 120 },
            { price: 12, discount: 0.08, sales: 135 },
            { price: 9, discount: 0.15, sales: 118 },
            { price: 14, discount: 0.05, sales: 150 },
          ],
        },
        output: {
          kind: 'table',
          payload: {
            rows: [
              { price: 10, discount: 0.1, sales: 120 },
              { price: 12, discount: 0.08, sales: 135 },
              { price: 9, discount: 0.15, sales: 118 },
              { price: 14, discount: 0.05, sales: 150 },
            ],
          },
          schema: {
            fields: [
              { name: 'price', type: 'number' },
              { name: 'discount', type: 'number' },
              { name: 'sales', type: 'number' },
            ],
          },
          meta: {
            rowCount: 4,
          },
        },
        logs: [],
      },
    },
  ] as any
  workflowStore.edges = []
  return workflowStore
}

const configureAgentProfile = () => {
  const aiStore = useWorkflowAiStore()
  aiStore.systemProfiles = [
    {
      id: 'live-agent-e2e',
      name: 'Live Agent E2E',
      baseUrl: liveBaseUrl,
      model: liveModelId || 'missing-live-model',
      apiKey: liveApiKey,
      enabled: true,
      source: 'custom',
    },
  ]
  aiStore.selectedProfileId = 'live-agent-e2e'
  aiStore.mode = 'edit'
  return aiStore
}

const mountWorkspace = () =>
  mount(AgentWorkspace, {
    props: {
      visible: true,
    },
    global: {
      stubs: {
        Dialog: dialogStub,
        Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
      },
    },
  })

const waitForProjectionCompletion = async (sessionId: string, baseUrl: string) => {
  const startedAt = Date.now()
  let latest: AgentSessionGetResponse | null = null

  while (Date.now() - startedAt < liveTimeoutMs) {
    const response = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}`, {
      headers: {
        'x-workflow-user-id': 'agent-live-e2e-user',
        'x-workflow-user-name': encodeURIComponent('Agent Live E2E 用户'),
      },
    })
    const text = await response.text()
    expect(response.ok, text).toBe(true)
    latest = JSON.parse(text) as AgentSessionGetResponse

    if (latest.session.status === 'failed' || latest.projection.execution.status === 'failed') {
      throw new Error(
        latest.projection.error?.detail
        || latest.projection.error?.message
        || 'Agent live E2E 执行失败',
      )
    }

    if (latest.session.status === 'completed' && latest.projection.execution.status === 'completed') {
      return latest
    }

    await wait(1000)
  }

  throw new Error(`等待 Agent live E2E 完成超时，最后状态：${latest?.session.status ?? 'unknown'}`)
}

const assertProjectionComplete = (projection: AgentProjectionSnapshot, session: AgentSessionGetResponse['session']) => {
  expect(session.status).not.toBe('failed')
  expect(projection.execution.status).not.toBe('failed')
  expect(projection.analysis.summary.trim().length).toBeGreaterThan(0)
  expect(containsChinese(projection.analysis.summary)).toBe(true)

  const smokeResult = evaluateDeepSeekAgenticSmoke({
    session: {
      id: session.id,
      status: session.status,
    },
    projection: {
      analysis: {
        summary: projection.analysis.summary,
      },
      execution: {
        status: projection.execution.status,
        latestAction: projection.execution.latestAction,
        toolCalls: projection.execution.toolCalls,
      },
    },
  })

  expect(smokeResult.ok, JSON.stringify(smokeResult, null, 2)).toBe(true)
}

describe('agent session live E2E', () => {
  const cleanups: Array<() => Promise<void>> = []
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = vi.fn()
    }
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
    while (cleanups.length > 0) {
      await cleanups.pop()?.()
    }
  })

  it('is disabled unless AGENT_E2E_LIVE is explicitly enabled', () => {
    if (liveEnabled) {
      expect(true).toBe(true)
      return
    }

    expect(requiredLiveEnv).toMatchObject({
      AGENT_E2E_LIVE: expect.not.stringMatching(/^1$/),
    })
  })

  it.skipIf(!liveEnabled)('requires live model credentials when explicitly enabled', () => {
    expect(
      {
        hasApiKey: Boolean(liveApiKey),
        hasModelId: Boolean(liveModelId),
      },
      `启用 AGENT_E2E_LIVE=1 后必须设置 OPENCODE_LIVE_API_KEY 和 OPENCODE_LIVE_MODEL_ID：${JSON.stringify(requiredLiveEnv)}`,
    ).toEqual({
      hasApiKey: true,
      hasModelId: true,
    })
  })

  it.skipIf(!liveEnabled || !liveApiKey || !liveModelId)(
    'runs from AgentWorkspace through real HTTP routes and converges with verifiable projection',
    async () => {
      const startedServer = await startTestServer()
      cleanups.push(() => closeServer(startedServer.server))

      const previousHost = process.env.WORKFLOW_AI_SERVER_HOST
      const previousPort = process.env.WORKFLOW_AI_SERVER_PORT
      process.env.WORKFLOW_AI_SERVER_HOST = '127.0.0.1'
      process.env.WORKFLOW_AI_SERVER_PORT = String(startedServer.port)
      cleanups.push(async () => {
        if (previousHost === undefined) {
          delete process.env.WORKFLOW_AI_SERVER_HOST
        } else {
          process.env.WORKFLOW_AI_SERVER_HOST = previousHost
        }

        if (previousPort === undefined) {
          delete process.env.WORKFLOW_AI_SERVER_PORT
        } else {
          process.env.WORKFLOW_AI_SERVER_PORT = previousPort
        }
      })

      globalThis.fetch = buildLiveFetch(startedServer.baseUrl, originalFetch)
      configureWorkflowContext()
      const aiStore = configureAgentProfile()
      const wrapper: VueWrapper = mountWorkspace()

      await wrapper.get('.agent-composer__input').setValue(
        '请自动分析价格、折扣对销量的影响，执行可验证工作流并生成带证据的中文结论。',
      )
      await wrapper.get('.agent-composer__submit').trigger('click')

      const sessionId = await vi.waitFor(() => {
        expect(aiStore.activeSession?.id).toBeTruthy()
        return aiStore.activeSession!.id
      }, {
        timeout: 30_000,
        interval: 500,
      })

      const completed = await waitForProjectionCompletion(sessionId, startedServer.baseUrl)
      aiStore.applyAgentEvent({
        type: 'projection.workflow.updated',
        projection: completed.projection.workflow,
      })
      aiStore.applyAgentEvent({
        type: 'projection.analysis.updated',
        projection: completed.projection.analysis,
      })
      aiStore.applyAgentEvent({
        type: 'projection.execution.updated',
        projection: completed.projection.execution,
      })

      await wrapper.vm.$nextTick()
      assertProjectionComplete(completed.projection, completed.session)

      const flowText = wrapper.get('[data-testid="agent-workspace-messages"]').text()
      expect(flowText).toContain('当前工作流草案')
      expect(flowText).toContain('当前分析状态')
      expect(flowText).toContain('最近执行动作')
      expect(completed.projection.execution.toolCalls.length).toBeGreaterThan(0)
      expect(flowText).toMatch(/读取|工具调用|执行|证据/)

      if (completed.projection.analysis.evidence?.length) {
        expect(flowText).toContain('证据')
      }
      if (completed.projection.analysis.report) {
        expect(flowText).toContain(completed.projection.analysis.report.title)
      }
    },
    liveTimeoutMs + 60_000,
  )
})
