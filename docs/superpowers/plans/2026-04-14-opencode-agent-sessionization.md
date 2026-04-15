# Opencode Agent 会话化改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `opencode sdk` 完全替换当前自研 `agent-loop` 主链，建立面向多因子分析系统的 session/message/events/projection 架构，并把前端改造成单列对话式业务流。

**Architecture:** 后端以 `Agent Session Bridge + Projection Service + Workflow MCP + Workflow Execution Capability` 四层重组，`opencode sdk` 成为唯一 agent 内核，系统只负责业务投影和工作流执行。前端从 loop/iteration/preset 状态模型切到 session/projection 模型，把工作流业务态、分析业务态和执行业务态融合进单列消息流，原始调试信息降级为折叠详情。

**Tech Stack:** Vue 3 + Pinia + TypeScript, Node HTTP server, `@opencode-ai/sdk/v2`, Vitest

---

## File Map

**主要修改文件**

- `src/server/app.ts`
  责任：移除旧 `analysis-agent` loop 路由，接入新的 `/api/agent/sessions/*` API。
- `src/server/opencode/gateway.ts`
  责任：从“单次 loop 运行器”重构为 session bridge；管理 opencode session、消息发送、原始事件泵、失败收敛。
- `src/server/opencode/workflowMcpServer.ts`
  责任：继续提供 workflow MCP，但调整工具命名、上下文来源和用户态桥接。
- `src/server/workflowAi/sessionStore.ts`
  责任：复用/扩展会话持久化，保存新的 agent session 记录与 projection 快照。
- `src/server/workflowAi/orchestrator.ts`
  责任：剥离 analysis-agent 兼容包装，保留工作流会话、上下文和执行能力。
- `src/server/agentLoop/*`
  责任：迁移节点执行等仍需复用的中性能力；删除 loop/phases/conclusion/toolRegistry 等主路径依赖。
- `src/services/workflowAi/index.ts`
  责任：切换到新的 `/api/agent/sessions/*` 前端 API。
- `src/services/agentWorkspace/index.ts`
  责任：删除旧 loop 代理，直接导出新的 agent session API。
- `src/stores/workflowAiStore.ts`
  责任：从 `agentLoop*` 状态模型迁移到 `activeSession + projection + event stream` 模型。
- `src/components/agent/AgentWorkspace.vue`
  责任：从“双栏主区 + 右侧 rail”改为单列对话式业务流容器。
- `src/components/agent/AgentMessageList.vue`
  责任：支持业务消息、projection 卡片、折叠执行详情统一渲染。
- `src/components/agent/AgentComposer.vue`
  责任：移除 preset，保留业务输入与模型入口。
- `工作流系统.md`
  责任：更新 agent 工作台与工作流协同的新主链说明。
- `CHANGELOG.md`
  责任：记录本次架构替换。

**建议新增文件**

- `src/server/opencode/agentSessionStore.ts`
  责任：保存业务 agent session 元数据、opencode session 绑定、projection 快照、最新错误。
- `src/server/opencode/projection.ts`
  责任：把 opencode 原始事件映射为 workflow / analysis / execution / canvas-sync projection。
- `src/server/opencode/routes.ts`
  责任：集中处理 `/api/agent/sessions/*` 路由。
- `src/services/workflowAi/agentSession.ts`
  责任：封装新的 agent session 前端请求与流式消费。
- `src/components/agent/cards/*`
  责任：拆分工作流业务卡、分析业务卡、执行业务卡、同步结果卡与调试详情块。

**主要测试文件**

- `src/server/opencode/__tests__/gateway.spec.ts`
- `src/server/__tests__/workflowAiRoutes.spec.ts`
- `src/services/workflowAi/__tests__/index.spec.ts`
- `src/stores/__tests__/workflowAiStore.spec.ts`
- `src/stores/__tests__/workflowAiStoreAgentLoop.spec.ts`
- `src/components/agent/__tests__/AgentWorkspace.spec.ts`

### Task 1: 固化后端 session bridge 与事件失败语义

