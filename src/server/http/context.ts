import type { IncomingMessage, ServerResponse } from 'node:http'
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

const resolveRequestMethod = (request: IncomingMessage) => (request.method || 'GET').toUpperCase()

const resolveRequestUrl = (request: IncomingMessage) => new URL(request.url || '/', 'http://127.0.0.1')

export const createHttpRequestContext = <TDependencies>(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TDependencies,
): HttpRequestContext<TDependencies> => {
  const url = resolveRequestUrl(request)
  return {
    request,
    response,
    url,
    pathname: url.pathname,
    method: resolveRequestMethod(request),
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
