# Agentic Analysis Codex Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前分析代理从“可调用工作流工具的对话助手”升级为“数据分析领域的 Codex”，能够自主理解目标、探索数据、搭建工作流、执行验证、调试修复、解释结果并沉淀可复现产物。

**Architecture:** 保留现有 `opencode session + workflow MCP + Projection + Agent Workspace` 主干，在服务端新增 agentic 分析状态机，把模型自由推理约束在可验证的业务阶段内。MCP 继续作为工具边界，Projection 继续作为唯一业务翻译层，前端只消费业务事件和快照，不直接依赖 opencode 原始事件。

**Tech Stack:** Vue 3 + Pinia + TypeScript, Node server, opencode sdk, Streamable HTTP MCP, Zod, Vitest, Vue Test Utils.

---

## Scope

本计划分五个可独立验证的阶段：

1. **可观察闭环**：把真实 MCP 工具调用、执行记录、错误诊断投影到业务消息流。
2. **Agentic 状态机**：新增服务端编排器，建立“理解-画像-计划-执行-验证-解释”的主路径。
3. **自修复执行**：失败后自动定位节点、修正计划、重跑验证。
4. **分析智能提升**：增加数据画像、字段角色、方法适用性、稳健性检查等分析专用能力。
5. **产物与记忆**：沉淀报告、可复现工作流、执行证据和项目级分析记忆。

不做以下事情：

- 不做通用代码 agent。
- 不允许 opencode 读写项目文件或执行 shell。
- 不引入新 UI 设计体系。
- 不替换现有工作流节点协议。
- 不绕开 `workflow MCP` 直接让模型调用内部函数。

## File Map

### Core Agentic Runtime

- Create: `src/server/opencode/agenticAnalysis/types.ts`
  - 定义 agentic 阶段、事件、状态、验证结果、运行配置。
- Create: `src/server/opencode/agenticAnalysis/orchestrator.ts`
  - 主状态机，驱动每个阶段，调用 opencode session 与 MCP 工具。
- Create: `src/server/opencode/agenticAnalysis/prompts.ts`
  - 阶段化 system/user prompt，保持中文输出和业务约束。
- Create: `src/server/opencode/agenticAnalysis/checkpoints.ts`
  - 判断阶段是否满足完成条件，生成下一步动作。
- Create: `src/server/opencode/agenticAnalysis/projectionBridge.ts`
  - 把 agentic 阶段事件映射到现有 Projection。
- Create: `src/server/opencode/agenticAnalysis/__tests__/orchestrator.spec.ts`
  - 编排状态机单元测试。
- Modify: `src/server/opencode/gateway.ts`
  - 保留现有会话桥接，新增 agentic run 入口。
- Modify: `src/server/modules/agentRoutes.ts`
  - 新增 `/api/agent/sessions/:id/agentic-run`。

### MCP Tooling

- Modify: `src/server/opencode/workflowMcpServer.ts`
  - 补充分析专用工具注册，完善工具 annotations 与输出 schema。
- Modify: `src/server/opencode/workflowMcpRuntime.ts`
  - 新增数据画像、方法适用性、执行证据摘要能力。
- Create: `src/server/opencode/analysisIntelligence/dataProfile.ts`
  - 基于会话数据源生成字段类型、缺失率、唯一值、数值分布、候选目标/因子。
- Create: `src/server/opencode/analysisIntelligence/methodAdvisor.ts`
  - 根据字段类型、样本规模、目标变量类型推荐可用分析方法。
- Create: `src/server/opencode/analysisIntelligence/resultEvidence.ts`
  - 从节点执行结果中抽取结论证据。
- Create: `src/server/opencode/analysisIntelligence/__tests__/dataProfile.spec.ts`
- Create: `src/server/opencode/analysisIntelligence/__tests__/methodAdvisor.spec.ts`
- Modify: `src/server/opencode/__tests__/workflowMcpServer.spec.ts`
  - 覆盖新工具可发现性、schema、分页与错误场景。

### Projection And Store

- Modify: `src/ai/types.ts`
  - 扩展 `AgentProjectionExecutionState.toolCalls`、`AgentProjectionAnalysisState`、`AgentConversationEntry`，增加阶段、证据、报告产物、确认请求。
- Modify: `src/server/opencode/projection.ts`
  - 新增 `applyToolCallState`、`applyAgenticStageState`、`applyEvidenceState`。
