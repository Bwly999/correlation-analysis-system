/**
 * notebookTodoStore 单测。
 *
 * todo_write 工具的"全量覆盖"语义：
 *   - 调用 setItems(items) 整体替换列表
 *   - getItems() 返回当前全列表
 *   - getStats() 返回 total / inProgress / completed
 *   - 同一时刻 in_progress > 1 时 store 不报错（设计上 Agent 自我约束），
 *     但 getStats().inProgressGuardWarned 提示
 *   - reset() 清空
 */

import { describe, it, expect } from 'vitest'
import { createNotebookTodoStore } from '../notebookTodoStore'

describe('notebookTodoStore', () => {
  it('初始化为空', () => {
    const store = createNotebookTodoStore()
    expect(store.getItems()).toEqual([])
    expect(store.getStats()).toEqual({
      total: 0,
      inProgress: 0,
      completed: 0,
      inProgressGuardWarned: false,
    })
  })

  it('setItems 全量覆盖', () => {
    const store = createNotebookTodoStore()
    store.setItems([
      { title: '清洗数据', status: 'completed' },
      { title: '相关性分析', status: 'in_progress' },
      { title: '建模', status: 'pending' },
    ])
    expect(store.getItems()).toHaveLength(3)
    expect(store.getStats()).toMatchObject({
      total: 3,
      inProgress: 1,
      completed: 1,
      inProgressGuardWarned: false,
    })
  })

  it('多个 in_progress → guardWarned=true', () => {
    const store = createNotebookTodoStore()
    store.setItems([
      { title: 'a', status: 'in_progress' },
      { title: 'b', status: 'in_progress' },
    ])
    expect(store.getStats().inProgressGuardWarned).toBe(true)
  })

  it('reset 清空', () => {
    const store = createNotebookTodoStore()
    store.setItems([{ title: 'x', status: 'pending' }])
    store.reset()
    expect(store.getItems()).toEqual([])
  })

  it('title 长度 > 100 → 抛错', () => {
    const store = createNotebookTodoStore()
    expect(() =>
      store.setItems([{ title: 'x'.repeat(101), status: 'pending' }]),
    ).toThrow(/100/)
  })

  it('非法 status → 抛错', () => {
    const store = createNotebookTodoStore()
    expect(() =>
      store.setItems([
        { title: 't', status: 'invalid' as 'pending' | 'in_progress' | 'completed' },
      ]),
    ).toThrow(/status/)
  })
})
