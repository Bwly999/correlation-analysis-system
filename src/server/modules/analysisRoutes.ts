import type { AnalysisRouteKey } from '../analysisProxy.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'

const ANALYSIS_ROUTE_BY_PATH: Record<string, AnalysisRouteKey> = {
  '/api/analysis/lasso': 'lasso',
  '/api/analysis/multiple-linear-regression': 'multiple-linear-regression',
  '/api/analysis/random-forest-feature-importance': 'random-forest-feature-importance',
  '/api/analysis/logistic-regression-classification': 'logistic-regression-classification',
  '/api/analysis/xgboost-shap': 'xgboost-shap',
}

export const createAnalysisRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  if (context.method !== 'POST') return false
  const route = ANALYSIS_ROUTE_BY_PATH[context.pathname]
  if (!route) return false

  await context.dependencies.proxyAnalysisRequest(context, route)
  return true
}
