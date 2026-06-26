import type { FastifyReply } from 'fastify'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { WorkflowRequestUser } from './workflowUser.js'

declare module 'fastify' {
  interface FastifyInstance {
    serverDependencies: ServerDependencies
  }

  interface FastifyRequest {
    workflowUser?: WorkflowRequestUser
    apiCallStartTime?: number
  }
}

export interface AnalysisProxyReply {
  sendRaw(statusCode: number, body: string, contentType?: string): void
}

export const createAnalysisProxyReply = (
  reply: FastifyReply,
): AnalysisProxyReply => ({
  sendRaw(statusCode, body, contentType = 'application/json; charset=utf-8') {
    reply.code(statusCode)
    reply.header('Content-Type', contentType)
    reply.send(body)
  },
})
