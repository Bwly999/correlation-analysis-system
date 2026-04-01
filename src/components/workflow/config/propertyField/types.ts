import type { NodeProperty } from '@/nodes/types'

export interface PropertyFieldUpstreamFactor {
  name: string
  value: string
  dataType?: string
  nullable?: boolean
}

export interface PropertyFieldProps {
  prop: NodeProperty
  modelValue: unknown
  upstreamFactors: PropertyFieldUpstreamFactor[]
  configContext?: Record<string, unknown>
  nodeId?: string | null
  inputData?: unknown
}
