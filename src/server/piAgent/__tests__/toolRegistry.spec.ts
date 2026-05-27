import { describe, expect, it } from 'vitest'
import {
  PI_WORKFLOW_TOOL_SPECS,
  getPiWorkflowToolSpec,
} from '../../../shared/piWorkflowTools.js'
import { createSharedRuntimeTools, sharedRuntimeToolFactories } from '../tools/sharedRuntimeTools.js'
import { createAtomicWorkflowTools } from '../tools/atomicWorkflowTools.js'
import { createFrontendBridgeTools } from '../tools/frontendBridgeTools.js'
import { FrontendBridge } from '../frontendBridge.js'

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

    expect(runtimeNames).toEqual(['workflow_get_session_context'])
    expect(runtimeNames).not.toContain('workflow_list_data_sources')
    expect(runtimeNames).not.toContain('workflow_search_nodes')
    expect(runtimeNames).not.toContain('workflow_get_execution_result')
  })

  it('covers the expected frontend bridge workflow tools', () => {
    const bridgeNames = PI_WORKFLOW_TOOL_SPECS
      .filter((spec) => spec.target === 'frontend_bridge')
      .map((spec) => spec.name)

    expect(bridgeNames).toEqual([
      'workflow_get_node_catalog',
      'workflow_get_node',
    ])
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

  it('keeps every server runtime spec backed by a shared runtime factory', () => {
    const runtimeExecutorKeys = PI_WORKFLOW_TOOL_SPECS
      .filter((spec) => spec.target === 'server_runtime')
      .map((spec) => spec.executorKey)

    expect(runtimeExecutorKeys).toEqual(Object.keys(sharedRuntimeToolFactories))
  })

  it('keeps every frontend canvas spec backed by an atomic tool implementation', () => {
    const bridge = new FrontendBridge(() => {})
    const tools = createAtomicWorkflowTools(bridge)
    const frontendSpecs = PI_WORKFLOW_TOOL_SPECS.filter((spec) => spec.target === 'frontend_canvas')

    expect(tools.map((tool) => tool.name)).toEqual(frontendSpecs.map((spec) => spec.name))
  })

  it('keeps every frontend bridge spec backed by a bridge tool implementation', () => {
    const bridge = new FrontendBridge(() => {})
    const tools = createFrontendBridgeTools(bridge)
    const bridgeSpecs = PI_WORKFLOW_TOOL_SPECS.filter((spec) => spec.target === 'frontend_bridge')

    expect(tools.map((tool) => tool.name)).toEqual(bridgeSpecs.map((spec) => spec.name))
  })

  it('builds shared runtime tools from the shared registry without extra implicit tools', () => {
    const request = {
      mode: 'create' as const,
      prompt: '分析当前工作流',
      profile: {
        id: 'profile_1',
        name: '测试模型',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-test',
        enabled: true,
        source: 'custom' as const,
      },
      nodeCatalog: [],
      dataSources: [],
    }

    const tools = createSharedRuntimeTools({ request })
    const runtimeSpecs = PI_WORKFLOW_TOOL_SPECS.filter((spec) => spec.target === 'server_runtime')

    expect(tools.map((tool) => tool.name)).toEqual(runtimeSpecs.map((spec) => spec.name))
  })
})