**Files:**
- Modify: `src/server/opencode/__tests__/gateway.spec.ts`
- Modify: `src/server/opencode/gateway.ts`
- Create: `src/server/opencode/agentSessionStore.ts`
- Create: `src/server/opencode/projection.ts`

- [ ] **Step 1: 写失败测试，锁定 session bridge 行为**

```ts
it('在 opencode 事件流失败时写入业务错误态，而不是抛出连接重置', async () => {
  eventSubscribeMock.mockRejectedValueOnce(new Error('boom'))

  await expect(
    sendAgentSessionMessage({ sessionId: 'agent_1', message: '继续分析' }),
  ).resolves.toMatchObject({
    projection: expect.objectContaining({
      error: expect.objectContaining({
        message: '监听 opencode 事件流失败',
      }),
    }),
  })
})
```

- [ ] **Step 2: 跑定向测试确认红灯**

Run: `pnpm vitest run src/server/opencode/__tests__/gateway.spec.ts`
Expected: FAIL，提示缺少 session bridge / projection / 错误收敛实现

- [ ] **Step 3: 实现最小 session bridge**

```ts
export type AgentSessionRecord = {
  id: string
  workflowSessionId: string
  opencodeSessionId: string | null
  projection: AgentProjectionSnapshot
  lastError: { message: string; at: string } | null
}
```

- [ ] **Step 4: 实现事件泵失败收敛**

```ts
try {
  for await (const event of stream) {
    applyProjectionEvent(record, event)
  }
} catch (error) {
  markAgentSessionError(record.id, toBusinessError(error))
}
```

- [ ] **Step 5: 回跑测试确认变绿**

Run: `pnpm vitest run src/server/opencode/__tests__/gateway.spec.ts`
Expected: PASS

### Task 2: 切换后端 API 到 `/api/agent/sessions/*`

**Files:**
- Modify: `src/server/__tests__/workflowAiRoutes.spec.ts`
- Modify: `src/server/app.ts`
- Create: `src/server/opencode/routes.ts`

- [ ] **Step 1: 写路由失败测试**

```ts
it('返回 agent session 创建结果与 projection 快照', async () => {
  const response = await request(server)
    .post('/api/agent/sessions')
    .send({ prompt: '分析销量与价格关系', profile })

  expect(response.status).toBe(200)
  expect(response.body.session.projection).toBeDefined()
})
```

- [ ] **Step 2: 跑路由测试确认失败**

Run: `pnpm vitest run src/server/__tests__/workflowAiRoutes.spec.ts`
Expected: FAIL，提示 `/api/agent/sessions` 未实现或返回结构不匹配

- [ ] **Step 3: 接入新路由并移除旧主路径**

```ts
POST /api/agent/sessions
GET /api/agent/sessions/:id
POST /api/agent/sessions/:id/messages
GET /api/agent/sessions/:id/events
GET /api/agent/sessions/:id/projection
POST /api/agent/sessions/:id/canvas-sync
```

- [ ] **Step 4: 保证旧 `/analysis-agent/session/:id/run-agent-loop` 不再挂主路径**

Run: `rg "run-agent-loop|analysis-agent/session" src/server`
Expected: 只允许保留迁移期注释或测试数据，不再作为生产接口入口

- [ ] **Step 5: 回跑路由测试**

Run: `pnpm vitest run src/server/__tests__/workflowAiRoutes.spec.ts`
Expected: PASS

### Task 3: 复用工作流能力并收敛旧 agent-loop 依赖

**Files:**
- Modify: `src/server/agentLoop/nodeExecutor.ts`
- Modify: `src/server/workflowAi/orchestrator.ts`
- Modify: `src/server/workflowAi/sessionStore.ts`
- Delete/Modify: `src/server/agentLoop/phases.ts`
- Delete/Modify: `src/server/agentLoop/conclusionGenerator.ts`
- Delete/Modify: `src/server/agentLoop/toolRegistry.ts`
- Delete/Modify: `src/server/agentLoop/engine.ts`

- [ ] **Step 1: 为中性执行能力补回归测试**

```ts
it('agent session 仍可复用节点执行能力生成 execution projection', async () => {
  const execution = await executeNodesForAgent(plan, request, vi.fn())
  expect(execution[0]?.nodeId).toBe('node_1')
})
```

