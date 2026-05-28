# Backend Agent Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为后端 Pi Agent / JS Transform Agent 补齐会话归属校验、跨域头配置和会话清理机制，先消除高风险缺陷。

**Architecture:** 保持现有 `Fastify route -> gateway -> runtime/sessionStore` 分层不变，只补充一层轻量的 session access guard，并在 app 生命周期和 gateway 内增加清理入口。实现尽量局部化，避免引入大规模重构。

**Tech Stack:** Fastify, TypeScript, Vitest, Pi Agent SDK, Node.js

---

### Task 1: Agent 会话归属校验

**Files:**
- Create: `src/server/piAgent/sessionAccess.ts`
- Modify: `src/server/modules/piAgentRoutes.ts`
- Modify: `src/server/modules/jsTransformAgentRoutes.ts`
- Modify: `src/server/piAgent/gateway.ts`
- Modify: `src/server/piAgent/jsTransformAgentGateway.ts`
- Test: `src/server/piAgent/__tests__/piAgentRoutes.spec.ts`
- Test: `src/server/jsTransformAgent/__tests__/jsTransformAgentRoutes.spec.ts`

- [x] **Step 1: 写失败测试，覆盖 Pi Agent session 级接口的跨用户访问**

在 `src/server/piAgent/__tests__/piAgentRoutes.spec.ts` 增加用例：
- 当前用户与 session 所属用户不一致时，`GET /sessions/:id`、`GET /events`、`POST /messages`、`POST /tool-result`、`POST /canvas-sync` 返回 `403`
- 当前用户一致时保持现有行为

- [x] **Step 2: 运行定向测试，确认它先失败**

Run: `pnpm test:unit -- src/server/piAgent/__tests__/piAgentRoutes.spec.ts`
Expected: 新增的归属校验用例失败，且失败原因是当前路由没有做 owner 校验

- [x] **Step 3: 写最小实现，补 session access guard**

实现要点：
- 新增 `sessionAccess.ts`，提供统一的 session owner 断言与 `403` 错误构造
- `gateway.ts` / `jsTransformAgentGateway.ts` 暴露读取 owner 所需的最小只读信息
- `piAgentRoutes.ts` / `jsTransformAgentRoutes.ts` 在所有 `:sessionId` 路由先校验 owner，再调用 gateway

- [x] **Step 4: 运行测试，确认 Pi Agent 路由已通过**

Run: `pnpm test:unit -- src/server/piAgent/__tests__/piAgentRoutes.spec.ts`
Expected: PASS

- [x] **Step 5: 为 JS Transform Agent 补失败测试**

在 `src/server/piAgent/__tests__/jsTransformAgentGateway.spec.ts` 增加 owner 读取/校验相关用例，覆盖：
- 非 owner 无法访问或操作 session
- owner 保持正常行为

- [x] **Step 6: 运行定向测试，确认它先失败**

Run: `pnpm test:unit -- src/server/jsTransformAgent/__tests__/jsTransformAgentRoutes.spec.ts`
Expected: FAIL，原因是当前没有 JS Transform session owner 校验链路

- [x] **Step 7: 完成最小实现并复用共享 guard**

确保 JS Transform 路由也复用统一 guard，而不是复制一套逻辑。

- [x] **Step 8: 运行测试，确认 JS Transform 相关用例通过**

Run: `pnpm test:unit -- src/server/jsTransformAgent/__tests__/jsTransformAgentRoutes.spec.ts`
Expected: PASS

### Task 2: 修正跨域请求头白名单

**Files:**
- Modify: `src/server/app.ts`
- Test: `src/server/__tests__/workflowScopedRoutes.spec.ts`

- [x] **Step 1: 写失败测试，覆盖预检请求返回的允许头**

在 `src/server/__tests__/workflowScopedRoutes.spec.ts` 增加 `OPTIONS` 预检测试，断言允许头至少包含：
- `Content-Type`
- `Authorization`
- `x-workflow-user-id`
- `x-workflow-user-name`

- [x] **Step 2: 运行定向测试，确认它先失败**

Run: `pnpm test:unit -- src/server/__tests__/workflowScopedRoutes.spec.ts`
Expected: FAIL，原因是当前 `Access-Control-Allow-Headers` 只返回 `Content-Type`

- [x] **Step 3: 写最小实现**

在 `app.ts` 中统一抽出允许头常量，确保 `@fastify/cors` 配置和手写 `OPTIONS` 响应一致。

- [x] **Step 4: 运行测试，确认通过**

Run: `pnpm test:unit -- src/server/__tests__/workflowScopedRoutes.spec.ts`
Expected: PASS

### Task 3: Agent 会话生命周期清理

**Files:**
- Modify: `src/server/app.ts`
- Test: `src/server/__tests__/appLifecycle.spec.ts`

- [x] **Step 1: 写失败测试，覆盖会话释放行为**

新增用例覆盖：
- Fastify `close()` 时会触发 `disposeAllPiAgentSessions()` 与 `disposeAllJsTransformAgentSessions()`

- [x] **Step 2: 运行定向测试，确认它先失败**

Run: `pnpm test:unit -- src/server/__tests__/appLifecycle.spec.ts`
Expected: FAIL，原因是当前没有 app 生命周期清理钩子

- [x] **Step 3: 写最小实现**

实现要点：
- 在 `app.ts` 增加 `onClose` 清理所有 agent session

- [x] **Step 4: 运行定向测试，确认通过**

Run: `pnpm test:unit -- src/server/__tests__/appLifecycle.spec.ts`
Expected: PASS

### Task 4: 回归验证

**Files:**
- Test: `src/server/piAgent/__tests__/piAgentRoutes.spec.ts`
- Test: `src/server/jsTransformAgent/__tests__/jsTransformAgentRoutes.spec.ts`
- Test: `src/server/piAgent/__tests__/gateway.spec.ts`
- Test: `src/server/piAgent/__tests__/jsTransformAgentGateway.spec.ts`
- Test: `src/server/__tests__/workflowScopedRoutes.spec.ts`
- Test: `src/server/__tests__/appLifecycle.spec.ts`

- [x] **Step 1: 运行本次变更的完整回归测试集**

Run: `pnpm test:unit -- src/server/piAgent/__tests__/piAgentRoutes.spec.ts src/server/piAgent/__tests__/gateway.spec.ts src/server/piAgent/__tests__/jsTransformAgentGateway.spec.ts src/server/__tests__/workflowScopedRoutes.spec.ts`
Expected: PASS

- [ ] **Step 2: 运行类型检查**

Run: `pnpm type-check`
Expected: PASS
Actual: 仓库当前存在测试文件的既有 TypeScript 错误，阻塞全量 `vue-tsc --build`，与本次改动无直接关系；需单独清理。

- [x] **Step 3: 更新任务勾选状态并整理交付说明**

记录：
- 已完成的风险收敛点
- 暂未处理的中长期项（如 FrontendBridge 重放、MySQL 增量写入、双 Agent 基础设施抽象）
