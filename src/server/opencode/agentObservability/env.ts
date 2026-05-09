import { resolve } from 'node:path'

export const isAgentObservabilityEnabled = () => process.env.NODE_ENV === 'development'

export const getAgentObservabilityRootDir = () =>
  resolve(process.cwd(), '.workflow-debug', 'agent-observability')
