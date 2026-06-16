/**
 * notebookAgent systemPrompt 单测。
 *
 * 验收点：
 *   - 含工作循环 5 条骨架（grill / todo / 探索 / 报告 / 不确定问 ask_user）
 *   - 含执行规则（无状态 / artifacts / plt.savefig / fs_read 截断 / fs_edit 唯一）
 *   - 含强约束（中文输出 / 没有画布工具 / 不 monkey-patch）
 *   - 含 grill-me 风格 (含"刨根问底" 或 "interview me relentlessly" 关键词)
 *   - 含可用包列表 numpy/pandas/scipy/sklearn/matplotlib/statsmodels
 *   - 注入数据 meta 后应包含数据集信息
 */

import { describe, it, expect } from 'vitest'
import { buildNotebookSystemPrompt } from '../systemPrompt'

describe('notebookAgent systemPrompt', () => {
  const prompt = buildNotebookSystemPrompt({
    initialDataMeta: {
      sourceKind: 'canvas-node',
      sourceLabel: '数据清洗-2025Q2',
      rowCount: 12488,
      columnCount: 24,
    },
  })

  it('包含工作循环骨架', () => {
    expect(prompt).toMatch(/工作循环|工作流程/)
    expect(prompt).toMatch(/ask_user/)
    expect(prompt).toMatch(/todo_write/)
  })

  it('包含执行规则关键短语', () => {
    expect(prompt).toMatch(/无状态/)
    expect(prompt).toMatch(/artifacts\//)
    expect(prompt).toMatch(/plt\.savefig/)
    expect(prompt).toMatch(/fs_edit/)
  })

  it('包含强约束（中文 / 没有画布工具 / 不 monkey-patch）', () => {
    expect(prompt).toMatch(/中文/)
    expect(prompt).toMatch(/画布/)
    expect(prompt).toMatch(/monkey-patch|猴子补丁/)
  })

  it('包含 grill-me 风格指引', () => {
    expect(prompt).toMatch(/刨根问底|grill-me|interview/i)
  })

  it('包含完整可用包列表', () => {
    for (const pkg of [
      'numpy',
      'pandas',
      'scipy',
      'scikit-learn',
      'matplotlib',
      'statsmodels',
    ]) {
      expect(prompt).toMatch(new RegExp(pkg))
    }
  })

  it('包含数据集元信息（行数 / 列数 / 来源）', () => {
    expect(prompt).toMatch(/12488|12,488/)
    expect(prompt).toMatch(/24/)
    expect(prompt).toMatch(/数据清洗-2025Q2/)
  })
})
