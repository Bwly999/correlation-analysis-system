import type { AnalysisRouteKey } from '../analysisProxy.js'
import type { FastifyPluginAsync } from 'fastify'
import { createAnalysisProxyReply } from '../http/fastify.js'

const ANALYSIS_ROUTE_BY_PATH: Record<string, AnalysisRouteKey> = {
  '/api/analysis/lasso': 'lasso',
  '/api/analysis/multiple-linear-regression': 'multiple-linear-regression',
  '/api/analysis/random-forest-feature-importance': 'random-forest-feature-importance',
  '/api/analysis/logistic-regression-classification': 'logistic-regression-classification',
  '/api/analysis/xgboost-shap': 'xgboost-shap',
}

export const createAnalysisRoutes = (): FastifyPluginAsync => async (app) => {
  for (const [path, route] of Object.entries(ANALYSIS_ROUTE_BY_PATH)) {
    app.post(path, async (request, reply) => {
      await app.serverDependencies.proxyAnalysisRequest(
        {
          body: request.body,
          reply: createAnalysisProxyReply(reply),
        },
        route,
      )
    })
  }
}
