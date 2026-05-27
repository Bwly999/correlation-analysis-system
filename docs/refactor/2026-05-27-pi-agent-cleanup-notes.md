# Pi Agent 架构收口讨论记录

日期：2026-05-27

## 当前已确认的方向

### 1. 保留唯一 AI 主链
- 保留 `Pi Agent` 作为唯一 AI 主链。
- 不再保留 `workflowAi` 作为独立编排链。
- 不再保留 `workflowMcp*` / MCP 相关链路。

### 2. workflowAi 中保留并迁出的能力
以下能力仍被 Pi Agent 主链使用，需要迁出到 `piAgent` 域或更中性的共享域：
- `profiles`
- `nodeCatalog`

### 3. workflowAi 中删除的能力
以下能力不再保留：
- `workflowAi` 会话编排链
- `workflowAi` session store
- `workflowAi` tools
- `inspectionRuntimeShared`
- 其余 `workflowAi` 路由与前端 client

### 4. 后端职责边界
已确认：
- 后端不再负责执行工作流
- 后端不再负责单节点服务端调试
- 后端不再暴露 MCP 能力

## 本次执行结果

### 已完成
- 已将 `profiles` 迁入 `src/server/piAgent/modelProfiles.ts`
- 已将 `nodeCatalog` 迁入 `src/server/piAgent/nodeCatalog.ts`
- 已新增并启用：
  - `GET /api/pi-agent/model-profiles`
  - `POST /api/pi-agent/model-profiles/test`
- `Pi Agent` 只读工具已改为直接使用 Pi Agent 内部 node catalog，不再依赖 `workflowMcpRuntime`
- 服务端主入口已移除旧 AI 路由注册，仅保留：
  - `piAgentRoutes`
  - `storageRoutes`
  - `analysisRoutes`
- 已删除以下旧链路目录/文件：
  - `src/server/modules/workflowAiRoutes.ts`
  - `src/server/modules/workflowMcpRoutes.ts`
  - `src/server/workflowAi/`
  - `src/server/workflowMcp/`
  - `src/server/workflowExecution/`
  - `src/services/workflowAi/`
  - `src/server/piAgent/workflowAgentGateway.ts`
  - 相关旧测试文件
- 已清理 Vite 开发态中的旧 `workflow-ai` 命名，统一为服务端中间件语义
- 已补充兼容性测试，明确以下旧接口返回 `404`：
  - `/api/workflow-ai/*`
  - `/api/opencode/workflow-mcp*`

### 当前保留的 Pi Agent 工具边界
- 前端执行类工具仍保留：
  - `workflow_update_partial_workflow`
  - `wf_executeWorkflow`
- 服务端只读工具保留：
  - `workflow_get_session_context`
  - `workflow_get_node_catalog`
  - `workflow_get_node`

### 已完成验证
- `pnpm type-check`
- `pnpm test:unit -- src/server/piAgent/__tests__/gateway.spec.ts src/server/piAgent/__tests__/piAgentRoutes.spec.ts src/server/piAgent/__tests__/sharedRuntimeTools.spec.ts src/server/__tests__/legacyAiRoutes.spec.ts src/server/__tests__/storageRoutes.spec.ts src/server/__tests__/workflowScopedRoutes.spec.ts src/__tests__/viteWorkflowAiDevMiddleware.spec.ts`

## 当前 Pi Agent 未来保留的工具边界

### 保留
- 前端执行类工具：
  - `workflow_update_partial_workflow`
  - `wf_executeWorkflow`

### 保留最小只读工具
这些工具不再依赖 `workflowMcpRuntime`，改为在 Pi Agent 内部直接实现：
- `workflow_get_session_context`
- `workflow_get_node_catalog`
- `workflow_get_node`

### 删除
- `workflow_workflow_versions`
- 其他依赖 `workflowMcpRuntime` 的服务端工具
- 版本历史相关 MCP / runtime 暴露

## 对外接口调整方向

### 新增 / 保留
Pi Agent 命名空间下保留或新增：
- `GET /api/pi-agent/model-profiles`
- `POST /api/pi-agent/model-profiles/test`
- 现有 `/api/pi-agent/sessions*` 主链接口继续保留

### 删除
- `/api/workflow-ai/*`
- `/api/opencode/workflow-mcp*`

## 尚未讨论完的关键问题

### B. 执行权归属
还没有定：
- 工作流“执行权”最终放前端还是后端
- 是否继续保留 `FrontendBridge` 这套 RPC

当前状态：
- 现有 Pi Agent 主链仍通过 `FrontendBridge` 让前端执行画布操作和工作流运行
- 该问题会直接决定：
  - `FrontendBridge` 是否保留
  - `atomicWorkflowTools` 是否保留当前模式
  - Pi Agent 是否继续采用“后端编排 + 前端执行”模型

### C. 代码层拆分与清理
还没有展开细化：
- 废弃 routes 的删除顺序
- 废弃 types 的拆分与收口
- stores / clients 的清理范围
- 目录迁移后的命名与归属

## 初步清理范围

### 预计移除
- `src/server/modules/workflowAiRoutes.ts`
- `src/server/modules/workflowMcpRoutes.ts`
- `src/server/workflowAi/` 中除 `profiles`、`nodeCatalog` 外的大部分内容
- `src/server/workflowMcp/`
- `src/server/workflowExecution/nodeExecutor.ts` 及相关测试
- `src/services/workflowAi/`
- 所有仅服务于旧链的测试和兼容代码

### 预计迁移
- `workflowAi/profiles.ts` -> `piAgent` 域或共享域
- `workflowAi/nodeCatalog.ts` -> `piAgent` 域或共享域

### 预计保留
- `src/server/piAgent/` 主链
- `src/stores/piAgentStore.ts`
- `src/stores/piAgentConfigStore.ts`
- `src/services/piAgentClient.ts`
- `FrontendBridge`、`atomicWorkflowTools`：是否保留，取决于 B 的结论

## 下次讨论优先级

1. 先定 B：执行权在前端还是后端
2. 再定 `FrontendBridge` 是否保留
3. 再细化 C：代码拆分、删除顺序、类型收口方案
4. 最后形成实施清单
