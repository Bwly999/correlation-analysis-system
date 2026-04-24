import type { IncomingMessage, ServerResponse } from 'node:http'

export interface HttpRequestContext<TDependencies = unknown> {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  pathname: string
  method: string
  dependencies: TDependencies
  readJsonBody<T>(): Promise<T>
  sendJson(statusCode: number, payload: unknown): void
  sendNoContent(statusCode?: number): void
  sendRaw(statusCode: number, body: string, contentType?: string): void
  startNdjson(statusCode?: number): void
  writeNdjson(event: unknown): void
  sendError(error: unknown): void
}

export type HttpDomainHandler<TDependencies = unknown> = (
  context: HttpRequestContext<TDependencies>,
) => Promise<boolean> | boolean

export type HttpRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>
