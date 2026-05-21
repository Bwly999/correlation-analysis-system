import { describe, expect, it } from 'vitest'
import {
  deserializeHistoryDocument,
  deserializeWorkflowDocument,
  serializeHistoryRecordRow,
  serializeWorkflowCurrentRow,
  serializeWorkflowVersionRow,
} from '../storageDb/mysql/serialization.js'

describe('mysql storage serialization', () => {
  it('serializes workflow current and versions into row payloads', () => {
    const workflow = {
      id: 'wf_1',
      name: '工作流 A',
      updatedAt: 123,
      nodes: [{ id: 'n1' }],
      edges: [],
    }
    const version = {
      id: 'ver_1',
      workflowId: 'wf_1',
      workflowName: '工作流 A',
      createdAt: 456,
      workflowUpdatedAt: 123,
      source: 'save' as const,
      workflow,
    }

    expect(serializeWorkflowCurrentRow('user-a', workflow)).toEqual({
      userId: 'user-a',
      workflowId: 'wf_1',
      workflowName: '工作流 A',
      updatedAtMs: 123,
      currentWorkflowJson: JSON.stringify(workflow),
    })

    expect(serializeWorkflowVersionRow('user-a', version)).toEqual({
      versionId: 'ver_1',
      userId: 'user-a',
      workflowId: 'wf_1',
      workflowName: '工作流 A',
      createdAtMs: 456,
      workflowUpdatedAtMs: 123,
      source: 'save',
      workflowJson: JSON.stringify(version),
    })
  })

  it('deserializes workflow and history documents from row payloads', async () => {
    const workflow = {
      id: 'wf_2',
      name: '工作流 B',
      updatedAt: 321,
      nodes: [{ id: 'n2' }],
      edges: [],
    }
    const version = {
      id: 'ver_2',
      workflowId: 'wf_2',
      workflowName: '工作流 B',
      createdAt: 654,
      workflowUpdatedAt: 321,
      source: 'rollback' as const,
      workflow,
    }
    const record = {
      id: 'exec_1',
      workflowId: 'wf_2',
      workflowName: '工作流 B',
      startTime: 999,
      duration: 50,
      status: 'success' as const,
      nodes: [],
      edges: [],
    }

    expect(
      deserializeWorkflowDocument(
        {
          currentWorkflowJson: JSON.stringify(workflow),
        },
        [{ workflowJson: JSON.stringify(version) }],
      ),
    ).toEqual({
      current: workflow,
      versions: [version],
    })

    await expect(
      deserializeHistoryDocument([
        { recordJson: JSON.stringify(record), recordObjectKey: null },
      ]),
    ).resolves.toEqual({
      records: [record],
    })

    expect(serializeHistoryRecordRow('user-b', record, null)).toEqual({
      executionId: 'exec_1',
      userId: 'user-b',
      workflowId: 'wf_2',
      workflowName: '工作流 B',
      startTimeMs: 999,
      durationMs: 50,
      status: 'success',
      recordObjectKey: null,
      recordJson: JSON.stringify(record),
    })
  })
})
