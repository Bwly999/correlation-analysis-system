import axios, { AxiosHeaders } from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { createWorkflowRequestHeaders } from '@/services/workflowRequestContext'

export const resolveApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL?.trim() || '/api'

export const httpClient = axios.create({
  adapter: 'fetch',
  baseURL: resolveApiBaseUrl(),
  validateStatus: () => true,
})

httpClient.interceptors.request.use((config) => {
  const normalizedHeaders = AxiosHeaders.from(config.headers)
  config.headers = AxiosHeaders.from(
    createWorkflowRequestHeaders(normalizedHeaders.toJSON() as Record<string, string>),
  )
  return config
})

httpClient.interceptors.response.use(
  (response) => {
    if (response.status >= 400) {
      console.warn(`[httpClient] ${response.config?.method?.toUpperCase()} ${response.config?.url} -> ${response.status}`, response.data)
    }
    return response
  },
  (error) => {
    console.error(`[httpClient] request failed: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.message)
    return Promise.reject(error)
  },
)

export type StreamRequestResponse = {
  status: number
  statusText: string
  headers: Record<string, unknown>
  data: ReadableStream<unknown> | null
}

export const requestStream = async (config: AxiosRequestConfig): Promise<StreamRequestResponse> => {
  const response = await httpClient.request<ReadableStream<Uint8Array>>({
    ...config,
    responseType: 'stream',
  })

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers as Record<string, unknown>,
    data: (response.data as ReadableStream<unknown> | undefined) ?? null,
  }
}
