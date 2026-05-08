import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentMemoryStore } from '../agentMemoryStore.js'

let tempDir = ''

describe('agent memory store', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-memory-store-'))
  })

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('stores field semantics by user and workflow', () => {
    const store = createAgentMemoryStore({
      filePath: join(tempDir, 'memory.json'),
    })

    store.upsertMemory({
      userId: 'user_1',
      workflowId: 'workflow_sales',
      kind: 'field_semantics',
      content: {
        field: 'sales',
        role: 'target',
      },
    })

    expect(store.listMemories({
      userId: 'user_1',
      workflowId: 'workflow_sales',
      kind: 'field_semantics',
    })).toEqual([
      expect.objectContaining({
        userId: 'user_1',
        workflowId: 'workflow_sales',
        kind: 'field_semantics',
        content: {
          field: 'sales',
          role: 'target',
        },
      }),
    ])
  })

  it('returns recent method preferences first', () => {
    const store = createAgentMemoryStore({
      filePath: join(tempDir, 'memory.json'),
    })

    store.upsertMemory({
      userId: 'user_1',
      kind: 'method_preference',
      content: { method: 'Pearson 相关系数' },
      now: 100,
    })
    store.upsertMemory({
      userId: 'user_1',
      kind: 'method_preference',
      content: { method: '多元线性回归' },
      now: 200,
    })

    expect(store.listRecentPreferences('user_1')).toEqual([
      expect.objectContaining({
        content: { method: '多元线性回归' },
      }),
      expect.objectContaining({
        content: { method: 'Pearson 相关系数' },
      }),
    ])
  })

  it('isolates memories between users', () => {
    const store = createAgentMemoryStore({
      filePath: join(tempDir, 'memory.json'),
    })

    store.upsertMemory({
      userId: 'user_1',
      kind: 'analysis_finding',
      content: { summary: '用户 1 的结论' },
    })
    store.upsertMemory({
      userId: 'user_2',
      kind: 'analysis_finding',
      content: { summary: '用户 2 的结论' },
    })

    expect(store.listMemories({ userId: 'user_1' })).toHaveLength(1)
    expect(store.listMemories({ userId: 'user_1' })[0]?.content).toEqual({ summary: '用户 1 的结论' })
  })

  it('trims old memories by max items per user', () => {
    const store = createAgentMemoryStore({
      filePath: join(tempDir, 'memory.json'),
      maxItemsPerUser: 2,
    })

    store.upsertMemory({ userId: 'user_1', kind: 'analysis_finding', content: { index: 1 }, now: 100 })
    store.upsertMemory({ userId: 'user_1', kind: 'analysis_finding', content: { index: 2 }, now: 200 })
    store.upsertMemory({ userId: 'user_1', kind: 'analysis_finding', content: { index: 3 }, now: 300 })

    expect(store.listMemories({ userId: 'user_1' }).map((item) => item.content)).toEqual([
      { index: 3 },
      { index: 2 },
    ])
  })
})
