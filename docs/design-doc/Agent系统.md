# Agent 系统设计文档

## 1. 文档定位

本文档描述当前仓库中 Agent / AI 相关服务端代码的现行架构、职责边界与实现约束。

> **读者对象：** 需要维护 `Pi Agent`、`analysis` 代理、`js-transform` 子域的开发者与 LLM Agent。
>
> **关于 Notebook Agent：** 见 [`notebook-agent/`](notebook-agent/index.md)（前端 Pyodide 笔记本，与 Pi Agent 主链平级、零耦合）。

---

## 2. 当前子系统划分

当前 server 中与 AI 相关的代码分为四类：

| 子系统 | 入口 | 说明 |
|------|------|------|
| **Pi Agent 主链** | `/api/pi-agent/*` | 面向工作流画布的自然语言分析与操作助手 |
| **Notebook Agent** | `/api/notebook-agent/*` | 独立于画布的 AI 数据分析笔记本（前端 Pyodide）；详见 [`notebook-agent/`](notebook-agent/index.md) |
| **Analysis 代理** | `/api/analysis/*` | 纯 Python 算法 HTTP 代理，不参与 Pi Agent session/tool 体系 |
| **JS Transform 子域** | `/api/js-transform-agent/*` | 仅服务 `js-transform` 节点的专用 Agent 子域 |

已移除但保留 404 回归测试的历史路径：

- `/api/workflow-ai/*`
- `/api/opencode/*`
- 旧 `/api/pi-agent/js-transform/*`

这些历史路径不属于现行架构。

---

## 3. Pi Agent 主链

### 3.1 核心原则

| 原则 | 说明 |
|------|------|
| **前端是唯一执行者** | 后端只负责 LLM 推理、tool 调度、会话管理；真实画布修改与执行都在前端完成 |
| **单一生效链路** | 画布修改只走 `tool.execute -> WorkflowApi -> tool-result`，不存在第二条 `workflow.apply` 补链 |
| **共享 spec 驱动** | 工具元数据统一来自 `src/shared/piWorkflowTools.ts`，前后端都按 `executorKey` 建 registry |
| **缺失即失败** | 共享 spec 中声明的 tool 若在对应端缺少实现，应初始化即抛错，而不是静默漏配 |
| **用户级隔离** | Session、工具实例、前后端桥接都按用户会话隔离 |

### 3.2 主链数据流

```text
用户输入
  -> /api/pi-agent/sessions / messages
  -> 后端 Pi Agent session (Pi SDK)
  -> tool.execute 事件推到前端
  -> 前端 WorkflowApi 执行真实画布操作 / 执行工作流
  -> /api/pi-agent/sessions/:id/tool-result 回传结果
  -> 后端继续推理并输出回复
```

### 3.3 工具分类

| 类别 | 目标端 | 当前工具 |
|------|------|------|
| 前端执行型工具 | `frontend_canvas` | `workflow_update_partial_workflow`, `wf_executeWorkflow` |
| 服务端只读工具 | `server_runtime` | `workflow_get_session_context`, `workflow_get_node_catalog`, `workflow_get_node` |

共享 spec 与实现约束：

1. 在 `src/shared/piWorkflowTools.ts` 声明 tool 元数据
2. 前端在 `piAgentStore.ts` 中按 `executorKey` 注册执行器
3. 服务端在 `src/server/piAgent/tools/sharedRuntimeTools.ts` 中按 `executorKey` 注册 factory
4. 两端都必须通过测试验证 spec 与 registry 一一对应

### 3.4 模型接入

Pi Agent 的模型测试与真实运行都必须复用同一套 Pi SDK 运行时构建逻辑：

- provider / model / auth 解析
- `ModelRegistry` / `AuthStorage` 组装
- `DefaultResourceLoader` 组装

`/api/pi-agent/model-profiles/test` 的语义是：

> 当前 profile 能否按 Pi Agent 实际运行路径成功建立一次最小会话并完成最小交互。

---

## 4. Analysis 代理

`/api/analysis/*` 是纯 HTTP 代理层，用于将前端算法请求转发到 Python 分析服务。

特点：

- 不参与 Pi Agent session 生命周期
- 不使用 Pi SDK tool 机制
- 不共享 Pi Agent 的上下文、事件流或画布桥接

因此它虽然属于“AI 相关 server 代码”，但不是 Agent 子系统的一部分。

---

## 5. JS Transform 子域

`/api/js-transform-agent/*` 是 `js-transform` 节点的专用 Agent 子域。

特点：

- 复用 Pi SDK 会话能力
- 只服务当前 `js-transform` 节点
- 使用独立的路由命名空间
- 不参与 Pi Agent 主链的工作流画布增量修改工具

当前实现允许该子域复用 `src/server/piAgent/jsTransformAgentGateway.ts`，但路由层应直接引用真实实现，不保留额外的壳层转发文件。

---

## 6. 关键实现位置

| 领域 | 路径 | 职责 |
|------|------|------|
| Pi Agent 前端面板 | `src/components/piAgent/` | 会话 UI |
| Pi Agent 前端 Store | `src/stores/piAgentStore.ts` | 会话状态、tool.execute 执行、tool-result 回传 |
| Pi Agent 路由 | `src/server/modules/piAgentRoutes.ts` | HTTP 入口 |
| Pi Agent Gateway | `src/server/piAgent/gateway.ts` | Session 编排 |
| Pi Agent 工具 | `src/server/piAgent/tools/` | tool factory / tool 定义 |
| Pi Agent 运行时 | `src/server/piAgent/runtimeFactory.ts` | 模型、资源加载器、健康检查共用构建逻辑 |
| Analysis 代理 | `src/server/analysisProxy.ts` + `src/server/modules/analysisRoutes.ts` | Python 分析服务转发 |
| JS Transform 路由 | `src/server/modules/jsTransformAgentRoutes.ts` | 子域 HTTP 入口 |

---

## 7. 维护约束

### 7.1 必须避免的反模式

- ❌ 在后端直接修改工作流画布数据
- ❌ 重新引入 `workflow.apply` 之类的第二条画布应用链
- ❌ 共享 spec 存在，但一端靠手工 `switch` 静默漏配
- ❌ 模型测试和真实运行走两套不同 provider / auth 逻辑
- ❌ 让 analysis 代理混入 Pi Agent session/tool 体系

### 7.2 新增 Pi Agent tool 的步骤

1. 在 `src/shared/piWorkflowTools.ts` 添加 spec
2. 为目标端补对应 registry 实现
3. 添加或更新 tool registry 一致性测试
4. 若是前端执行型工具，确保落到 `WorkflowApi` 的真实统一入口

### 7.3 文档引用

- 工作流系统协议：`docs/design-doc/workflow-system/`
- 节点体系与节点定义：`docs/design-doc/workflow-nodes/`
- Pi SDK 文档：`node_modules/@earendil-works/pi-coding-agent/docs/`