- Modify: `src/server/opencode/agentSessionStore.ts`
  - 保存 agentic run 状态、阶段历史和长期执行证据索引。
- Modify: `src/stores/workflowAiStore.ts`
  - 消费新事件，渲染工具调用、阶段卡、证据卡、确认卡。
- Modify: `src/stores/__tests__/workflowAiStore.spec.ts`
  - 覆盖新事件和消息流。

### Frontend Agent Workspace

- Modify: `src/components/agent/AgentMessageList.vue`
  - 支持 tool、evidence、report、approval 等消息类型。
- Modify: `src/components/agent/AgentToolCallList.vue`
  - 展示真实 MCP 工具调用。
- Modify: `src/components/agent/AgentApprovalCard.vue`
  - 支持危险操作确认、继续执行确认、报告生成确认。
- Create: `src/components/agent/AgentEvidenceCard.vue`
  - 展示结论证据、来源节点、执行 ID。
- Create: `src/components/agent/AgentReportCard.vue`
  - 展示最终报告摘要与跳转到结果看板/报告 viewer 的入口。
- Modify: `src/components/agent/__tests__/AgentWorkspace.spec.ts`
  - 覆盖消息流、确认、工具调用和证据卡。

### Persistence And Evaluation

- Create: `src/server/opencode/agentMemoryStore.ts`
  - MVP 结构化记忆，先用现有存储目录落 JSON，后续可迁移到 MySQL。
- Create: `src/server/opencode/__tests__/agentMemoryStore.spec.ts`
- Create: `scripts/agentic-analysis-evaluation/run.ts`
  - 端到端任务评测入口。
- Create: `docs/evaluations/agentic-analysis-evaluation.xml`
  - 固定评测题集。
- Modify: `package.json`
  - 增加 `eval:agentic-analysis`。

### Documentation

- Modify: `工作流系统.md`
  - 补充 agentic 分析主链、状态机、MCP 工具、确认策略、评测方式。
- Modify: `工作流节点说明.md`
  - 若新增或改变节点使用规范，同步说明。
- Modify: `CHANGELOG.md`
  - 准备提交时在最上方记录变更。

---

## Chunk 1: 可观察闭环

### Task 1: 投影真实工具调用

