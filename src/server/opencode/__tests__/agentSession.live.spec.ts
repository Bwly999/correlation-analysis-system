import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const liveApiKey = process.env.OPENCODE_LIVE_API_KEY?.trim()
const liveModelId = process.env.OPENCODE_LIVE_MODEL_ID?.trim()
const liveBaseUrl = process.env.OPENCODE_LIVE_BASE_URL?.trim()
  || 'https://open.bigmodel.cn/api/coding/paas/v4'
const canRunLive = Boolean(liveApiKey && liveModelId) && process.platform !== 'win32'

describe('agent session live integration', () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.()
    }
  })

  it('is disabled unless live env is provided on a non-Windows host', () => {
    if (canRunLive) {
      expect(true).toBe(true)
      return
    }

    expect({
      hasApiKey: Boolean(liveApiKey),
      hasModelId: Boolean(liveModelId),
      platform: process.platform,
    }).toBeTruthy()
  })

  it.skipIf(!canRunLive)('runs a real agent session through HTTP routes and converges via event stream', async () => {
    const { createServerHandler } = await import('../../app.js')

    const startedServer = await new Promise<{ server: Server, baseUrl: string, port: number }>((resolve, reject) => {
      const server = createServer(createServerHandler())
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('无法获取测试服务端口'))
          return
        }

        resolve({
          server,
          baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
          port: (address as AddressInfo).port,
        })
      })
    })

    const previousHost = process.env.WORKFLOW_AI_SERVER_HOST
    const previousPort = process.env.WORKFLOW_AI_SERVER_PORT
    process.env.WORKFLOW_AI_SERVER_HOST = '127.0.0.1'
    process.env.WORKFLOW_AI_SERVER_PORT = String(startedServer.port)

    cleanups.push(
      () =>
        new Promise<void>((resolve, reject) => {
          startedServer.server.closeAllConnections?.()
          startedServer.server.close((error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          })
        }),
    )
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

    const createResponse = await fetch(`${startedServer.baseUrl}/api/agent/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'edit',
        prompt: '请结合当前工作流上下文，判断销量与价格、折扣之间是否值得优先分析，并给出下一步建议。',
        profile: {
          id: 'live-glm-4-7',
          name: 'Live GLM-4.7',
          baseUrl: liveBaseUrl,
          model: liveModelId,
          apiKey: liveApiKey,
          enabled: true,
          source: 'custom',
        },
        workflowSnapshot: {
          name: '销量诊断流程',
          nodes: [],
          edges: [],
        },
        contextHints: {
          schemaSummaries: [
            {
              nodeId: 'sales_table',
              nodeLabel: '销量表',
              resultKind: 'table',
              numericColumns: ['price', 'discount', 'sales'],
              candidateTargetColumns: ['sales'],
              candidateFeatureColumns: ['price', 'discount'],
              blockedReasons: [],
            },
          ],
        },
        nodeCatalog: [
          {
            name: 'manual-json-import',
            displayName: '手动输入数据',
            category: 'trigger',
            description: '手动输入 JSON 数据',
            inputMode: 'single',
            minInputs: 0,
            maxInputs: 0,
            allowedNextCategories: ['action'],
            properties: [],
            help: null,
            assistantHints: null,
          },
        ],
      }),
    })
    expect(createResponse.ok).toBe(true)
    const created = await createResponse.json() as { session: { id: string } }

    const eventResult = await new Promise<{
      eventTypes: string[]
      finalSession: Record<string, any> | null
      finalProjection: Record<string, any> | null
      finalMessage: Record<string, any> | null
    }>((resolve, reject) => {
      const controller = new AbortController()
      const timer = setTimeout(() => {
        controller.abort()
        reject(new Error('等待 live Agent 会话完成超时'))
      }, 90_000)

      void (async () => {
        try {
          const response = await fetch(`${startedServer.baseUrl}/api/agent/sessions/${created.session.id}/events`, {
            signal: controller.signal,
          })
          if (!response.ok) {
            throw new Error(`读取 Agent 事件流失败: ${response.status}`)
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('事件流缺少可读 body')
          }

          const decoder = new TextDecoder()
          const eventTypes: string[] = []
          let buffer = ''
          let finalSession: Record<string, any> | null = null
          let finalProjection: Record<string, any> | null = null
          let finalMessage: Record<string, any> | null = null
          let lastError = ''

          while (true) {
            const { done, value } = await reader.read()
            buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

            let newlineIndex = buffer.indexOf('\n')
            while (newlineIndex >= 0) {
              const line = buffer.slice(0, newlineIndex).trim()
              buffer = buffer.slice(newlineIndex + 1)

              if (line) {
                const event = JSON.parse(line) as Record<string, any>
                eventTypes.push(String(event.type))

                if (event.type === 'session.status.updated') {
                  finalSession = event.session
                  if (event.session?.status === 'failed') {
                    throw new Error(lastError || 'Live Agent 会话失败')
                  }
                }

                if (event.type === 'projection.analysis.updated') {
                  finalProjection = {
                    ...(finalProjection ?? {}),
                    analysis: event.projection,
                  }
                }

                if (event.type === 'projection.execution.updated') {
                  finalProjection = {
                    ...(finalProjection ?? {}),
                    execution: event.projection,
                  }
                }

                if (event.type === 'projection.workflow.updated') {
                  finalProjection = {
                    ...(finalProjection ?? {}),
                    workflow: event.projection,
                  }
                }

                if (event.type === 'projection.error.updated') {
                  lastError = event.projection?.detail || event.projection?.message || 'Live Agent 会话失败'
                }

                if (event.type === 'failed') {
                  throw new Error(event.message || lastError || 'Live Agent 会话失败')
                }

                if (event.type === 'message.completed') {
                  finalMessage = event.message
                  clearTimeout(timer)
                  controller.abort()
                  resolve({
                    eventTypes,
                    finalSession,
                    finalProjection,
                    finalMessage,
                  })
                  return
                }
              }

              newlineIndex = buffer.indexOf('\n')
            }

            if (done) {
              break
            }
          }

          clearTimeout(timer)
          reject(new Error(lastError || '事件流在完成前结束'))
        } catch (error) {
          clearTimeout(timer)
          reject(error)
        } finally {
          controller.abort()
        }
      })()
    })

    const messageResponse = await fetch(`${startedServer.baseUrl}/api/agent/sessions/${created.session.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: '继续分析，并结合可用字段给出最小可执行的工作流建议。',
      }),
    })
    const messageBodyText = await messageResponse.text()
    expect(messageResponse.ok, messageBodyText).toBe(true)
    const started = JSON.parse(messageBodyText) as {
      session: { status: string }
      projection: { execution: { status: string } }
      assistantMessage?: unknown
    }

    expect(started.session.status).toBe('running')
    expect(started.projection.execution.status).toBe('running')
    expect(started.assistantMessage).toBeUndefined()

    expect(eventResult.eventTypes).toContain('projection.execution.updated')
    expect(eventResult.eventTypes).toContain('message.completed')
    expect(eventResult.finalSession?.status).toBe('completed')
    expect(eventResult.finalProjection?.execution?.status).toBe('completed')
    expect(typeof eventResult.finalProjection?.analysis?.summary).toBe('string')
    expect(eventResult.finalProjection?.analysis?.summary.length).toBeGreaterThan(0)
    expect(eventResult.finalMessage?.role).toBe('assistant')
    expect(typeof eventResult.finalMessage?.content).toBe('string')
    expect(eventResult.finalMessage?.content.length).toBeGreaterThan(0)
  }, 120_000)
})
