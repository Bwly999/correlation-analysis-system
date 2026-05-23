import {
  WORKFLOW_USER_ID_HEADER,
  WORKFLOW_USER_NAME_HEADER,
  resolveSingleHeaderValue,
  type WorkflowRequestHeaders,
} from './workflowHeaders.js'
import { decodeWorkflowHeaderValue } from '../../shared/workflowHeaderEncoding.js'

export interface WorkflowRequestUser {
  id: string
  name: string
}

const buildMissingWorkflowUserError = () => {
  const error = new Error(
    `缺少用户标识，请通过 ${WORKFLOW_USER_ID_HEADER} 请求头或 defaultUser 依赖注入提供用户`,
  )
  ;(error as Error & { statusCode: number }).statusCode = 400
  return error
}

export const isMissingWorkflowUserError = (error: unknown): boolean =>
  error instanceof Error
  && error.message.includes(`缺少用户标识，请通过 ${WORKFLOW_USER_ID_HEADER} 请求头或 defaultUser 依赖注入提供用户`)
  && 'statusCode' in error
  && error.statusCode === 400

export const resolveWorkflowUser = (
  headers: WorkflowRequestHeaders,
  defaultUser?: Partial<WorkflowRequestUser>,
): WorkflowRequestUser => {
  const id =
    decodeWorkflowHeaderValue(resolveSingleHeaderValue(headers[WORKFLOW_USER_ID_HEADER]))
    || defaultUser?.id
  if (!id) {
    throw buildMissingWorkflowUserError()
  }

  const name =
    decodeWorkflowHeaderValue(resolveSingleHeaderValue(headers[WORKFLOW_USER_NAME_HEADER]))
    || defaultUser?.name
    || '默认用户'

  return { id, name }
}

export const createWorkflowUserResolver = (
  defaultUser?: Partial<WorkflowRequestUser>,
) => (headers: WorkflowRequestHeaders): WorkflowRequestUser =>
  resolveWorkflowUser(headers, defaultUser)

export const requireWorkflowUser = <
  TContext extends {
    request: { headers: WorkflowRequestHeaders }
    dependencies: { resolveStorageUser: (headers: WorkflowRequestHeaders) => WorkflowRequestUser }
  },
>(
  context: TContext,
): WorkflowRequestUser => context.dependencies.resolveStorageUser(context.request.headers)
