import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { loadEnv } from 'vite'
import { evaluateAgenticKernelSmoke, type AgenticKernelSmokeResult } from './core.js'
import { appendSmokeDebugLog, ensureSmokeArtifactDir, writeSmokeReport } from './artifacts.js'

type SmokeOptions = {
  help: boolean
  debug: boolean
  baseUrl: string
  model: string
  userId: string
  timeoutMs: number
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-flash'

const loadSmokeEnv = () => {
  if (!process.env.NODE_ENV?.trim()) {
    process.env.NODE_ENV = 'development'
  }

  const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')

  const mappings: Array<[target: string, source: string]> = [
    ['AGENTIC_KERNEL_API_KEY', 'OPENCODE_LIVE_API_KEY'],
    ['AGENTIC_KERNEL_BASE_URL', 'OPENCODE_LIVE_BASE_URL'],
    ['AGENTIC_KERNEL_MODEL', 'OPENCODE_LIVE_MODEL_ID'],
  ]

  for (const [target, source] of mappings) {
    if (!process.env[target]?.trim() && env[source]?.trim()) {
      process.env[target] = env[source].trim()
    }
  }
}

const parseArgs = (argv: string[]): SmokeOptions => {
  const options: SmokeOptions = {
    help: false,
    debug: process.env.AGENTIC_KERNEL_SMOKE_DEBUG === '1',
    baseUrl: process.env.AGENTIC_KERNEL_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.AGENTIC_KERNEL_MODEL?.trim() || DEFAULT_MODEL,
    userId: process.env.AGENTIC_KERNEL_USER_ID?.trim() || 'agentic_kernel_smoke_user',
    timeoutMs: Number(process.env.AGENTIC_KERNEL_TIMEOUT_MS || '180000'),
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
    'Agentic Kernel Smoke Test',
    '',
    '用法：',
    '  设置 OPENCODE_LIVE_API_KEY 后运行：pnpm smoke:agentic-kernel',
    '',
    '环境变量（从 .env.local 的 OPENCODE_LIVE_* 自动映射）：',
    `  AGENTIC_KERNEL_BASE_URL   可选，默认 ${DEFAULT_BASE_URL}`,
    `  AGENTIC_KERNEL_MODEL      可选，默认 ${DEFAULT_MODEL}`,
    '  AGENTIC_KERNEL_API_KEY    必填，模型 API Key',
    '  AGENTIC_KERNEL_TIMEOUT_MS 可选，默认 180000',
    '',
    '参数覆盖：',
    '  --base-url=<url> --model=<model> --user=<userId> --timeout-ms=<ms> --debug',
  ].join('\n'))
}

const logDebug = (options: SmokeOptions, message: string, details?: unknown) => {
  const payload = JSON.stringify({
    scope: 'agentic-kernel-smoke',
    message,
    ...(details === undefined ? {} : { details }),
  })
  void appendSmokeDebugLog(payload)
  if (!options.debug) return
  console.error(payload)
}

const startServer = async () => {
  const { createServerHandler } = await import('../../src/server/app.js')
  return new Promise<{ server: Server; baseUrl: string; port: number }>((resolve, reject) => {
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
      if (error) reject(error)
      else resolve()
    })
  })

const fetchJson = async <T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(text || `HTTP ${response.status}`)
    return JSON.parse(text) as T
  } finally {
    clearTimeout(timer)
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const SAMPLE_DATA_ROWS = [
  { price: 10, discount: 0.1, sales: 120 },
  { price: 12, discount: 0.08, sales: 135 },
  { price: 9, discount: 0.15, sales: 118 },
  { price: 14, discount: 0.05, sales: 150 },
  { price: 11, discount: 0.12, sales: 128 },
  { price: 8, discount: 0.2, sales: 105 },
]

const buildSessionRequest = (options: SmokeOptions, apiKey: string) => ({
  mode: 'edit',
  prompt: '请自动分析价格和折扣对销量的影响，执行完整分析流程。',
  agentCapability: 'generic_read_write_lite',
  profile: {
    id: 'agentic-kernel-smoke',
    name: 'Agentic Kernel Smoke',
    baseUrl: options.baseUrl,
    model: options.model,
    apiKey,
    enabled: true,
    source: 'custom',
  },
  workflowSnapshot: {
    name: 'Agentic Kernel Smoke 流程',
    nodes: [],
    edges: [],
  },
  dataSources: [
    {
      id: 'ds_sales_sample',
      name: '销量样本数据',
      type: 'inline',
      bindingPayload: {
        rows: SAMPLE_DATA_ROWS,
      },
      schema: {
        fields: [
          { name: 'price', type: 'number', displayName: '价格' },
          { name: 'discount', type: 'number', displayName: '折扣率' },
          { name: 'sales', type: 'number', displayName: '销量' },
        ],
      },
    },
  ],
  contextHints: {
    schemaSummaries: [
      {
        dataSourceId: 'ds_sales_sample',
        fields: ['price', 'discount', 'sales'],
        candidateTargets: ['sales'],
        candidateFactors: ['price', 'discount'],
      },
    ],
  },
  nodeCatalog: [],
})

const summarizeSessionSnapshot = (payload: any) => ({
  session: payload?.session
    ? { id: payload.session.id, status: payload.session.status }
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
            }))
          : [],
        error: payload.projection.error ?? null,
      }
    : null,
})

