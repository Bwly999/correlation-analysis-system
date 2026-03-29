import { describe, expect, it } from 'vitest'
import { searchWorkflowRecipes } from '../search'

describe('searchWorkflowRecipes', () => {
  it('prioritizes quick json demo recipes for minimal json analysis prompts', () => {
    const result = searchWorkflowRecipes({
      prompt: '导入一份 JSON 表格，快速演示 Pearson 相关分析，给我最小可运行流程。',
      mode: 'create',
    })

    expect(result[0]).toMatchObject({
      id: 'quick-json-demo',
    })
    expect(result[0]?.reason).toContain('JSON')
  })

  it('prioritizes multi-source merge analysis for merge-oriented prompts', () => {
    const result = searchWorkflowRecipes({
      prompt: '把两个来源的数据按 SN 合并后再做回归分析。',
      mode: 'create',
    })

    expect(result[0]).toMatchObject({
      id: 'multi-source-merge-analysis',
    })
    expect(result[0]?.reason).toContain('合并')
  })
})
