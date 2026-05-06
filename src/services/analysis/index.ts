import { createWorkflowApiAuthHeaders } from '@/services/apiAuth'
import {
  buildRequestErrorFromResponse,
  buildRequestErrorFromUnknown,
} from '@/utils/requestError'

type AnalysisRequestBody = {
  data: Array<Record<string, unknown>>
  target: string
  config: Record<string, unknown>
}

const ANALYSIS_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const postAnalysis = async <T>(path: string, body: AnalysisRequestBody): Promise<T> => {
  let response: Response
  try {
    response = await fetch(`${ANALYSIS_API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createWorkflowApiAuthHeaders(),
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw buildRequestErrorFromUnknown(error, {
      fallbackMessage: '后端服务响应异常',
      networkErrorMessage: '分析服务请求失败，请确认本地 Node 开发服务与 Python 算法服务均已启动',
    })
  }

  if (!response.ok) {
    throw await buildRequestErrorFromResponse(response, {
      fallbackMessage: '后端服务响应异常',
    })
  }

  return response.json() as Promise<T>
}

export const requestLassoAnalysis = <T>(body: AnalysisRequestBody) =>
  postAnalysis<T>('/analysis/lasso', body)

export const requestMultipleLinearRegressionAnalysis = <T>(body: AnalysisRequestBody) =>
  postAnalysis<T>('/analysis/multiple-linear-regression', body)

export const requestRandomForestFeatureImportanceAnalysis = <T>(body: AnalysisRequestBody) =>
  postAnalysis<T>('/analysis/random-forest-feature-importance', body)

export const requestXgboostShapAnalysis = <T>(body: AnalysisRequestBody) =>
  postAnalysis<T>('/analysis/xgboost-shap', body)

export const requestLogisticRegressionClassificationAnalysis = <T>(body: AnalysisRequestBody) =>
  postAnalysis<T>('/analysis/logistic-regression-classification', body)
