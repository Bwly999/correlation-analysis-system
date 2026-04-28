import { describe, expect, it } from 'vitest'
import {
  gradeWorkflowMcpEvaluation,
  parseWorkflowMcpEvaluationXml,
  summarizeWorkflowMcpEvaluation,
} from '../core.js'

describe('workflow MCP evaluation core', () => {
  it('parses XML qa pairs and unescapes text entities', () => {
    const pairs = parseWorkflowMcpEvaluationXml(`
      <evaluation>
        <qa_pair>
          <question>选择 A &amp; B 的工具</question>
          <answer>workflow_search_nodes</answer>
        </qa_pair>
      </evaluation>
    `)

    expect(pairs).toEqual([
      {
        question: '选择 A & B 的工具',
        answer: 'workflow_search_nodes',
      },
    ])
  })

  it('grades answers with direct string comparison and builds a compact summary', () => {
    const results = gradeWorkflowMcpEvaluation([
      { question: 'Q1', answer: 'manual-json-import' },
      { question: 'Q2', answer: 'workflow_debug_node' },
    ], {
      Q1: 'manual-json-import',
      Q2: 'workflow_test_workflow',
    })

    expect(results).toEqual([
      expect.objectContaining({ question: 'Q1', expected: 'manual-json-import', actual: 'manual-json-import', passed: true }),
      expect.objectContaining({ question: 'Q2', expected: 'workflow_debug_node', actual: 'workflow_test_workflow', passed: false }),
    ])
    expect(summarizeWorkflowMcpEvaluation(results)).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      accuracy: 0.5,
    })
  })
})
