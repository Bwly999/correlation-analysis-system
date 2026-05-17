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

    expect(frontendNames).toEqual(
      expect.arrayContaining([
        'wf_addNode',
        'wf_connectNodes',
        'wf_updateNodeConfig',
        'wf_renameNode',
        'wf_removeNode',
        'wf_disconnectEdge',
        'wf_moveNode',
        'wf_executeWorkflow',
      ]),
    )
    expect(frontendNames).not.toContain('workflow_debug_node')
  })

  it('covers the expected server runtime workflow tools', () => {
    const runtimeNames = PI_WORKFLOW_TOOL_SPECS
      .filter((spec) => spec.target === 'server_runtime')
      .map((spec) => spec.name)

    expect(runtimeNames).toEqual(
      expect.arrayContaining([
        'workflow_get_session_context',
        'workflow_get_node_catalog',
        'workflow_list_data_sources',
        'workflow_get_data_source_schema',
        'workflow_search_nodes',
        'workflow_get_node',
        'workflow_get_node_options',
        'workflow_profile_data_source',
        'workflow_recommend_methods',
        'workflow_create_workflow',
        'workflow_get_workflow',
        'workflow_update_partial_workflow',
        'workflow_update_full_workflow',
        'workflow_validate_workflow',
        'workflow_executions',
        'workflow_list_workflow_versions',
        'workflow_get_workflow_version',
        'workflow_rollback_workflow_version',
        'workflow_get_execution_result',
        'workflow_extract_result_evidence',
      ]),
    )
  })

  it('routes execution-class workflow tools to the frontend canvas main path', () => {
    expect(getPiWorkflowToolSpec('workflow_debug_node')).toBeUndefined()
    expect(getPiWorkflowToolSpec('workflow_test_workflow')).toBeUndefined()
    expect(getPiWorkflowToolSpec('workflow_execute_plan')).toBeUndefined()
    expect(getPiWorkflowToolSpec('workflow_get_node_definition')).toBeUndefined()
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
