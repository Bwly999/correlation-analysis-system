import type { ServerResponse } from 'node:http'
import { setCorsHeaders } from './cors.js'

export const sendJsonResponse = (response: ServerResponse, statusCode: number, payload: unknown) => {
  setCorsHeaders(response)
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

export const sendEmptyResponse = (response: ServerResponse, statusCode = 204) => {
  setCorsHeaders(response)
  response.statusCode = statusCode
  response.end()
}

export const sendRawResponse = (
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType = 'application/json; charset=utf-8',
) => {
  setCorsHeaders(response)
  response.statusCode = statusCode
  response.setHeader('Content-Type', contentType)
  response.end(body)
}

export const startNdjsonResponse = (response: ServerResponse, statusCode = 200) => {
  setCorsHeaders(response)
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
}

export const writeNdjsonEvent = (response: ServerResponse, event: unknown) => {
  response.write(`${JSON.stringify(event)}\n`)
}