**Files:**
- Modify: `src/server/opencode/projection.ts`
- Modify: `src/server/opencode/gateway.ts`
- Modify: `src/ai/types.ts`
- Test: `src/server/opencode/__tests__/gateway.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `gateway.spec.ts` 增加用例：当 opencode event pump 收到 `tool.call.started`、`tool.call.completed`、`tool.call.failed` 或 `message.part.updated` tool 事件时，session projection 的 `execution.toolCalls` 应同步更新，并发布 `projection.execution.updated`。

关键断言：

```ts
expect(snapshot?.projection.execution.toolCalls).toEqual([
  expect.objectContaining({
    toolName: 'workflow_get_session_context',
    status: 'success',
  }),
])
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test:unit src/server/opencode/__tests__/gateway.spec.ts`

Expected: 新断言失败，当前 projection 中 `toolCalls` 为空。

- [ ] **Step 3: 实现 Projection 工具调用合并**

在 `projection.ts` 新增：

```ts
export const applyToolCallState = (
  projection: AgentProjectionSnapshot,
  toolCall: AnalysisAgentToolCall,
): AgentProjectionSnapshot => {
  const existingIndex = projection.execution.toolCalls.findIndex((item) => item.id === toolCall.id)
  const toolCalls = [...projection.execution.toolCalls]
  if (existingIndex >= 0) {
    toolCalls.splice(existingIndex, 1, {
      ...toolCalls[existingIndex],
      ...toolCall,
    })
  } else {
    toolCalls.push(toolCall)
  }

  return {
    ...projection,
    execution: {
      ...projection.execution,
      toolCalls,
      latestToolSummary: toolCall.summary ?? toolCall.outputSummary ?? toolCall.inputSummary ?? '',
    },
    updatedAt: Date.now(),
  }
}
```

- [ ] **Step 4: 接入 event pump**

在 `gateway.ts` 的 `startAgentEventPump` 中，解析 tool event 后调用 `updateSessionProjection(...applyToolCallState...)`。工具 displayName 使用中文映射：

```ts
const WORKFLOW_TOOL_DISPLAY_NAMES: Record<string, string> = {
  workflow_get_session_context: '读取分析上下文',
  workflow_get_node_catalog: '读取节点目录',
  workflow_list_data_sources: '列出数据源',
  workflow_get_data_source_schema: '读取字段摘要',
  workflow_validate_plan: '校验工作流计划',
  workflow_execute_plan: '执行工作流计划',
  workflow_debug_node: '调试节点',
  workflow_test_workflow: '测试完整工作流',
}
```

- [ ] **Step 5: 跑测试**

Run: `pnpm test:unit src/server/opencode/__tests__/gateway.spec.ts`

Expected: PASS。

### Task 2: 前端消息流展示真实工具调用

**Files:**
- Modify: `src/ai/types.ts`
- Modify: `src/stores/workflowAiStore.ts`
- Modify: `src/components/agent/AgentMessageList.vue`
- Test: `src/stores/__tests__/workflowAiStore.spec.ts`
- Test: `src/components/agent/__tests__/AgentWorkspace.spec.ts`

- [ ] **Step 1: 写 store 测试**

新增用例：收到 `projection.execution.updated` 且包含 toolCalls 时，`agentMessages` 中出现 `tool_call` 类型消息，内容为中文工具名、状态和摘要。

- [ ] **Step 2: 扩展类型**

把 `AgentConversationEntry.kind` 扩展为：

```ts
| 'tool_call'
| 'evidence'
| 'report'
| 'approval'
```

- [ ] **Step 3: store 映射工具调用**

在 `agentMessages` computed 中，将 `projectionSnapshot.value.execution.toolCalls` 转为消息：

```ts
for (const toolCall of projectionSnapshot.value.execution.toolCalls) {
  items.push({
    id: `tool_${toolCall.id}`,
    kind: 'tool_call',
    title: toolCall.displayName || toolCall.toolName,
    content: toolCall.summary || toolCall.outputSummary || toolCall.inputSummary || '工具调用已记录',
    details: [
      `状态：${toolCall.status === 'running' ? '执行中' : toolCall.status === 'failed' ? '失败' : '成功'}`,
      toolCall.linkedExecutionRef ? `执行记录：${toolCall.linkedExecutionRef}` : '',
    ].filter(Boolean),
    status: toolCall.status === 'running' ? 'streaming' : toolCall.status === 'failed' ? 'failed' : 'completed',
  })
}
```

- [ ] **Step 4: 组件支持新 kind**

更新 `AgentMessageList.vue` 的 `isBusinessCard`，加入 `tool_call`、`evidence`、`report`、`approval`。

- [ ] **Step 5: 跑测试**

Run:

```bash
pnpm test:unit src/stores/__tests__/workflowAiStore.spec.ts src/components/agent/__tests__/AgentWorkspace.spec.ts
```

Expected: PASS。

### Task 3: 可观察闭环文档同步

**Files:**
- Modify: `工作流系统.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新工作流系统文档**

新增小节：`Agent 工具调用可观察性`，说明：

- opencode 原始 tool event 不直接给前端消费。
- Projection 统一暴露 `execution.toolCalls`。
- 前端单列消息流展示工具调用、执行状态和失败摘要。

- [ ] **Step 2: 更新 CHANGELOG**

在顶部新增中文条目。

- [ ] **Step 3: 中文乱码检查**

Run: `rg -n "�|鏂|涓|乱码" 工作流系统.md CHANGELOG.md src/server/opencode/projection.ts src/stores/workflowAiStore.ts`

Expected: 无输出。

---

## Chunk 2: Agentic 状态机

### Task 4: 定义 agentic 运行状态

**Files:**
- Create: `src/server/opencode/agenticAnalysis/types.ts`
- Modify: `src/ai/types.ts`
- Test: `src/server/opencode/agenticAnalysis/__tests__/orchestrator.spec.ts`

- [ ] **Step 1: 新增类型测试**

测试应验证阶段顺序和状态转换辅助函数。

- [ ] **Step 2: 创建类型文件**

定义：

```ts
export type AgenticAnalysisStage =
  | 'intent'
  | 'data_profile'
  | 'method_planning'
  | 'workflow_build'
  | 'workflow_validation'
  | 'execution'
  | 'debugging'
  | 'interpretation'
  | 'reporting'
  | 'waiting_user'
  | 'completed'
  | 'failed'

export interface AgenticAnalysisRunState {
  runId: string
  sessionId: string
  stage: AgenticAnalysisStage
  goal: string
  iteration: number
  maxIterations: number
  startedAt: number
  updatedAt: number
  workflowId?: string | null
  latestExecutionId?: string | null
  stageHistory: Array<{
    stage: AgenticAnalysisStage
    status: 'started' | 'completed' | 'failed'
    message: string
    at: number
  }>
}
```