- [ ] **Step 2: 跑相关测试**

Run: `pnpm vitest run src/server/agentLoop/__tests__/nodeExecutor.spec.ts src/server/opencode/__tests__/gateway.spec.ts`
Expected: FAIL 或部分 FAIL，暴露旧 loop 依赖

- [ ] **Step 3: 把节点执行能力迁移为 bridge 可直接调用的中性模块**

```ts
// 保留 executeNodesForAgent
// 删除 plan / iteration / conclusion 专属编排依赖
```

- [ ] **Step 4: 清理死代码引用**

Run: `rg "DEFAULT_AGENT_LOOP_CONFIG|buildNextIterationRequest|conclusionGenerator|toolRegistry" src`
Expected: 仅剩必要迁移代码；旧 loop 主路径不再被引用

- [ ] **Step 5: 回跑相关测试**

Run: `pnpm vitest run src/server/agentLoop/__tests__/nodeExecutor.spec.ts src/server/opencode/__tests__/gateway.spec.ts`
Expected: PASS

### Task 4: 切换前端 service 到 session/projection API

**Files:**
- Modify: `src/services/workflowAi/__tests__/index.spec.ts`
- Modify: `src/services/workflowAi/index.ts`
- Modify: `src/services/agentWorkspace/index.ts`
- Create: `src/services/workflowAi/agentSession.ts`

- [ ] **Step 1: 写前端 API 层失败测试**

```ts
it('消费 agent session events 流并返回最新 projection', async () => {
  const result = await sendAgentSessionMessage('agent_1', { content: '继续' }, { onEvent })
  expect(result.projection.analysis.goal).toContain('继续')
})
```

- [ ] **Step 2: 跑定向测试确认失败**

