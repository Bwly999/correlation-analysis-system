import { MysqlWorkflowStorageRepository } from './mysqlStorageRepository.js'
import {
  LowDbWorkflowStorageRepository,
  type WorkflowStorageRepository,
} from './storageRepository.js'

export type WorkflowStorageBackend = 'lowdb' | 'mysql'

const resolveStorageBackendFromEnv = () => process.env.WORKFLOW_STORAGE_BACKEND?.trim().toLowerCase() || 'lowdb'

const normalizeStorageBackend = (backend: string): WorkflowStorageBackend => {
  if (backend === 'mysql') return 'mysql'
  if (backend === 'lowdb') return 'lowdb'
  throw new Error(
    `Invalid WORKFLOW_STORAGE_BACKEND value "${backend}". Supported values are: lowdb, mysql.`,
  )
}

export interface WorkflowStorageRepositoryFactoryDependencies<TWorkflow, TVersion, THistoryRecord> {
  resolveStorageBackend?: () => string
  createLowDbRepository?: () => WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>
  createMysqlRepository?: () => WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>
}

export const createWorkflowStorageRepository = <TWorkflow, TVersion, THistoryRecord>(
  dependencies: WorkflowStorageRepositoryFactoryDependencies<TWorkflow, TVersion, THistoryRecord> = {},
): WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord> => {
  const backend = normalizeStorageBackend(
    (dependencies.resolveStorageBackend ?? resolveStorageBackendFromEnv)(),
  )
  const createLowDbRepository = dependencies.createLowDbRepository
    ?? (() => new LowDbWorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>())
  const createMysqlRepository = dependencies.createMysqlRepository
    ?? (() => new MysqlWorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>())

  if (backend === 'mysql') return createMysqlRepository()

  return createLowDbRepository()
}
