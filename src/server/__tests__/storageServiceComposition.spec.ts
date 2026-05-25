import { describe, expect, it } from 'vitest'
import type {
  StorageExecutionRecordDto,
  StorageWorkflowDto,
  StorageWorkflowVersionDto,
} from '../../shared/contracts/storage.js'
import { createStorageCompositionRoot } from '../bootstrap/storageCompositionRoot.js'
import { createServerStorageApi, createServerStorageService } from '../storage.js'
import type {
  UserHistoryDocument,
  UserWorkflowDocument,
  WorkflowStorageRepository,
} from '../storageRepository.js'
import { encodeWorkflowHeaderValue } from '../../shared/workflowHeaderEncoding.js'

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const createInMemoryRepository = <
  TWorkflow,
  TVersion,
  THistoryRecord,
>(): WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord> => {
  const workflowStore = new Map<string, Map<string, UserWorkflowDocument<TWorkflow, TVersion>>>()
  const historyStore = new Map<string, UserHistoryDocument<THistoryRecord>>()

  const getUserWorkflowStore = (userId: string) => {
    const existing = workflowStore.get(userId)
    if (existing) return existing
    const next = new Map<string, UserWorkflowDocument<TWorkflow, TVersion>>()
    workflowStore.set(userId, next)
    return next
  }

  return {
    async listWorkflowDocuments(userId) {
      return [...getUserWorkflowStore(userId).values()].map((document) => cloneJson(document))
    },
    async readWorkflowDocument(userId, workflowId) {
      return cloneJson(
        getUserWorkflowStore(userId).get(workflowId) ?? {
          current: null,
          versions: [],
        },
      )
    },
    async writeWorkflowDocument(userId, workflowId, updater) {
      const userStore = getUserWorkflowStore(userId)
      const current = userStore.get(workflowId) ?? {
        current: null,
        versions: [],
      }
      const next = cloneJson(await updater(cloneJson(current)))
      userStore.set(workflowId, next)
      return cloneJson(next)
    },
    async deleteWorkflowDocument(userId, workflowId) {
      return getUserWorkflowStore(userId).delete(workflowId)
    },
    async readHistoryDocument(userId) {
      return cloneJson(historyStore.get(userId) ?? { records: [] })
    },
    async listHistoryRecordSummaries(userId) {
      const current = historyStore.get(userId) ?? { records: [] }
      return cloneJson((current.records as Array<any>).map((record) => ({
        id: record.id,
        workflowId: record.workflowId,
        workflowName: record.workflowName,
        startTime: record.startTime,
        duration: record.duration,
        status: record.status,
      })))
    },
    async readHistoryRecord(userId, recordId) {
      const current = historyStore.get(userId) ?? { records: [] }
      return cloneJson((current.records as Array<any>).find((record) => record.id === recordId) ?? null)
    },
    async writeHistoryDocument(userId, updater) {
      const current = historyStore.get(userId) ?? { records: [] }
      const next = cloneJson(await updater(cloneJson(current)))
      historyStore.set(userId, next)
      return cloneJson(next)
    },
  }
}

describe('server storage service composition', () => {
  it('creates isolated services when repository is injected explicitly', async () => {
    const repositoryA = createInMemoryRepository<
      StorageWorkflowDto,
      StorageWorkflowVersionDto<StorageWorkflowDto>,
      StorageExecutionRecordDto
    >()
    const repositoryB = createInMemoryRepository<
      StorageWorkflowDto,
      StorageWorkflowVersionDto<StorageWorkflowDto>,
      StorageExecutionRecordDto
    >()

    const serviceA = createServerStorageService({
      repository: repositoryA,
      now: () => 1700000000100,
      createWorkflowVersionId: () => 'wfver_a',
    })
    const serviceB = createServerStorageService({
      repository: repositoryB,
      now: () => 1700000000200,
      createWorkflowVersionId: () => 'wfver_b',
    })

    const workflowA: StorageWorkflowDto = {
      id: 'workflow_a',
      name: 'workflow a',
      updatedAt: 1700000000000,
      nodes: [],
      edges: [],
    }

    const version = await serviceA.saveUserWorkflow('user_1', workflowA)
    expect(version.id).toBe('wfver_a')
    expect(version.createdAt).toBe(1700000000100)

    expect(await serviceA.getUserWorkflows('user_1')).toHaveLength(1)
    expect(await serviceB.getUserWorkflows('user_1')).toEqual([])
  })

  it('does not fallback to built-in demo user when no user context is provided', () => {
    const repository = createInMemoryRepository<
      StorageWorkflowDto,
      StorageWorkflowVersionDto<StorageWorkflowDto>,
      StorageExecutionRecordDto
    >()
    const service = createServerStorageService({
      repository,
    })

    expect(() => service.resolveStorageUser({})).toThrow(/用户/i)
  })

  it('decodes browser-safe workflow user headers before resolving storage scope', () => {
    const repository = createInMemoryRepository<
      StorageWorkflowDto,
      StorageWorkflowVersionDto<StorageWorkflowDto>,
      StorageExecutionRecordDto
    >()
    const service = createServerStorageService({
      repository,
    })

    expect(
      service.resolveStorageUser({
        'x-workflow-user-id': encodeWorkflowHeaderValue('用户-1'),
        'x-workflow-user-name': encodeWorkflowHeaderValue('服务端用户'),
      }),
    ).toEqual({
      id: '用户-1',
      name: '服务端用户',
    })
  })

  it('wires repository dependency through storage composition root', async () => {
    const repository = createInMemoryRepository<
      StorageWorkflowDto,
      StorageWorkflowVersionDto<StorageWorkflowDto>,
      StorageExecutionRecordDto
    >()
    const root = createStorageCompositionRoot({
      repository,
      now: () => 1700000000300,
      createWorkflowVersionId: () => 'wfver_root',
    })

    const workflow: StorageWorkflowDto = {
      id: 'workflow_root',
      name: 'workflow root',
      updatedAt: 1700000000250,
      nodes: [],
      edges: [],
    }

    const version = await root.storageService.saveUserWorkflow('user_root', workflow)
    expect(version.id).toBe('wfver_root')

    const persisted = await repository.readWorkflowDocument('user_root', 'workflow_root')
    expect(persisted.current).toEqual(expect.objectContaining({ id: 'workflow_root' }))
  })

  it('does not expose mysql-only assert capability by default', () => {
    const repository = createInMemoryRepository<
      StorageWorkflowDto,
      StorageWorkflowVersionDto<StorageWorkflowDto>,
      StorageExecutionRecordDto
    >()
    const root = createStorageCompositionRoot({ repository })

    expect(root.assertStorageDatabaseExists).toBeUndefined()
  })

  it('binds storage service methods through explicit storage api injection', async () => {
    const repository = createInMemoryRepository<
      StorageWorkflowDto,
      StorageWorkflowVersionDto<StorageWorkflowDto>,
      StorageExecutionRecordDto
    >()
    const service = createServerStorageService({
      repository,
      now: () => 1700000000400,
      createWorkflowVersionId: () => 'wfver_configured',
    })
    const storageApi = createServerStorageApi(service)

    const workflow: StorageWorkflowDto = {
      id: 'workflow_configured',
      name: 'workflow configured',
      updatedAt: 1700000000390,
      nodes: [],
      edges: [],
    }
    const version = await service.saveUserWorkflow('user_configured', workflow)
    expect(version.id).toBe('wfver_configured')

    await expect(storageApi.getUserWorkflows('user_configured')).resolves.toEqual([
      expect.objectContaining({ id: 'workflow_configured' }),
    ])
  })
})