const run = async () => {
  loadSmokeEnv()
  await ensureSmokeArtifactDir()
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const apiKey = process.env.AGENTIC_KERNEL_API_KEY?.trim()
  if (!apiKey) {
    const report: AgenticKernelSmokeResult = {
      ok: false,
      error: '缺少 AGENTIC_KERNEL_API_KEY，无法执行 Agentic Kernel Smoke Test',
    }
    await appendSmokeDebugLog(JSON.stringify({
      scope: 'agentic-kernel-smoke',
      message: 'missing api key',
      details: {
        envName: 'AGENTIC_KERNEL_API_KEY',
      },
    }))
    await writeSmokeReport(report)
    printHelp()
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = 1
    return
  }

  const started = await startServer()
  const previousHost = process.env.WORKFLOW_AI_SERVER_HOST
  const previousPort = process.env.WORKFLOW_AI_SERVER_PORT
  process.env.WORKFLOW_AI_SERVER_HOST = '127.0.0.1'
  process.env.WORKFLOW_AI_SERVER_PORT = String(started.port)

  try {
    logDebug(options, 'started test server', { baseUrl: started.baseUrl, port: started.port })

    // 1. 创建 Agent 会话
    const created = await fetchJson<{ session: { id: string } }>(
      `${started.baseUrl}/api/agent/sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workflow-user-id': options.userId,
        },
        body: JSON.stringify(buildSessionRequest(options, apiKey)),
      },
      options.timeoutMs,
    )
    logDebug(options, 'created agent session', { sessionId: created.session.id })

    // 2. 通过通用消息路径触发分析（异步模式，不阻塞 HTTP）
    const messageResponse = await fetchJson<{
      session: { id: string; status: string }
      projection: any
    }>(
      `${started.baseUrl}/api/agent/sessions/${created.session.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workflow-user-id': options.userId,
        },
        body: JSON.stringify({
          content: '请自动分析价格和折扣对销量的影响，读取数据源画像和推荐方法后构建最小工作流并执行。',
          skillId: 'agentic-data-analysis',
        }),
      },
      options.timeoutMs,
    )
    logDebug(options, 'message route returned', summarizeSessionSnapshot(messageResponse))

    // 3. 轮询等待完成
    let latest = messageResponse
    let lastStatusKey = `${latest.session.status}:${latest.projection?.execution?.status}:${latest.projection?.execution?.toolCalls?.length ?? 0}`
    const startedAt = Date.now()
    while (Date.now() - startedAt < options.timeoutMs) {
      if (latest.session.status === 'completed' && latest.projection?.execution?.status === 'completed') break
      if (latest.session.status === 'failed') break
      await wait(1500)
      latest = await fetchJson(
        `${started.baseUrl}/api/agent/sessions/${created.session.id}`,
        { headers: { 'x-workflow-user-id': options.userId } },
        options.timeoutMs,
      )
      const nextStatusKey = `${latest.session.status}:${latest.projection?.execution?.status}:${latest.projection?.execution?.toolCalls?.length ?? 0}`
      if (nextStatusKey !== lastStatusKey) {
        lastStatusKey = nextStatusKey
        logDebug(options, 'session poll update', summarizeSessionSnapshot(latest))
      }
    }

    // 4. 评测
    const report = evaluateAgenticKernelSmoke(latest as any)
    await writeSmokeReport(report)
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    const report: AgenticKernelSmokeResult = {
      ok: false,
      error: error instanceof Error ? error.message : 'Agentic Kernel Smoke Test 失败',
    }
    await writeSmokeReport(report)
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
  }
}

void run().finally(() => {
  process.exit(process.exitCode ?? 0)
})