Run: `pnpm vitest run src/services/workflowAi/__tests__/index.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现新的前端请求函数**

```ts
export const createAgentSession = (...)
export const getAgentSession = (...)
export const sendAgentSessionMessage = (...)
export const streamAgentSessionEvents = (...)
export const getAgentProjection = (...)
export const syncAgentCanvas = (...)
```

- [ ] **Step 4: 删除旧 loop API 代理**

Run: `rg "runAnalysisAgentLoop|startAnalysisAgentSession" src/services src/components src/stores`
Expected: 旧调用点仅保留迁移中待删除位置

- [ ] **Step 5: 回跑前端 API 测试**

Run: `pnpm vitest run src/services/workflowAi/__tests__/index.spec.ts`
Expected: PASS

### Task 5: 把 store 改成 session + projection 模型

**Files:**
- Modify: `src/stores/__tests__/workflowAiStore.spec.ts`
- Modify: `src/stores/__tests__/workflowAiStoreAgentLoop.spec.ts`
- Modify: `src/stores/workflowAiStore.ts`

- [ ] **Step 1: 写 store 失败测试**

```ts
it('把 projection 更新映射为单列业务消息流', async () => {
  await store.createAgentSession(workflowStore)
  applyEvent({ type: 'projection.workflow.updated', projection: workflowProjection })
  expect(store.agentMessages.some((item) => item.kind === 'workflow_projection')).toBe(true)
})
```

- [ ] **Step 2: 跑 store 测试确认失败**

Run: `pnpm vitest run src/stores/__tests__/workflowAiStore.spec.ts src/stores/__tests__/workflowAiStoreAgentLoop.spec.ts`
Expected: FAIL，旧 `agentLoop*` 状态仍在

- [ ] **Step 3: 最小重构 store**

```ts
const activeSession = ref<AgentSession | null>(null)
const projectionSnapshot = ref<AgentProjectionSnapshot | null>(null)
const projectionStreamState = ref<'idle' | 'streaming' | 'failed'>('idle')
const latestExecutionDetails = ref<AgentExecutionDetails | null>(null)
```

- [ ] **Step 4: 删除旧 preset / iteration / auto-run 逻辑**

Run: `rg "agentLoop|preset|iteration" src/stores/workflowAiStore.ts`
Expected: 只剩迁移注释或新的业务字段名

- [ ] **Step 5: 回跑 store 测试**

Run: `pnpm vitest run src/stores/__tests__/workflowAiStore.spec.ts src/stores/__tests__/workflowAiStoreAgentLoop.spec.ts`
Expected: PASS

### Task 6: 把 Agent Workspace 改成单列对话式业务流

**Files:**
- Modify: `src/components/agent/__tests__/AgentWorkspace.spec.ts`
- Modify: `src/components/agent/AgentWorkspace.vue`
- Modify: `src/components/agent/AgentMessageList.vue`
- Modify: `src/components/agent/AgentComposer.vue`
- Modify: `src/components/agent/AgentRuntimePanel.vue`
- Modify: `src/components/agent/AgentVersionPanel.vue`
- Modify: `src/components/agent/AgentToolCallList.vue`
- Create: `src/components/agent/cards/AgentWorkflowProjectionCard.vue`
- Create: `src/components/agent/cards/AgentAnalysisProjectionCard.vue`
- Create: `src/components/agent/cards/AgentExecutionProjectionCard.vue`
- Create: `src/components/agent/cards/AgentCanvasSyncCard.vue`

- [ ] **Step 1: 写组件失败测试**

```ts
it('在消息流中同时渲染工作流卡、分析卡和执行卡，不再渲染右侧 rail', () => {
  render(AgentWorkspace, { props: { visible: true } })
  expect(screen.getByText('当前工作流草案')).toBeInTheDocument()
  expect(screen.queryByText('当前运行态')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 跑组件测试确认失败**

Run: `pnpm vitest run src/components/agent/__tests__/AgentWorkspace.spec.ts`
Expected: FAIL

- [ ] **Step 3: 重构为单列消息流**

```vue
<div class="agent-workspace__main">
  <AgentMessageList :messages="messages" />
</div>
<AgentComposer ... />
```

- [ ] **Step 4: 把业务卡片与版本信息内嵌到消息流**

```ts
type AgentMessageKind =
  | 'user'
  | 'assistant'
  | 'workflow_projection'
  | 'analysis_projection'
  | 'execution_projection'
  | 'canvas_sync'
  | 'debug_details'
```

- [ ] **Step 5: 删除 preset UI 与右侧分栏样式**

Run: `rg "标准分析|深入分析|第 .* 轮|agent-workspace__rail" src/components/agent`
Expected: 不再出现旧 loop/preset UI

- [ ] **Step 6: 回跑组件测试**

Run: `pnpm vitest run src/components/agent/__tests__/AgentWorkspace.spec.ts`
Expected: PASS

### Task 7: 更新工作流协同文档与变更记录

**Files:**
- Modify: `工作流系统.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 写文档检查清单**

```md
- Agent API 改为 /api/agent/sessions/*
- 前端工作台改为单列业务消息流
- 版本历史 / 画布同步 / MCP 仍围绕同一工作流协议
```

- [ ] **Step 2: 更新文档**

Run: `rg "run-agent-loop|analysis-agent|右侧 AI|双工作区" 工作流系统.md`
Expected: 命中段落已更新为新架构

- [ ] **Step 3: 更新 CHANGELOG**

Run: `Get-Content -Head 20 CHANGELOG.md`
Expected: 顶部包含本次会话化替换记录

### Task 8: 全量验证

**Files:**
- Test only

- [ ] **Step 1: 跑后端与前端定向测试**

Run: `pnpm vitest run src/server/opencode/__tests__/gateway.spec.ts src/server/__tests__/workflowAiRoutes.spec.ts src/services/workflowAi/__tests__/index.spec.ts src/stores/__tests__/workflowAiStore.spec.ts src/components/agent/__tests__/AgentWorkspace.spec.ts`
Expected: PASS

- [ ] **Step 2: 跑单元测试全量回归**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 3: 跑构建**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: 做真实端到端验证**

Run:

```bash
pnpm dev
pnpm dev:server
```

验收要点：
- 使用指定模型配置可创建 agent session
- 发送消息后消息流中出现工作流业务态、分析业务态、执行业务态卡片
- 同步画布成功生成版本快照
- 事件流异常时页面展示业务错误，不出现 `network error` / `ERR_CONNECTION_RESET`

