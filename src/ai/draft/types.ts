import type { WorkflowAiGenerationIssue, WorkflowAiOperation, WorkflowAiPlan } from '../types.js'

export type AiDraftNodeSource = 'existing' | 'draft'
export type AiDraftEntityStatus = 'clean' | 'added' | 'updated' | 'removed'

export interface AiDraftNode {
  ref: string
  source: AiDraftNodeSource
  nodeType: string
  label: string
  position?: { x: number; y: number }
  config: Record<string, unknown>
  hasExplicitConfig?: boolean
  status: AiDraftEntityStatus
  originalLabel?: string
  originalPosition?: { x: number; y: number }
  originalConfig?: Record<string, unknown>
}

export interface AiDraftEdge {
  ref: string
  sourceRef: string
  targetRef: string
  sourceHandle?: string
  targetHandle?: string
  status: AiDraftEntityStatus
}

export interface AiDraftGraph {
  summary: string
  assumptions: string[]
  warnings: string[]
  questions: string[]
  nodes: AiDraftNode[]
  edges: AiDraftEdge[]
}

export type AiDraftMutation =
  | {
      type: 'createNode'
      ref: string
      nodeType: string
      label?: string
      position?: { x: number; y: number }
      config?: Record<string, unknown>
    }
  | {
      type: 'updateNodeConfig'
      ref: string
      config: Record<string, unknown>
    }
  | {
      type: 'renameNode'
      ref: string
      label: string
    }
  | {
      type: 'moveNode'
      ref: string
      position: { x: number; y: number }
    }
  | {
      type: 'removeNode'
      ref: string
    }
  | {
      type: 'connectNodes'
      ref: string
      sourceRef: string
      targetRef: string
      sourceHandle?: string
      targetHandle?: string
    }
  | {
      type: 'disconnectEdge'
      ref: string
    }
  | {
      type: 'setSummary'
      summary: string
    }
  | {
      type: 'setAssumptions'
      assumptions: string[]
    }
  | {
      type: 'setWarnings'
      warnings: string[]
    }
  | {
      type: 'setQuestions'
      questions: string[]
    }

export interface RecoverableDraftBuildInput {
  plan: WorkflowAiPlan
  issues: WorkflowAiGenerationIssue[]
}

export type FinalizedDraftOperation = WorkflowAiOperation