- [ ] **Step 3: 扩展事件类型**

在 `src/ai/types.ts` 新增 `AgentSessionEvent` 分支：

```ts
| {
    type: 'agentic.stage.updated'
    run: {
      runId: string
      stage: string
      message: string
      iteration: number
    }
  }
```

- [ ] **Step 4: 跑类型检查**

Run: `pnpm build -- --mode development`

Expected: 当前可能因未接线失败；记录失败点，后续任务修复。

### Task 5: 新增 agentic orchestrator

**Files:**
- Create: `src/server/opencode/agenticAnalysis/orchestrator.ts`
- Create: `src/server/opencode/agenticAnalysis/prompts.ts`
- Create: `src/server/opencode/agenticAnalysis/checkpoints.ts`
- Modify: `src/server/opencode/gateway.ts`
- Test: `src/server/opencode/agenticAnalysis/__tests__/orchestrator.spec.ts`

- [ ] **Step 1: 写编排测试**

Mock 一个 agent runtime，断言 orchestrator 按顺序执行：

```text
intent -> data_profile -> method_planning -> workflow_build -> workflow_validation -> execution -> interpretation -> reporting -> completed
```

测试还要覆盖：

- 没有数据源时进入 `waiting_user`。
- 工作流校验失败时进入 `workflow_build` 修复。
- 执行失败时进入 `debugging`。
- 达到 `maxIterations` 后失败并给中文错误。

- [ ] **Step 2: 实现 checkpoints**

`checkpoints.ts` 输出纯函数：

```ts
export const shouldAskForDataSource = (request: WorkflowAiPlanRequest) =>
  !request.dataSources?.length && !request.contextHints?.schemaSummaries?.length
```

再逐步加入：

- `shouldRepairWorkflow(validation)`
- `shouldDebugExecution(execution)`
- `shouldContinueAnalysis(interpretation, iteration, maxIterations)`

- [ ] **Step 3: 实现 prompts**

每个阶段独立 prompt：

- `buildIntentPrompt`
- `buildDataProfilePrompt`
- `buildMethodPlanningPrompt`
- `buildWorkflowBuildPrompt`
- `buildInterpretationPrompt`
- `buildReportPrompt`

所有 prompt 必须强调：

- 用户可见内容中文。
- 不编造数据。
- 每个结论必须指向执行证据或明确标记为假设。
- 优先最小可运行工作流。

- [ ] **Step 4: 实现 orchestrator MVP**

第一版只调用现有 MCP 工具，不直接调用内部 runtime：

```ts
export const runAgenticAnalysis = async (input: {
  sessionId: string
  message: string
  emitEvent?: (event: AgentSessionEvent) => void
}) => {
  // 1. load session
  // 2. ensure opencode runtime
  // 3. run staged prompts
  // 4. publish agentic.stage.updated
  // 5. update projection through projectionBridge
}
```

- [ ] **Step 5: 接入 gateway**

在 `gateway.ts` export：

```ts
export const runAgenticAnalysisSession = runAgenticAnalysis
```

保留 `sendAgentSessionMessage`，不要破坏旧入口。

- [ ] **Step 6: 跑测试**

Run: `pnpm test:unit src/server/opencode/agenticAnalysis/__tests__/orchestrator.spec.ts`

Expected: PASS。

### Task 6: 新增 HTTP 入口

**Files:**
- Modify: `src/server/modules/agentRoutes.ts`
- Modify: `src/services/workflowAi/index.ts`
- Modify: `src/services/agentWorkspace/index.ts`
- Test: `src/server/opencode/__tests__/gateway.spec.ts`
- Test: `src/services/workflowAi/__tests__/index.spec.ts`

- [ ] **Step 1: 写 route 测试**

新增 `POST /api/agent/sessions/:id/agentic-run`，请求体：

```ts
{
  content: string
}
```

响应：

```ts
{
  session: AgentSessionState
  projection: AgentProjectionSnapshot
}
```

- [ ] **Step 2: 实现 route**

在 `agentRoutes.ts` 中匹配：

