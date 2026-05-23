import { describe, expect, it, vi } from 'vitest'
import { buildHistoryRecordObjectKey, createHistoryRecordObjectKeyFactory } from '../historyObjectStorage.js'
import { deserializeHistoryDocument, serializeHistoryRecordRow } from '../storageDb/mysql/serialization.js'

describe('mysql history object storage', () => {
  it('builds nested object keys for execution history snapshots', () => {
    expect(
      buildHistoryRecordObjectKey({
        userId: 'user-a',
        workflowId: 'workflow-b',
        executionId: 'exec-c',
        snapshotTag: 'snapshot-1',
      }),
    ).toBe('analysis-workflow/history/user-a/workflow-b/exec-c/snapshot-1.json')
  })

  it('creates a snapshot-tag factory that can be injected for deterministic keys', () => {
    const factory = createHistoryRecordObjectKeyFactory(() => 'fixed-tag')

    expect(
      factory({
        userId: 'user-a',
        workflowId: 'workflow-b',
        executionId: 'exec-c',
      }),
    ).toBe('analysis-workflow/history/user-a/workflow-b/exec-c/fixed-tag.json')
  })

  it('hydrates history records from object storage and falls back to legacy json column', async () => {
    const loader = vi.fn(async (key: string) => {
      if (key === 'analysis-workflow/history/user-a/workflow-b/exec-c/snapshot-1.json') {
        return JSON.stringify({
          id: 'exec-c',
          workflowId: 'workflow-b',
          workflowName: '工作流 B',
          startTime: 100,
          duration: 20,
          status: 'success',
          nodes: [],
          edges: [],
        })
      }

      return null
    })

    const document = await deserializeHistoryDocument(
      [
        {
          recordObjectKey: 'analysis-workflow/history/user-a/workflow-b/exec-c/snapshot-1.json',
          recordJson: null,
        },
        {
          recordObjectKey: null,
          recordJson: JSON.stringify({
            id: 'exec-d',
            workflowId: 'workflow-b',
            workflowName: '工作流 B',
            startTime: 200,
            duration: 30,
            status: 'error',
            nodes: [],
            edges: [],
          }),
        },
      ],
      loader,
    )

    expect(loader).toHaveBeenCalledTimes(1)
    expect(document.records).toEqual([
      expect.objectContaining({ id: 'exec-c', workflowId: 'workflow-b', status: 'success' }),
      expect.objectContaining({ id: 'exec-d', workflowId: 'workflow-b', status: 'error' }),
    ])
  })

  it('serializes history rows with object keys instead of inline json payloads', () => {
    const record = {
      id: 'exec-c',
      workflowId: 'workflow-b',
      workflowName: '工作流 B',
      startTime: 100,
      duration: 20,
      status: 'success' as const,
      nodes: [],
      edges: [],
    }

    expect(serializeHistoryRecordRow('user-a', record, 'analysis-workflow/history/user-a/workflow-b/exec-c/snapshot-1.json')).toEqual({
      executionId: 'exec-c',
      userId: 'user-a',
      workflowId: 'workflow-b',
      workflowName: '工作流 B',
      startTimeMs: 100,
      durationMs: 20,
      status: 'success',
      recordObjectKey: 'analysis-workflow/history/user-a/workflow-b/exec-c/snapshot-1.json',
      recordJson: null,
    })
  })
})
