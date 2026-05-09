import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { loadEnv } from 'vite'
import { evaluateOpencodeGenericSmoke, type OpencodeGenericSmokeResult } from './core.js'

type SmokeOptions = {
  help: boolean
  debug: boolean
  baseUrl: string
  model: string
  userId: string
  timeoutMs: number
}

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
const DEFAULT_MODEL = 'glm-4.7'

const loadSmokeEnv = () => {
  if (!process.env.NODE_ENV?.trim()) {
    process.env.NODE_ENV = 'development'
  }

  const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')

  const mappings: Array<[target: string, source: string]> = [
    ['OPENCODE_GENERIC_API_KEY', 'OPENCODE_LIVE_API_KEY'],
    ['OPENCODE_GENERIC_BASE_URL', 'OPENCODE_LIVE_BASE_URL'],
    ['OPENCODE_GENERIC_MODEL', 'OPENCODE_LIVE_MODEL_ID'],
  ]

  for (const [target, source] of mappings) {
    if (!process.env[target]?.trim() && env[source]?.trim()) {
      process.env[target] = env[source].trim()
    }
  }

  if (!process.env.AGENT_E2E_LIVE?.trim() && env.AGENT_E2E_LIVE?.trim()) {
    process.env.AGENT_E2E_LIVE = env.AGENT_E2E_LIVE.trim()
  }
}

const parseArgs = (argv: string[]): SmokeOptions => {
  const options: SmokeOptions = {
    help: false,
    debug: process.env.OPENCODE_GENERIC_SMOKE_DEBUG === '1',
    baseUrl: process.env.OPENCODE_GENERIC_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.OPENCODE_GENERIC_MODEL?.trim() || DEFAULT_MODEL,
    userId: process.env.OPENCODE_GENERIC_USER_ID?.trim() || 'opencode_generic_smoke_user',
    timeoutMs: Number(process.env.OPENCODE_GENERIC_TIMEOUT_MS || '180000'),
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true
    if (arg === '--debug') options.debug = true
    if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length)
    if (arg.startsWith('--model=')) options.model = arg.slice('--model='.length)
    if (arg.startsWith('--user=')) options.userId = arg.slice('--user='.length)
    if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length))
  }

  return options
}

const printHelp = () => {
  console.log([
    'OpenCode Generic Smoke Test',
    '',
    '用法：',
    '  设置 OPENCODE_GENERIC_API_KEY 后运行：pnpm smoke:opencode-generic',
    '',
    '环境变量：',
    `  OPENCODE_GENERIC_BASE_URL   可选，默认 ${DEFAULT_BASE_URL}`,
    `  OPENCODE_GENERIC_MODEL      可选，默认 ${DEFAULT_MODEL}`,
    '  OPENCODE_GENERIC_API_KEY    必填，模型 API Key，脚本不会打印或写入该值',
    '  OPENCODE_GENERIC_USER_ID    可选，默认 opencode_generic_smoke_user',
    '  OPENCODE_GENERIC_TIMEOUT_MS 可选，默认 180000',
    '',
    '参数覆盖：',
    '  --base-url=<url> --model=<model> --user=<userId> --timeout-ms=<ms> --debug',
  ].join('\n'))
}

const logDebug = (options: SmokeOptions, message: string, details?: unknown) => {
  if (!options.debug) return
  console.error(JSON.stringify({
    scope: 'opencode-generic-smoke',
    message,
    ...(details === undefined ? {} : { details }),
  }))
}

const startServer = async () => {
  const { createServerHandler } = await import('../../src/server/app.js')
  return new Promise<{ server: Server, baseUrl: string, port: number }>((resolve, reject) => {
    const server = createServer(createServerHandler())
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('无法获取 smoke test 服务端口'))
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
    const timer = setTimeout(() => {
      server.closeAllConnections?.()
      resolve()
    }, 3000)
    server.closeAllConnections?.()
    server.close((error) => {
      clearTimeout(timer)
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

const fetchJson = async <T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`)
    }
    return JSON.parse(text) as T
  } finally {
    clearTimeout(timer)
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const summarizeSessionSnapshot = (payload: any) => ({
  session: payload?.session
    ? {
        id: payload.session.id,
        status: payload.session.status,
      }
    : null,
  projection: payload?.projection
    ? {
        analysisSummary: payload.projection.analysis?.summary,
        executionStatus: payload.projection.execution?.status,
        latestAction: payload.projection.execution?.latestAction,
        toolCalls: Array.isArray(payload.projection.execution?.toolCalls)
          ? payload.projection.execution.toolCalls.map((item: any) => ({
              toolName: item?.toolName,
              status: item?.status,
              summary: item?.summary,
            }))
          : [],
        error: payload.projection.error
          ? {
              message: payload.projection.error.message,
              detail: payload.projection.error.detail,
            }
          : null,
      }
    : null,
})

const fetchText = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`)
    }
    return text
  } finally {
    clearTimeout(timer)
  }
}

