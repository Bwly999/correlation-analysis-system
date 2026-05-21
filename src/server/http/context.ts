import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readJsonBody } from './body.js'
import { sendErrorResponse } from './errors.js'
import {
  sendEmptyResponse,
  sendJsonResponse,
  sendRawResponse,
  startNdjsonResponse,
  writeNdjsonEvent,
} from './response.js'
import type { HttpRequestContext } from './types.js'
import type { WorkflowRequestUser } from './workflowUser.js'

const resolveRequestMethod = (request: IncomingMessage) => (request.method || 'GET').toUpperCase()

const resolveRequestUrl = (request: IncomingMessage) => new URL(request.url || '/', 'http://127.0.0.1')

export const createHttpRequestContext = <TDependencies>(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TDependencies,
  user?: WorkflowRequestUser,
): HttpRequestContext<TDependencies> => {
  const url = resolveRequestUrl(request)
  return {
    request,
    response,
    url,
    pathname: url.pathname,
    method: resolveRequestMethod(request),
    requestId: typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : randomUUID(),
    userId: user?.id,
    dependencies,
    readJsonBody: <T>() => readJsonBody<T>(request),
    sendJson: (statusCode, payload) => sendJsonResponse(response, statusCode, payload),
    sendNoContent: (statusCode = 204) => sendEmptyResponse(response, statusCode),
    sendRaw: (statusCode, body, contentType) => sendRawResponse(response, statusCode, body, contentType),
    startNdjson: (statusCode = 200) => startNdjsonResponse(response, statusCode),
    writeNdjson: (event) => writeNdjsonEvent(response, event),
    sendError: (error) => sendErrorResponse(response, error),
  }
}
