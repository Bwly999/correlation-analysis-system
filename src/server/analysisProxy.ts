import type { HttpRequestContext } from './http/types.js'

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

export type AnalysisProxyContext = Pick<HttpRequestContext, 'readJsonBody' | 'sendRaw'>

export const proxyAnalysisRequest = async (
  context: AnalysisProxyContext,
  route: AnalysisRouteKey,
) => {
  const body = await context.readJsonBody<unknown>()
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

  context.sendRaw(upstreamResponse.status, rawText, contentType || 'application/json; charset=utf-8')
}
