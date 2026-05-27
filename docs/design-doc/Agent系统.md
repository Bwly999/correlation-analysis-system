# Agent 系统设计文档

## 1. 文档定位

本文档描述 Agent 系统的架构设计原则与实现约束。LLM Agent 在修改相关代码时应遵循本文档。

> **本文档的读者：** 开发者和 LLM Agent，需要理解 Agent 系统的架构决策、职责边界和实现约束。

---

## 2. 问题域

### 2.1 背景

当前系统是一个**多人共用的工作流系统**，**节点执行在前端（浏览器）** 运行。现在需要在前端接入 AI 对话能力，用户用自然语言操纵工作流画布（添加节点、连线、设参数、执行等）。

### 2.2 核心矛盾

后端 Pi Agent (Node.js) 调用 tool 后必须产生与用户在前端 GUI 上操作**一致的结果**。

**关键洞察**：GUI 操作的本质是前端函数调用，不是"模拟点击"。用户的每一次点击底层都在调 JavaScript 函数（如 `addNode()`、`connectNodes()`）。Agent 调用 tool 后也要调**同一个函数**。

### 2.3 解决方案

后端 LLM 调 tool → 事件推送到前端 → 前端调用统一的工作流操作函数 → 结果回传后端。

---

## 3. 核心架构原则

### 原则一：前端是唯一的操作执行者

| 角色 | 职责 | 不做 |
|------|------|------|
| **后端 (Pi Agent Session)** | LLM 推理、tool 调度、会话管理 | 不直接操作工作流数据，不执行工作流 |
| **前端 (Workflow Canvas)** | 执行工作流操作（增删改查执行） | 不参与 LLM 推理 |

### 原则二：Tool Name ↔ 前端函数 1:1 映射

每个后端 tool 的名称自动映射到前端的统一工作流操作函数。**禁止写 switch-case 手动映射**。

```
后端 tool name: workflow_update_partial_workflow → 前端: WorkflowApi.applyPartialWorkflowUpdate()
后端 tool name: wf_executeWorkflow → 前端: WorkflowApi.executeWorkflow()
```

设计轻量的路由层实现自动映射。

### 原则三：明确的执行入口

- `wf_executeWorkflow` 是前端画布层的**统一执行入口**
- `scope=workflow` — 整条工作流执行
- `scope=node` — 单节点调试
- 当前 Pi Agent 主链不再暴露 MCP 风格工作流调试服务端入口

### 原则四：用户级完全隔离

| 维度 | 隔离方式 |
|------|---------|
| Session | 每个用户独立 `createAgentSession()` |
| Tool 实例 | 每个用户独立闭包（捕获用户事件连接） |
| 事件连接 | 每个用户独享前后端事件通道 |

天然多租户，互不影响。

### 原则五：Tool 封装使用 Pi SDK

Agent 的 tool 封装使用 `@earendil-works/pi-coding-agent` SDK 的 tool 机制，不走 MCP 协议。

---

## 4. 数据流

```
用户输入
  │
  ▼
后端 LLM ──→ 调用 tool ──→ 事件推送到前端
                                  │
                                  ▼
                            前端工作流操作函数
                             (WorkflowApi.*)
                                  │
                                  ▼
                            执行结果回传后端
                                  │
                                  ▼
                            LLM 生成回复
```

### 关键约束

- tool 接口是 **async**，可以 `await` 前端执行结果
- 前端执行结果必须与用户 GUI 操作结果完全一致（同一函数执行）

---

## 5. 技术约束

### 5.1 Pi Agent SDK

- 运行环境：Node.js 后端
- SDK 包：`@earendil-works/pi-coding-agent`
- 文档位置：`node_modules/` 下对应包的 `docs/` 目录
- 遇到问题或疑惑先查 SDK 文档再继续

### 5.2 事件桥接

| 组件 | 文件 | 职责 |
|------|------|------|
| Event Bridge | `eventBridge.ts` | SSE 事件推送 |
| Frontend Bridge | `frontendBridge.ts` | 前端工具执行结果回传 |

### 5.3 关键实现位置

| 领域 | 路径 | 说明 |
|------|------|------|
| 前端面板 | `src/components/piAgent/` | 会话 UI (PiAgentPanel, MessageList, ToolCallCard 等) |
| 前端 Store | `src/stores/piAgentStore.ts` | Agent 状态管理 |
| 服务端 Gateway | `src/server/piAgent/gateway.ts` | Session 生命周期管理、消息路由 |
| 工具系统 | `src/server/piAgent/tools/` | 各分类 tool 实现 |
| 模型适配 | `src/server/piAgent/modelAdapter.ts` | 多 provider 支持 |
| JS Transform 子域 | `src/server/jsTransformAgent/` | JS 执行节点专属 Agent 路由与网关转发 |

---

## 6. 实施要点

### 6.1 新增 tool 的步骤

1. 在 `src/server/piAgent/tools/` 下添加 tool 定义
2. tool name 需与共享注册表 `src/shared/piWorkflowTools.ts` 对齐
3. 在前端 `WorkflowApi` 中添加对应方法
4. 在路由层注册 tool name → 前端方法的映射
5. 添加对应测试

### 6.2 需要避免的反模式

- ❌ 在后端模拟前端操作
- ❌ 用 switch-case 手动映射 tool → 前端方法
- ❌ 在后端直接操作工作流数据（只读查询除外）
- ❌ 不同用户共享 session 或 tool 实例

### 6.3 文档引用

- 工作流系统协议 → `工作流系统.md`
- 节点说明与注册 → `工作流节点说明.md`
- Pi SDK 文档 → `node_modules/@earendil-works/pi-coding-agent/docs/`