```ts
const agenticRunMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/agentic-run$/)
```

调用 `runAgenticAnalysisSession`。

- [ ] **Step 3: 前端 service 封装**

新增：

```ts
export const runAgenticAnalysisSession = (
  sessionId: string,
  request: AgentSessionMessageRequest,
) => fetchWithWorkflowContext(...)
```

- [ ] **Step 4: 跑测试**

Run:

```bash
pnpm test:unit src/server/opencode/__tests__/gateway.spec.ts src/services/workflowAi/__tests__/index.spec.ts
```

Expected: PASS。

---

## Chunk 3: 自修复执行

### Task 7: 失败诊断与自动修复策略

**Files:**
- Create: `src/server/opencode/agenticAnalysis/repairPlanner.ts`
- Modify: `src/server/opencode/agenticAnalysis/orchestrator.ts`
- Test: `src/server/opencode/agenticAnalysis/__tests__/orchestrator.spec.ts`

- [ ] **Step 1: 写失败链路测试**

模拟 `workflow_execute_plan` 返回 failed，orchestrator 必须：

1. 进入 `debugging`。
2. 调用 `workflow_debug_node`。
3. 生成修复计划。
4. 调用 `workflow_update_partial_workflow` 或重新执行修正后的 plan。
5. 再次 `workflow_execute_plan`。

- [ ] **Step 2: 实现 repairPlanner**

输入：

```ts
{
  failedNodeId: string
  nodeType: string
  error: string
  upstreamTrace?: unknown[]
}
```

输出：

```ts
{
  summary: string
  operations: WorkflowAiOperation[]
  confidence: 'low' | 'medium' | 'high'
  requiresUserConfirmation: boolean
}
```

- [ ] **Step 3: 高风险修复进入确认**

以下情况必须生成 approval：

- 删除节点。
- 回滚版本。
- 整包替换工作流。
- 低置信度修复。
- 目标/因子字段不明确。

- [ ] **Step 4: 跑测试**

Run: `pnpm test:unit src/server/opencode/agenticAnalysis/__tests__/orchestrator.spec.ts`

Expected: PASS。

### Task 8: 审批和继续执行

**Files:**
- Modify: `src/server/opencode/projection.ts`
- Modify: `src/server/opencode/agentSessionStore.ts`
- Modify: `src/components/agent/AgentApprovalCard.vue`
- Modify: `src/components/agent/AgentComposer.vue`
- Test: `src/components/agent/__tests__/AgentWorkspace.spec.ts`

- [ ] **Step 1: 写 UI 测试**

当 projection 包含 `pendingApprovals` 时：

- 输入区显示“待确认”。
- 审批卡展示中文原因。
- 用户点击确认后发送结构化消息继续执行。

- [ ] **Step 2: 后端保存审批状态**

在 session record 中保存：

```ts
pendingApprovals: AnalysisAgentApprovalRequest[]
```

或继续以 Projection 为唯一状态源，但必须可恢复。

- [ ] **Step 3: 前端确认交互**

`AgentApprovalCard` 增加确认/取消事件。确认发送：

```text
确认执行：<approval key>
```

取消发送：

```text
取消执行：<approval key>
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test:unit src/components/agent/__tests__/AgentWorkspace.spec.ts`

Expected: PASS。

---

## Chunk 4: 分析智能提升

### Task 9: 数据画像工具

**Files:**
- Create: `src/server/opencode/analysisIntelligence/dataProfile.ts`
- Modify: `src/server/opencode/workflowMcpRuntime.ts`
- Modify: `src/server/opencode/workflowMcpServer.ts`
- Test: `src/server/opencode/analysisIntelligence/__tests__/dataProfile.spec.ts`
- Test: `src/server/opencode/__tests__/workflowMcpServer.spec.ts`

- [ ] **Step 1: 写数据画像测试**

输入 rows：

```ts
[
  { sales: 100, price: 9.9, city: '上海', date: '2026-01-01' },
  { sales: 120, price: 8.8, city: '北京', date: '2026-01-02' },
]
```

期望输出：

- `sales` / `price` 为 numeric。
- `city` 为 categorical。
- `date` 为 datetime。
- 包含缺失率、唯一值数量、候选目标/因子。

- [ ] **Step 2: 实现 `buildDataProfile`**

限制：

- 最多扫描前 5000 行。
- 不返回完整 rows。
- 对高基数字段只返回摘要。

