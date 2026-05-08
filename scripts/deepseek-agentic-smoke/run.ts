import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { evaluateDeepSeekAgenticSmoke, type DeepSeekSmokeResult } from './core.js'

type SmokeOptions = {
  help: boolean
  baseUrl: string
  model: string
  userId: string
  timeoutMs: number
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-flash'

const parseArgs = (argv: string[]): SmokeOptions => {
  const options: SmokeOptions = {
    help: false,
    baseUrl: process.env.DEEPSEEK_AGENTIC_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.DEEPSEEK_AGENTIC_MODEL?.trim() || DEFAULT_MODEL,
    userId: process.env.DEEPSEEK_AGENTIC_USER_ID?.trim() || 'deepseek_smoke_user',
    timeoutMs: Number(process.env.DEEPSEEK_AGENTIC_TIMEOUT_MS || '180000'),
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true
    if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length)
    if (arg.startsWith('--model=')) options.model = arg.slice('--model='.length)
    if (arg.startsWith('--user=')) options.userId = arg.slice('--user='.length)
    if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length))
  }

  return options
}

const printHelp = () => {
  console.log([
    'DeepSeek Agentic Smoke Test',
    '',
    '用法：',
    '  设置 DEEPSEEK_AGENTIC_API_KEY 后运行：pnpm smoke:deepseek-agentic',
    '',
    '环境变量：',
    '  DEEPSEEK_AGENTIC_API_KEY   必填，DeepSeek API Key，脚本不会打印或写入该值',
    `  DEEPSEEK_AGENTIC_BASE_URL  可选，默认 ${DEFAULT_BASE_URL}`,
    `  DEEPSEEK_AGENTIC_MODEL     可选，默认 ${DEFAULT_MODEL}`,
    '  DEEPSEEK_AGENTIC_USER_ID   可选，默认 deepseek_smoke_user',
    '  DEEPSEEK_AGENTIC_TIMEOUT_MS 可选，默认 180000',
    '',
    '参数覆盖：',
    '  --base-url=<url> --model=<model> --user=<userId> --timeout-ms=<ms>',
  ].join('\n'))
}

const startServer = async () => {
  const { createServerHandler } = await import('../../server/app.js')
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
    server.closeAllConnections?.()
    server.close((error) => {
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

const run = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const apiKey = process.env.DEEPSEEK_AGENTIC_API_KEY?.trim()
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
          prompt: '请自动分析价格、折扣对销量的影响，执行可验证工作流并生成带证据的中文结论。',
          profile: {
            id: 'deepseek-agentic-smoke',
            name: 'DeepSeek Agentic Smoke',
            baseUrl: options.baseUrl,
            model: options.model,
            apiKey,
            enabled: true,
            source: 'custom',
          },
          workflowSnapshot: {
            name: 'DeepSeek Agentic Smoke 流程',
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
          nodeCatalog: [],
        }),
      },
      options.timeoutMs,
    )

    const result = await fetchJson<{
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
      `${started.baseUrl}/api/agent/sessions/${created.session.id}/agentic-run`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workflow-user-id': options.userId,
        },
        body: JSON.stringify({
          content: '请开始完整 agentic 分析，优先调用工作流上下文、方法推荐、执行验证和证据抽取工具。',
        }),
      },
      options.timeoutMs,
    )

    const report = evaluateDeepSeekAgenticSmoke(result)

    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    const report: DeepSeekSmokeResult = {
      ok: false,
      error: error instanceof Error ? error.message : 'DeepSeek Agentic Smoke Test 失败',
    }
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = 1
  } finally {
    if (previousHost === undefined) delete process.env.WORKFLOW_AI_SERVER_HOST
    else process.env.WORKFLOW_AI_SERVER_HOST = previousHost
    if (previousPort === undefined) delete process.env.WORKFLOW_AI_SERVER_PORT
    else process.env.WORKFLOW_AI_SERVER_PORT = previousPort
    await closeServer(started.server)
  }
}

void run()
