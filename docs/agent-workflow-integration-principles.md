# Agent + Workflow GUI 集成 — 设计原则文档

---

## 1. 问题域

当前这个系统是一个**多人共用的工作流系统**，其**节点执行在前端（浏览器）**运行。现在需要在前端接入 AI 对话能力，用户在对话中可以用自然语言操纵工作流画布（添加节点、连线、设参数、执行等）。

**核心矛盾**：后端 Pi Agent（Node.js）调用 tool 后，必须实现用户在前端 GUI 上操作一样，但是当前的实现还是基于纯后端运行的，存在结果不一致的问题，并且导致代码也是两份，不统一。

**结论**：GUI 操作的本质是前端函数调用，不是"模拟点击"。用户的每一次点击底层都在调 JavaScript 函数（如 `addNode()`、`connectNodes()`）。Agent 调用 tool 后也要调同一个函数。

---

## 2. 核心架构原则

### 原则一：前后端使用统一的工作流操作

后端 LLM 调 tool → 事件 → 前端 → 调统一的前端函数或者接口(保证与人操作的结果一模一样)

### 原则二：后端不碰执行，前端不碰推理

- **后端**：运行 Pi Agent Session，负责 LLM 推理、tool 调度。不直接操作工作流数据。
- **前端**：运行 Workflow Canvas，负责执行对应的工作流操作。

### 原则三：Tool Name ↔ 前端函数 1:1 映射

每个后端 tool 的名称应可以自动映射到前端的统一封装好的工作流操作函数或者接口。

例如：

```
后端 tool name: wf_addNode        → 前端方法: WorkflowApi.addNode()
后端 tool name: wf_connectNodes   → 前端方法: WorkflowApi.connectNodes()
后端 tool name: wf_executeWorkflow → 前端方法: WorkflowApi.executeWorkflow()
```

设计一个轻量的路由层实现自动映射，而非手动写 switch-case。

补充约束：

- `wf_executeWorkflow` 是 Pi Agent 前端画布层的统一执行入口
- `scope=workflow` 表示整条工作流执行
- `scope=node` 表示单节点调试
- upstream trace 不由该前端统一入口返回；如需 upstream trace，继续走 MCP 服务端 `workflow_debug_node`

### 原则四：每个用户完全隔离，多人同时使用互不干扰

- 每个用户有一个独立的 `createAgentSession()` 实例
- 每个用户的 tool 实例是独立的闭包（捕获用户事件连接）
- 每个用户独享前后端事件连接
- 互不影响，天然多租户

### 原则五：agent的Tool封装使用pi sdk的tool来，不走mcp

### 原则六：Tool要封装的能力参考之前已有的mcp实现(src\server\opencode\workflowMcpServer.ts)

---

## 3. 约束条件

1. **Pi Agent 运行在 Node.js 后端**，使用 `@earendil-works/pi-coding-agent` SDK，文档在node_modules下对应包目录的docs下面，遇到问题或者疑惑查询文档后再继续
2. **Pi Agent 的 Tool 接口是 async**，可以 await 前端执行结果

---
