import { describe, expect, it } from 'vitest'
import {
  PI_WORKFLOW_TOOL_SPECS,
  getPiWorkflowToolSpec,
} from '../../../shared/piWorkflowTools.js'

describe('Pi workflow tool registry', () => {
  it('covers the expected frontend canvas tools', () => {
    const frontendNames = PI_WORKFLOW_TOOL_SPECS
      .filter((spec) => spec.target === 'frontend_canvas')
      .map((spec) => spec.name)

    expect(frontendNames).toEqual([
      'workflow_update_partial_workflow',
      'wf_executeWorkflow',
    ])
    expect(frontendNames).not.toContain('wf_addNode')
    expect(frontendNames).not.toContain('wf_connectNodes')
    expect(frontendNames).not.toContain('workflow_debug_node')
  })

  it('covers the expected server runtime workflow tools', () => {
    const runtimeNames = PI_WORKFLOW_TOOL_SPECS
      .filter((spec) => spec.target === 'server_runtime')
      .map((spec) => spec.name)

    expect(runtimeNames).toEqual([
      'workflow_get_session_context',
      'workflow_get_node_catalog',
      'workflow_get_node',
    ])
    expect(runtimeNames).not.toContain('workflow_list_data_sources')
    expect(runtimeNames).not.toContain('workflow_search_nodes')
    expect(runtimeNames).not.toContain('workflow_get_execution_result')
  })

  it('routes execution-class workflow tools to the frontend canvas main path', () => {
    expect(getPiWorkflowToolSpec('workflow_debug_node')).toBeUndefined()
    expect(getPiWorkflowToolSpec('workflow_test_workflow')).toBeUndefined()
    expect(getPiWorkflowToolSpec('workflow_execute_plan')).toBeUndefined()
    expect(getPiWorkflowToolSpec('workflow_get_node_definition')).toBeUndefined()
    expect(getPiWorkflowToolSpec('workflow_workflow_versions')).toBeUndefined()
  })

  it('routes partial workflow updates to the frontend canvas main path', () => {
    expect(getPiWorkflowToolSpec('workflow_update_partial_workflow')).toMatchObject({
      name: 'workflow_update_partial_workflow',
      target: 'frontend_canvas',
      executorKey: 'updatePartialWorkflow',
      riskLevel: 'high',
    })
  })

  it('exposes lookup metadata for wf_executeWorkflow', () => {
    expect(getPiWorkflowToolSpec('wf_executeWorkflow')).toMatchObject({
      name: 'wf_executeWorkflow',
      target: 'frontend_canvas',
      executorKey: 'runWorkflow',
      riskLevel: 'medium',
    })
    expect(getPiWorkflowToolSpec('wf_executeWorkflow')?.inputSchema).toMatchObject({
      scope: "'workflow' | 'node'",
      nodeId: 'string?',
      mode: "'reuse_cached_upstream' | 'rerun_upstream'?",
    })
    expect(getPiWorkflowToolSpec('wf_executeWorkflow')?.inputSchema).not.toHaveProperty('includeUpstreamTrace')
  })
})