- [ ] **Step 3: 注册 MCP 工具**

新增 `workflow_profile_data_source`：

```ts
{
  dataSourceId: string
}
```

返回字段画像。

- [ ] **Step 4: 跑测试**

Run:

```bash
pnpm test:unit src/server/opencode/analysisIntelligence/__tests__/dataProfile.spec.ts src/server/opencode/__tests__/workflowMcpServer.spec.ts
```

Expected: PASS。

### Task 10: 方法顾问工具

**Files:**
- Create: `src/server/opencode/analysisIntelligence/methodAdvisor.ts`
- Modify: `src/server/opencode/workflowMcpServer.ts`
- Test: `src/server/opencode/analysisIntelligence/__tests__/methodAdvisor.spec.ts`

- [ ] **Step 1: 写方法推荐测试**

覆盖：

- 数值目标 + 多个数值因子：推荐 Pearson、Spearman、线性回归、随机森林重要性。
- 分类目标：推荐逻辑回归、分组对比，不推荐 Pearson 作为主方法。
- 样本过少：输出风险。
- 缺失率过高：输出预处理建议。

- [ ] **Step 2: 实现 `recommendAnalysisMethods`**

输出：

```ts
{
  recommended: Array<{
    method: string
    nodeTypes: string[]
    reason: string
    priority: 'primary' | 'secondary'
  }>
  risks: string[]
  preprocessingSuggestions: string[]
}
```

- [ ] **Step 3: 注册 MCP 工具**

新增 `workflow_recommend_methods`。

- [ ] **Step 4: 跑测试**

Run: `pnpm test:unit src/server/opencode/analysisIntelligence/__tests__/methodAdvisor.spec.ts`

Expected: PASS。

### Task 11: 证据抽取与结论约束

**Files:**
- Create: `src/server/opencode/analysisIntelligence/resultEvidence.ts`
- Modify: `src/server/opencode/agenticAnalysis/prompts.ts`
- Modify: `src/server/opencode/projection.ts`
- Test: `src/server/opencode/analysisIntelligence/__tests__/resultEvidence.spec.ts`

- [ ] **Step 1: 写证据抽取测试**

给定相关性节点、回归节点、特征重要性节点结果，输出：

```ts
{
  evidenceId: string
  nodeId: string
  nodeLabel: string
  statement: string
  metrics: Record<string, unknown>
}
```

- [ ] **Step 2: 实现 evidence extractor**

只抽取标准结果协议中的摘要、指标和表格前几行；不做模型推断。

- [ ] **Step 3: 修改报告 prompt**

要求所有 findings 结构为：

```ts
{
  text: string
  evidenceIds: string[]
  caveat?: string
}
```

第一版可在最终中文报告中以自然语言呈现，但内部必须保留 evidenceIds。

- [ ] **Step 4: 跑测试**

Run: `pnpm test:unit src/server/opencode/analysisIntelligence/__tests__/resultEvidence.spec.ts`

Expected: PASS。

---

## Chunk 5: 产物、记忆与评测

### Task 12: Agent 报告产物

**Files:**
- Create: `src/components/agent/AgentEvidenceCard.vue`
- Create: `src/components/agent/AgentReportCard.vue`
- Modify: `src/stores/workflowAiStore.ts`
- Modify: `src/components/agent/AgentMessageList.vue`
- Test: `src/components/agent/__tests__/AgentWorkspace.spec.ts`

- [ ] **Step 1: 写组件测试**

断言：

- evidence 消息展示证据标题、节点来源、执行 ID。
- report 消息展示报告摘要和建议。
- 所有用户可见文案为中文。

- [ ] **Step 2: 实现组件**

卡片保持当前 SaaS 风格，不使用紫色/靛蓝主强调色，强调色使用 Blue-600。

- [ ] **Step 3: 接入消息流**

`AgentMessageList` 根据 kind 分派到对应组件。

- [ ] **Step 4: 跑测试**

Run: `pnpm test:unit src/components/agent/__tests__/AgentWorkspace.spec.ts`

Expected: PASS。

### Task 13: 结构化记忆 MVP

**Files:**
- Create: `src/server/opencode/agentMemoryStore.ts`
- Create: `src/server/opencode/__tests__/agentMemoryStore.spec.ts`
- Modify: `src/server/opencode/agenticAnalysis/orchestrator.ts`
- Modify: `工作流系统.md`

