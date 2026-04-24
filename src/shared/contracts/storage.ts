export type TransportWorkflowVersionSource = 'save' | 'rollback'

export type TransportExecutionStatus = 'success' | 'error' | 'stopped'

export interface StorageUserDto {
  id: string
  name?: string
}

export interface StorageWorkflowDto<TNode = unknown, TEdge = unknown> {
  id: string
  name: string
  updatedAt: number
  nodes: TNode[]
  edges: TEdge[]
}

export interface StorageWorkflowVersionDto<TWorkflow = StorageWorkflowDto> {
  id: string
  workflowId: string
  workflowName: string
  createdAt: number
  workflowUpdatedAt: number
  source: TransportWorkflowVersionSource
  workflow: TWorkflow
}

export interface StorageWorkflowVersionMetadataDto {
  id: string
  workflowId: string
  workflowName: string
  createdAt: number
  workflowUpdatedAt: number
  source: TransportWorkflowVersionSource
}

export interface StorageWorkflowRollbackResultDto<
  TWorkflow = StorageWorkflowDto,
  TVersion = StorageWorkflowVersionMetadataDto,
> {
  workflow: TWorkflow
  version: TVersion
}

export interface StorageExecutionRecordDto<TNode = unknown, TEdge = unknown> {
  id: string
  workflowId: string
  workflowName: string
  startTime: number
  duration: number
  status: TransportExecutionStatus
  nodes: TNode[]
  edges: TEdge[]
}

export interface StorageWorkflowDocumentDto<
  TWorkflow = StorageWorkflowDto,
  TVersion = StorageWorkflowVersionDto<TWorkflow>,
> {
  current: TWorkflow | null
  versions: TVersion[]
}

export interface StorageHistoryDocumentDto<
  THistoryRecord = StorageExecutionRecordDto,
> {
  records: THistoryRecord[]
}
