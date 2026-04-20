import type { IncomingMessage, ServerResponse } from 'node:http'

const DEFAULT_PYTHON_ANALYSIS_API_BASE_URL = 'http://127.0.0.1:8000'

const ANALYSIS_ROUTE_MAP = {
  lasso: '/analyze/lasso',
  'multiple-linear-regression': '/analyze/multiple-linear-regression',
  'random-forest-feature-importance': '/analyze/random-forest-feature-importance',
  'xgboost-shap': '/analyze/xgboost-shap',
} as const

export type AnalysisRouteKey = keyof typeof ANALYSIS_ROUTE_MAP

const resolvePythonAnalysisApiBaseUrl = () =>
  (process.env.PYTHON_ANALYSIS_API_BASE_URL || DEFAULT_PYTHON_ANALYSIS_API_BASE_URL).replace(/\/$/, '')

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  return (raw ? JSON.parse(raw) : {}) as T
}

export const proxyAnalysisRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  route: AnalysisRouteKey,
  setCorsHeaders: (response: ServerResponse) => void,
) => {
  const body = await readJsonBody<unknown>(request)
  const targetUrl = `${resolvePythonAnalysisApiBaseUrl()}${ANALYSIS_ROUTE_MAP[route]}`

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    const proxyError = new Error('Python 分析服务不可用，请确认算法后端已启动') as Error & {
      statusCode: number
      diagnostics: { targetUrl: string; cause: string }
    }
    proxyError.statusCode = 502
    proxyError.diagnostics = {
      targetUrl,
      cause: error instanceof Error ? error.message : String(error),
    }
    throw proxyError
  }

  const rawText = await upstreamResponse.text()
  const contentType =
    typeof upstreamResponse.headers?.get === 'function'
      ? upstreamResponse.headers.get('content-type')
      : null

  setCorsHeaders(response)
  response.statusCode = upstreamResponse.status
  response.setHeader('Content-Type', contentType || 'application/json; charset=utf-8')
  response.end(rawText)
}
