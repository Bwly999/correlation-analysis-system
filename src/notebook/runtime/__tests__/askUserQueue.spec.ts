/**
 * askUserQueue 单测。
 *
 * ask_user 工具：暂停 Agent，向用户提问。
 *
 * 行为：
 *   - enqueue(question, options) 返回 promise + 把卡片塞进队列
 *   - resolve(toolCallId, answer) → 该 promise 完成
 *   - 多次 enqueue 形成队列，先入先 resolve
 *   - cancel() 时所有 pending reject
 */

import { describe, it, expect } from 'vitest'
import { createAskUserQueue } from '../askUserQueue'

describe('askUserQueue', () => {
  it('enqueue + resolve → promise 完成', async () => {
    const q = createAskUserQueue()
    const p = q.enqueue({
      toolCallId: 't-1',
      question: '是否进行 SMOTE？',
      header: '类不平衡',
      options: [
        { label: '是' },
        { label: '否' },
      ],
    })
    expect(q.peek()?.toolCallId).toBe('t-1')

    q.resolve('t-1', { answers: [{ label: '是', isCustom: false }] })
    const result = await p
    expect(result.answers[0]?.label).toBe('是')
    expect(q.peek()).toBeNull()
  })

  it('queue 顺序', async () => {
    const q = createAskUserQueue()
    const p1 = q.enqueue({ toolCallId: 'a', question: 'q1', header: 'h' })
    const p2 = q.enqueue({ toolCallId: 'b', question: 'q2', header: 'h' })
    q.resolve('a', { answers: [{ label: 'A', isCustom: false }] })
    q.resolve('b', { answers: [{ label: 'B', isCustom: false }] })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.answers[0]?.label).toBe('A')
    expect(r2.answers[0]?.label).toBe('B')
  })

  it('resolve 不存在的 toolCallId → 抛错', () => {
    const q = createAskUserQueue()
    expect(() => q.resolve('nope', { answers: [] })).toThrow(/未找到/)
  })

  it('cancel 时所有 pending reject', async () => {
    const q = createAskUserQueue()
    const p = q.enqueue({ toolCallId: 't-1', question: 'q', header: 'h' })
    q.cancelAll('用户关闭笔记本')
    await expect(p).rejects.toThrow(/关闭/)
  })

  it('size / list 正确', () => {
    const q = createAskUserQueue()
    q.enqueue({ toolCallId: 'a', question: 'q1', header: 'h' })
    q.enqueue({ toolCallId: 'b', question: 'q2', header: 'h' })
    expect(q.size()).toBe(2)
    expect(q.list().map((x) => x.toolCallId)).toEqual(['a', 'b'])
  })
})
