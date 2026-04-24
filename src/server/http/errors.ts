import type { ServerResponse } from 'node:http'
import { sendJsonResponse } from './response.js'

const resolveErrorStatusCode = (error: unknown): number =>
  typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : 500

const resolveErrorDiagnostics = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'diagnostics' in error ? error.diagnostics : undefined

const resolveErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : '服务处理失败')

export const sendErrorResponse = (response: ServerResponse, error: unknown) => {
  const diagnostics = resolveErrorDiagnostics(error)
  sendJsonResponse(
    response,
    resolveErrorStatusCode(error),
    diagnostics
      ? {
          message: resolveErrorMessage(error),
          diagnostics,
        }
      : {
          message: resolveErrorMessage(error),
        },
  )
}
