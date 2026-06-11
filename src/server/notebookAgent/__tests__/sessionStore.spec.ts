/**
 * notebookAgentSessionStore 单测。
 *
 * 与 piAgent sessionStore 同形但独立命名空间，存放：
 *   - sessionId
 *   - userId / origin
 *   - status
 *   - 已发的 messages
 *   - workspace 元信息（rowCount / columnCount / sourceLabel）
 *
 * 仅做最小单测：create / get / append / list；list 仅返回未删除会话的 id
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createNotebookSession,
  getNotebookSession,
  appendNotebookMessage,
  appendNotebookToolCall,
  updateNotebookToolCall,
  endNotebookSession,
  __resetNotebookSessionsForTest,
  type NotebookSessionInit,
} from '../sessionStore'

const init = (): NotebookSessionInit => ({
  userId: 'u-1',
  initialDataMeta: {
    sourceKind: 'canvas-node',
    sourceLabel: 'cleanup',
    rowCount: 100,
    columnCount: 4,
  },
  origin: 'http://localhost:5173',
})

describe('notebookAgent sessionStore', () => {
  beforeEach(() => {
    __resetNotebookSessionsForTest()
  })

  it('createNotebookSession 返回 record，含 sessionId', () => {
    const rec = createNotebookSession(init())
    expect(rec.sessionId).toMatch(/-/)
    expect(rec.userId).toBe('u-1')
    expect(rec.status).toBe('idle')
    expect(rec.initialDataMeta.rowCount).toBe(100)
  })

  it('getNotebookSession 通过 id 拿回同一对象', () => {
    const rec = createNotebookSession(init())
    expect(getNotebookSession(rec.sessionId)).toBe(rec)
  })

  it('appendNotebookMessage 追加消息', () => {
    const rec = createNotebookSession(init())
    appendNotebookMessage(rec.sessionId, {
      id: 'm-1',
      role: 'user',
      content: 'hello',
      status: 'completed',
      createdAt: Date.now(),
    })
    expect(rec.messages).toHaveLength(1)
    expect(rec.messages[0]?.content).toBe('hello')
  })

  it('appendNotebookToolCall + updateNotebookToolCall', () => {
    const rec = createNotebookSession(init())
    appendNotebookToolCall(rec.sessionId, {
      id: 'tc-1',
      toolName: 'fs_read',
      args: { path: 'reports/main.md' },
      status: 'running',
      startedAt: Date.now(),
    })
    expect(rec.toolCalls[0]?.status).toBe('running')
    updateNotebookToolCall(rec.sessionId, 'tc-1', {
      status: 'success',
      result: '# 报告',
      finishedAt: Date.now(),
    })
    expect(rec.toolCalls[0]?.status).toBe('success')
    expect(rec.toolCalls[0]?.result).toBe('# 报告')
  })

  it('endNotebookSession 标记 completed + 更新时间', () => {
    const rec = createNotebookSession(init())
    const before = rec.updatedAt
    endNotebookSession(rec.sessionId, 'completed')
    expect(rec.status).toBe('completed')
    expect(rec.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('未知 sessionId 时操作 silently no-op，不抛错', () => {
    expect(() => endNotebookSession('not-exist', 'completed')).not.toThrow()
    expect(() =>
      appendNotebookMessage('not-exist', {
        id: 'm',
        role: 'user',
        content: 'x',
        status: 'completed',
        createdAt: Date.now(),
      }),
    ).not.toThrow()
  })
})
