import {
  getWorkflowMcpHealthSnapshot,
  handleWorkflowMcpRequest,
  isWorkflowMcpHealthRequest,
  isWorkflowMcpRequest,
} from '../opencode/workflowMcpServer.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'

export const createWorkflowMcpRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  if (context.method === 'GET' && isWorkflowMcpHealthRequest(context.pathname)) {
    context.sendJson(200, getWorkflowMcpHealthSnapshot())
    return true
  }

  if (isWorkflowMcpRequest(context.pathname)) {
    await handleWorkflowMcpRequest(context.request, context.response, {
      runtime: context.dependencies.workflowMcpRuntime,
      resolveStorageUser: context.dependencies.resolveStorageUser,
    })
    return true
  }

  return false
}
