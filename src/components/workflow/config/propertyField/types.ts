import type {
  JsTransformAgentContext,
  JsTransformAgentSafeDebugResult,
  WorkflowAiModelProfile,
} from "@/ai/types";
import type { NodeProperty } from "@/nodes/types";

export interface PropertyFieldUpstreamFactor {
  name: string;
  value: string;
  dataType?: string;
  nullable?: boolean;
  missingRate?: number;
  completenessRate?: number;
}

export interface PropertyFieldProps {
  prop: NodeProperty;
  modelValue: unknown;
  upstreamFactors: PropertyFieldUpstreamFactor[];
  configContext?: Record<string, unknown>;
  nodeId?: string | null;
  inputData?: unknown;
  agentProfile?: WorkflowAiModelProfile | null;
  agentOutputData?: unknown;
  agentErrorMessage?: string;
  buildJsTransformAgentContext?: (() => JsTransformAgentContext) | undefined;
  onAgentDebugNode?: (mode: "reuse_cached_upstream" | "rerun_upstream") => Promise<JsTransformAgentSafeDebugResult>;
}
