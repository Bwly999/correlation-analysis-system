import { MysqlWorkflowStorageRepository } from './mysqlStorageRepository.js'
import {
  LowDbWorkflowStorageRepository,
  type WorkflowStorageRepository,
} from './storageRepository.js'

const resolveStorageBackend = () => process.env.WORKFLOW_STORAGE_BACKEND?.trim().toLowerCase() || 'lowdb'

export const createWorkflowStorageRepository = <TWorkflow, TVersion, THistoryRecord>():
  WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord> => {
  const backend = resolveStorageBackend()

  if (backend === 'mysql') {
    return new MysqlWorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>()
  }

  return new LowDbWorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>()
}