- [ ] **Step 1: 写记忆测试**

覆盖：

- 按 userId + workflowId 保存字段语义。
- 按 userId 查询最近分析偏好。
- TTL 或最大数量裁剪。
- 用户隔离。

- [ ] **Step 2: 实现 JSON store**

存储结构：

```ts
{
  userId: string
  workflowId?: string
  memories: Array<{
    id: string
    kind: 'field_semantics' | 'method_preference' | 'analysis_finding'
    content: Record<string, unknown>
    createdAt: number
    updatedAt: number
  }>
}
```

- [ ] **Step 3: orchestrator 读写记忆**

启动时读取：

- 字段语义。
- 用户常选目标。
- 最近使用方法。

完成时写入：

- 本次字段角色判断。
- 最终方法选择。
- 高置信度结论摘要。

- [ ] **Step 4: 跑测试**

Run: `pnpm test:unit src/server/opencode/__tests__/agentMemoryStore.spec.ts`

Expected: PASS。

### Task 14: 端到端评测

**Files:**
- Create: `docs/evaluations/agentic-analysis-evaluation.xml`
- Create: `scripts/agentic-analysis-evaluation/run.ts`
- Modify: `package.json`

- [ ] **Step 1: 写评测题集**

至少 5 类任务：

- 基础相关性分析。
- 多因子回归分析。
- 分类目标分析。
- 缺失值/异常值场景。
- 现有工作流修复场景。

- [ ] **Step 2: 实现评测脚本**

脚本输入：

```bash
pnpm eval:agentic-analysis -- --session=<sessionId> --user=<userId>
```

输出：

- 工具调用是否满足最低要求。
- 是否生成可验证工作流。
- 是否执行成功。
- 是否包含证据引用。
- 是否产生中文报告摘要。

- [ ] **Step 3: package script**

加入：

```json
"eval:agentic-analysis": "npx tsx scripts/agentic-analysis-evaluation/run.ts"
```

- [ ] **Step 4: 跑评测脚本 help**

Run: `pnpm eval:agentic-analysis -- --help`

Expected: 输出中文使用说明。

### Task 15: 全量验证与文档收尾

**Files:**
- Modify: `工作流系统.md`
- Modify: `工作流节点说明.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 文档同步**

`工作流系统.md` 必须新增：

- Agentic 分析状态机。
- 新 MCP 工具说明。
- 自修复执行链路。
- 审批策略。
- 记忆策略。
- 评测命令。

`工作流节点说明.md` 若新增节点或改变节点使用规则，必须同步。

- [ ] **Step 2: 中文乱码检查**

Run:

```bash
rg -n "�|鏂|涓|乱码" 工作流系统.md 工作流节点说明.md CHANGELOG.md src docs scripts
```

Expected: 无新增乱码。

- [ ] **Step 3: 单元测试**

Run: `pnpm test:unit`

Expected: PASS。

- [ ] **Step 4: 构建**

Run: `pnpm build`

Expected: PASS。

- [ ] **Step 5: 评测**

Run:

```bash
pnpm eval:workflow-mcp -- --help
pnpm eval:agentic-analysis -- --help
```

Expected: 两个命令均可运行并输出说明。

---

## Acceptance Criteria

完成后，系统必须满足：

- 用户输入一个业务分析目标后，agent 能自动读取上下文和数据源。
- agent 能生成字段画像和方法建议，并说明选择理由。
- agent 能创建或修改工作流，并在每次修改后校验。
- agent 能执行工作流计划，读取结果，并根据失败自动调试至少一轮。
- agent 能输出中文结论，且核心结论带执行证据来源。
- 用户能在 Agent Workspace 看到真实工具调用、阶段进度、失败诊断、确认请求、报告产物。
- 危险操作不会静默执行，必须进入确认。
- `pnpm test:unit` 和 `pnpm build` 通过。
- 工作流系统文档和 CHANGELOG 已同步。

## Execution Notes

- 每个 Chunk 单独提交，提交信息使用中文。
- 涉及工作流协议、节点规则或 MCP 工具变化时，必须同步 `工作流系统.md`。
- 涉及节点能力、节点属性或节点职责变化时，必须同步 `工作流节点说明.md`。
- 保持 opencode 权限默认 deny，仅允许 workflow MCP 工具。
- 不要把模型输出当作事实；所有分析结论必须来自执行结果、字段画像或明确假设。
