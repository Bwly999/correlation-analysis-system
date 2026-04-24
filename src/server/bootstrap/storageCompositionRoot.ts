import { createWorkflowStorageRepository } from '../storageRepositoryFactory.js'
import {
  createServerStorageService,
  type ServerStorageRepository,
  type ServerStorageService,
  type ServerWorkflowVersion,
  type ServerExecutionRecord,
  type ServerSavedWorkflow,
} from '../storageService.js'

export interface StorageCompositionRoot {
  storageRepository: ServerStorageRepository
  storageService: ServerStorageService
  assertStorageDatabaseExists?: () => Promise<void>
}

export interface StorageCompositionRootDependencies {
  repository?: ServerStorageRepository
  createRepository?: () => ServerStorageRepository
  defaultUser?: Parameters<typeof createServerStorageService>[0]['defaultUser']
  now?: () => number
  createWorkflowVersionId?: () => string
  assertStorageDatabaseExists?: () => Promise<void>
}

const defaultCreateStorageRepository = () =>
  createWorkflowStorageRepository<
    ServerSavedWorkflow,
    ServerWorkflowVersion,
    ServerExecutionRecord
  >()

export const createStorageCompositionRoot = (
  dependencies: StorageCompositionRootDependencies = {},
): StorageCompositionRoot => {
  const createRepository = dependencies.createRepository ?? defaultCreateStorageRepository
  const storageRepository = dependencies.repository ?? createRepository()
  const storageService = createServerStorageService({
    repository: storageRepository,
    defaultUser: dependencies.defaultUser,
    now: dependencies.now,
    createWorkflowVersionId: dependencies.createWorkflowVersionId,
  })

  return {
    storageRepository,
    storageService,
    assertStorageDatabaseExists: dependencies.assertStorageDatabaseExists,
  }
}
