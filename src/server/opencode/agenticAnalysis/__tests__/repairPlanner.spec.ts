import { describe, expect, it } from 'vitest'
import { createRepairPlan, isHighRiskRepairOperation } from '../repairPlanner.js'

describe('agentic repair planner', () => {
  it('creates a low-risk config repair when a node reports a missing required field', () => {
    const repair = createRepairPlan({
      failedNodeId: 'corr_1',
      nodeType: 'correlation-analysis',
      error: '缺少必填字段 targetColumn',
      upstreamTrace: [],
    })

    expect(repair).toMatchObject({
      confidence: 'medium',
      requiresUserConfirmation: false,
      summary: '尝试补齐节点 corr_1 的缺失配置',
    })
    expect(repair.operations).toEqual([
      expect.objectContaining({
        type: 'updateNodeConfig',
        nodeRef: 'corr_1',
      }),
    ])
  })

  it('requires confirmation for destructive repair operations', () => {
    expect(isHighRiskRepairOperation({ id: 'op_1', type: 'removeNode', nodeRef: 'node_1' })).toBe(true)
    expect(isHighRiskRepairOperation({ id: 'op_2', type: 'disconnectEdge', edgeRef: 'edge_1' })).toBe(true)
    expect(isHighRiskRepairOperation({
      id: 'op_3',
      type: 'updateNodeConfig',
      nodeRef: 'node_1',
      config: {},
    })).toBe(false)
  })

  it('requires user confirmation when repair confidence is low', () => {
    const repair = createRepairPlan({
      failedNodeId: 'model_1',
      nodeType: 'unknown-node',
      error: '无法判断字段配置',
    })

    expect(repair.confidence).toBe('low')
    expect(repair.requiresUserConfirmation).toBe(true)
    expect(repair.operations).toEqual([])
  })
})