const summarizeActiveHandles = () =>
  ((process as any)._getActiveHandles?.() ?? [])
    .map((handle: any) => {
      const name = handle?.constructor?.name || typeof handle
      if (name === 'Socket') {
        return {
          type: name,
          localPort: handle.localPort,
          remotePort: handle.remotePort,
          destroyed: handle.destroyed,
        }
      }
      if (name === 'Server') {
        return {
          type: name,
          listening: typeof handle.listening === 'boolean' ? handle.listening : undefined,
        }
      }
      if (name === 'ChildProcess') {
        return {
          type: name,
          pid: handle.pid,
          killed: handle.killed,
        }
      }
      return { type: name }
    })

const run = async () => {
  loadSmokeEnv()
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const apiKey = process.env.OPENCODE_GENERIC_API_KEY?.trim()
  if (!apiKey) {
    printHelp()
    process.exitCode = 1
    return
  }

  const started = await startServer()
  const previousHost = process.env.WORKFLOW_AI_SERVER_HOST
  const previousPort = process.env.WORKFLOW_AI_SERVER_PORT
  process.env.WORKFLOW_AI_SERVER_HOST = '127.0.0.1'
  process.env.WORKFLOW_AI_SERVER_PORT = String(started.port)

  try {
    logDebug(options, 'started test server', {
      baseUrl: started.baseUrl,
      port: started.port,
    })

    const created = await fetchJson<{ session: { id: string } }>(
      `${started.baseUrl}/api/agent/sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workflow-user-id': options.userId,
        },
        body: JSON.stringify({
          mode: 'edit',
          prompt: '先读取当前工作流上下文和工具清单，再告诉我你接下来可以帮我做什么。',
          agentCapability: 'generic_read_write_lite',
          profile: {
            id: 'opencode-generic-smoke',
            name: 'OpenCode Generic Smoke',
            baseUrl: options.baseUrl,
            model: options.model,
            apiKey,
            enabled: true,
            source: 'custom',
          },
          workflowSnapshot: {
            name: 'OpenCode Generic Smoke 流程',
            nodes: [],
            edges: [],
          },
          contextHints: {
            schemaSummaries: [],
          },
          nodeCatalog: [],
        }),
      },
      options.timeoutMs,
    )

    logDebug(options, 'created agent session', {
      sessionId: created.session.id,
    })

    const messageResponse = await fetchJson<{
      session: { id: string, status: string }
      projection: {
        analysis: { summary: string }
        execution: {
          status: string
          latestAction: string
          toolCalls: Array<{ toolName: string }>
        }
      }
    }>(
      `${started.baseUrl}/api/agent/sessions/${created.session.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workflow-user-id': options.userId,
        },
        body: JSON.stringify({
          content: '请先调用至少一个 workflow MCP 工具，然后用中文告诉我当前你能协助哪些工作。',
          skillId: 'generic',
        }),
      },
      options.timeoutMs,
    )
    logDebug(options, 'message route returned', summarizeSessionSnapshot(messageResponse))

    let latest = messageResponse
    let lastStatusKey = `${latest.session.status}:${latest.projection.execution.status}:${latest.projection.execution.toolCalls.length}`
    const startedAt = Date.now()
    while (Date.now() - startedAt < options.timeoutMs) {
      if (latest.session.status === 'completed' && latest.projection.execution.status === 'completed') break
      await wait(1000)
      latest = await fetchJson(
        `${started.baseUrl}/api/agent/sessions/${created.session.id}`,
        {
          headers: {
            'x-workflow-user-id': options.userId,
          },
        },
        options.timeoutMs,
      )
      const nextStatusKey = `${latest.session.status}:${latest.projection.execution.status}:${latest.projection.execution.toolCalls.length}`
      if (nextStatusKey !== lastStatusKey) {
        lastStatusKey = nextStatusKey
        logDebug(options, 'session poll update', summarizeSessionSnapshot(latest))
      }
    }

    if (!(latest.session.status === 'completed' && latest.projection.execution.status === 'completed')) {
      const debugTraceText = await fetchText(
        `${started.baseUrl}/api/agent/sessions/${created.session.id}/debug-trace`,
        {
          headers: {
            'x-workflow-user-id': options.userId,
          },
        },
        options.timeoutMs,
      ).catch((error) => `debug trace unavailable: ${error instanceof Error ? error.message : String(error)}`)

      throw new Error(JSON.stringify({
        message: '等待通用 Agent 会话完成超时',
        latest: summarizeSessionSnapshot(latest),
        debugTrace: debugTraceText,
      }))
    }

    const report = evaluateOpencodeGenericSmoke(latest)
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    const report: OpencodeGenericSmokeResult = {
      ok: false,
      error: error instanceof Error ? error.message : 'OpenCode Generic Smoke Test 失败',
    }
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = 1
  } finally {
    const { disposeAllAgentRuntimes } = await import('../../src/server/opencode/gateway.js')
    await disposeAllAgentRuntimes()
    if (previousHost === undefined) delete process.env.WORKFLOW_AI_SERVER_HOST
    else process.env.WORKFLOW_AI_SERVER_HOST = previousHost
    if (previousPort === undefined) delete process.env.WORKFLOW_AI_SERVER_PORT
    else process.env.WORKFLOW_AI_SERVER_PORT = previousPort
    await closeServer(started.server)
    logDebug(options, 'active handles after cleanup', summarizeActiveHandles())
  }
}

void run().finally(() => {
  process.exit(process.exitCode ?? 0)
})
