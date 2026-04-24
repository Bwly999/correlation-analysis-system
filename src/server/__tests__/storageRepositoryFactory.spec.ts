import { describe, expect, it, vi } from 'vitest'
import { createWorkflowStorageRepository } from '../storageRepositoryFactory.js'
import type { WorkflowStorageRepository } from '../storageRepository.js'

const createRepositoryStub = (kind: string): WorkflowStorageRepository<unknown, unknown, unknown> & { kind: string } => ({
  kind,
  listWorkflowDocuments: vi.fn(async () => []),
  readWorkflowDocument: vi.fn(async () => ({ current: null, versions: [] })),
  writeWorkflowDocument: vi.fn(async () => ({ current: null, versions: [] })),
  deleteWorkflowDocument: vi.fn(async () => false),
  readHistoryDocument: vi.fn(async () => ({ records: [] })),
  writeHistoryDocument: vi.fn(async () => ({ records: [] })),
})

describe('storage repository factory', () => {
  it('selects backend by injected dependency resolvers', () => {
    const lowDbRepository = createRepositoryStub('lowdb')
    const mysqlRepository = createRepositoryStub('mysql')

    const createLowDbRepository = vi.fn(() => lowDbRepository)
    const createMysqlRepository = vi.fn(() => mysqlRepository)

    const repository = createWorkflowStorageRepository({
      resolveStorageBackend: () => 'mysql',
      createLowDbRepository,
      createMysqlRepository,
    })

    expect(repository).toBe(mysqlRepository)
    expect(createMysqlRepository).toHaveBeenCalledTimes(1)
    expect(createLowDbRepository).not.toHaveBeenCalled()
  })

  it('fails fast when backend value is unsupported', () => {
    expect(() =>
      createWorkflowStorageRepository({
        resolveStorageBackend: () => 'redis',
      }))
      .toThrowError(/WORKFLOW_STORAGE_BACKEND/i)
  })
})
