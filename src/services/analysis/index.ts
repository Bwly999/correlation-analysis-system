type AnalysisRequestBody = {
  data: Array<Record<string, unknown>>
  target: string
  config: Record<string, unknown>
}

const ANALYSIS_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const parseErrorPayload = async (response: Response) => {
  try {
    return await response.json()
  } catch {
    return { detail: '后端服务响应异常' }
  }
}

const postAnalysis = async <T>(path: string, body: AnalysisRequestBody): Promise<T> => {
  const response = await fetch(`${ANALYSIS_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await parseErrorPayload(response)
    throw new Error(errorData.detail || errorData.message || `后端请求失败: ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export const requestLassoAnalysis = <T>(body: AnalysisRequestBody) =>
  postAnalysis<T>('/analysis/lasso', body)

export const requestXgboostShapAnalysis = <T>(body: AnalysisRequestBody) =>
  postAnalysis<T>('/analysis/xgboost-shap', body)
