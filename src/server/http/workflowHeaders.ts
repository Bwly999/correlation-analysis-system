export const WORKFLOW_USER_ID_HEADER = 'x-workflow-user-id'
export const WORKFLOW_USER_NAME_HEADER = 'x-workflow-user-name'
export const WORKFLOW_SESSION_ID_HEADER = 'x-workflow-session-id'

export type WorkflowRequestHeaders = Record<string, string | string[] | undefined>

export const resolveSingleHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}
