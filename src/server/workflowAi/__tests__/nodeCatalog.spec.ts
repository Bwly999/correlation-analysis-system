import { describe, expect, it } from 'vitest'
import { buildServerWorkflowAiNodeCatalog } from '../nodeCatalog.js'

describe('buildServerWorkflowAiNodeCatalog', () => {
  it('builds a server-safe node catalog for benchmark and agent planning', () => {
    const catalog = buildServerWorkflowAiNodeCatalog()

    expect(catalog.length).toBeGreaterThan(0)
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'manual-json-import',
          displayName: '手动输入数据',
          category: 'trigger',
        }),
        expect.objectContaining({
          name: 'pearson',
          displayName: 'Pearson 相关系数',
          category: 'terminal',
        }),
        expect.objectContaining({
          name: 'field-selection',
          displayName: '字段选择',
          category: 'action',
        }),
      ]),
    )
  })
})
