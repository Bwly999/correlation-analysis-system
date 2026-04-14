# 多因子分析 Agent 会话化改造设计

## 背景

当前仓库已经把分析代理接到了 `opencode sdk`，但后端仍保留了明显的自研 `agent-loop` 结构：

- 自研 `loop / iteration / preset`
- 自研 `plan / interpretation / conclusion` 协议
- 前端围绕 loop 状态组织 UI

这会带来两个问题：

1. 名义上使用了 `opencode sdk`，实际上仍然由系统自己主导 agent 编排。
2. 事件流异常时，`opencode` 监听失败会把宿主进程直接打崩，浏览器只能看到 `network error`。

本次改造目标不是继续修补现有 loop，而是彻底移除自研 agent-loop，让 `opencode sdk` 成为唯一 agent 内核，同时保留当前数据分析系统所需的业务展示能力。

## 目标

- 后端完全移除自研 agent-loop 编排层。
- `opencode session / message / event / tool` 成为唯一 agent 执行模型。
- 保留并增强 `workflow MCP`，让 agent 能继续访问当前分析会话、节点目录、版本、校验与工作流执行能力。
- 前端界面继续服务于“多因子分析工作流搭建”场景，而不是退化成通用 agent 调试台。
- 前端展示改成单列对话式业务流，把工作流业务态、分析业务态、执行业务态全部融合进消息流。

## 非目标

- 不保留旧的 `/analysis-agent/session/:id/run-agent-loop` 协议兼容层。
- 不保留旧的 `standard / deep` preset 概念。
- 不继续维护 `iteration`、`loop_completed` 之类的前后端状态模型。
- 不把前端改造成 opencode 原始调试界面。

## 设计原则

### 1. opencode 是唯一 agent 内核

所有与 agent 行为相关的能力都来自 `opencode sdk`：

- 会话创建与恢复
- 用户消息发送
- 工具调用
- 权限请求
- 增量事件流

系统不再自行驱动“下一轮分析”“是否继续分析”“输出结论 schema”。

### 2. 系统只保留业务投影层

系统仍然需要把原始 agent 事件翻译成当前业务可理解的状态：

- 工作流业务态
- 分析业务态
- 执行业务态

这层是 projection，不是新的 agent loop。

### 3. MCP 是业务能力总入口

`workflow MCP` 作为 opencode 与业务系统之间的唯一高层接口，负责暴露：

- 当前分析会话上下文
- 节点目录与节点定义
- 工作流草案校验
- 已保存工作流与版本历史
- 版本回滚
- 当前数据分析系统专用的执行与分析辅助能力

### 4. 前端优先展示业务价值

前端不再强调“第几轮”“是否继续追问”等 loop 语义，而强调：

- 当前识别的数据与分析目标
- 当前生成的工作流草案
- 当前选用的分析方法
- 当前的结论、风险与建议
- 当前是否已同步画布、是否可回滚版本

## 目标架构

### 后端分层

后端改为四层：

1. `Agent Session Bridge`
   - 创建 / 恢复 opencode session
   - 向 opencode session 发送用户消息
   - 订阅并转发 opencode 原始事件

2. `Projection Service`
   - 消费 opencode 原始事件
   - 生成当前系统的业务投影快照
   - 向前端发出业务投影事件

3. `Workflow MCP`
   - 暴露工作流、节点、版本、校验、执行等业务能力

4. `Workflow Execution Capability`
   - 节点执行器
   - 画布同步
   - 工作流持久化与版本快照

其中第 1、2 层是新的 agent 集成层；第 3、4 层保留业务能力，但从“服务 agent-loop”改成“服务 opencode session”。

### 删除的后端结构

以下内容应删除或退出主路径：

- `src/server/agentLoop/*` 中与 agent 编排直接相关的模块
- 自研 `phases / toolRegistry / loop config / iteration state`
- 自研 `plan / interpretation / conclusion` 结构化提示词链路
- `/analysis-agent/session/:id/run-agent-loop` 路由

保留但要迁移的内容：

- 通用节点执行能力
- 与工作流草案应用相关的执行逻辑

这些能力应迁移到更中性的模块中，避免继续挂在 `agentLoop` 目录下。

## 新 API 设计

### 1. `POST /api/agent/sessions`

创建或恢复业务 agent 会话。

职责：

- 创建本系统的业务会话记录
- 创建 / 绑定 opencode session
- 记录当前工作流快照、工作流 ID、用户目标、模型配置

返回：

- 业务会话基础信息
- 当前 projection 快照

### 2. `GET /api/agent/sessions/:id`

读取业务会话基础信息。

返回内容不再包含：

- `iteration`
- `preset`
- `loopRunning`

只返回：

- 会话元数据
- 当前工作流绑定关系
- 当前 projection 摘要
- 最新错误摘要

### 3. `POST /api/agent/sessions/:id/messages`

发送用户消息。

职责：

- 把用户输入写入 opencode session
- 启动或继续当前 agent 会话

此接口不再意味着“触发一次 loop”，只意味着“向 session 发送新的业务输入”。

### 4. `GET /api/agent/sessions/:id/events`

返回事件流，格式为 NDJSON 或 SSE。

底层数据来源：

- opencode 原始事件

服务端额外补充：

- projection 事件

建议的业务事件类型：

- `projection.workflow.updated`
- `projection.analysis.updated`
- `projection.execution.updated`
- `projection.error.updated`
- `projection.canvas_sync.updated`

### 5. `GET /api/agent/sessions/:id/projection`

读取当前业务投影快照。

用途：

- 页面刷新恢复
- 首屏渲染
- 从断线状态重新挂载事件流前的状态恢复

### 6. `POST /api/agent/sessions/:id/canvas-sync`

把当前 projection 中已确认的工作流草案同步到画布。

语义变化：

- 不是 loop 结束附属动作
- 是“对当前业务草案执行同步”

## Projection 设计

Projection 是当前系统和 opencode 之间的业务翻译层。

### 1. 工作流业务态

用于回答“当前工作流草案是什么”：

- 当前工作流名称 / ID
- 当前草案节点数、连线数
- 当前草案节点链路摘要
- 最近一次画布同步状态
- 当前版本快照数
- 最近可回滚版本信息

### 2. 分析业务态

用于回答“当前分析做到了哪里”：

- 当前分析目标
- 识别出的目标字段与候选因子
- 当前已采用的方法
- 当前结论摘要
- 风险提示
- 建议动作

### 3. 执行业务态

用于回答“系统刚刚做了什么”：

- 最近一次关键动作
- MCP 工具使用摘要
- 待确认事项
- 最近失败点
- 最近一次工具结果摘要

### 4. 原始调试信息

原始调试信息仍然保留，但只作为附加层：

- 原始 tool call
- 原始 permission request
- 原始 opencode event

它们不再驱动主界面结构。

## 前端设计

### 1. 界面结构

前端从“主消息区 + 右侧业务栏”改成“单列对话式业务流”。

消息流中可以混排：

- 用户目标消息
- 分析代理自然语言消息
- 工作流业务态卡片
- 分析业务态卡片
- 执行业务态卡片
- 画布同步结果卡片
- 折叠的执行细节块

### 2. 删除的交互

以下交互直接删除：

- `标准分析 / 深入分析` preset
- `第 1 轮 / 第 2 轮` 文案
- 基于 loop 状态的步骤条和轮次 badge
- 常驻右侧 runtime/tool rail

### 3. 保留的交互

以下交互保留，但重接数据源：

- 模型配置
- 版本历史与回滚
- 发送消息
- 画布同步入口
- 流式消息显示

### 4. Store 改造

前端 store 从“loop 状态模型”改成“session + projection 模型”。

旧状态应移除：

- `agentLoopRunning`
- `agentLoopOutput`
- `agentLoopPreset`
- `loop iteration` 相关推导

新状态应新增：

- `activeSession`
- `projectionSnapshot`
- `projectionStreamState`
- `messageStreamState`
- `latestExecutionDetails`

## 迁移步骤

### 阶段 1：建立新桥接层

- 新建基于 opencode session 的后端 bridge
- 新建 projection service
- 保持 MCP 可用

### 阶段 2：新前端接 projection

- 新建或重构前端 store
- 把主工作台切成单列对话流
- 接入新的 session / message / events / projection API

### 阶段 3：切断旧协议

- 删除旧 `run-agent-loop` 路由
- 删除旧 loop 状态模型
- 删除 preset 与 iteration UI

### 阶段 4：清理旧实现

- 删除 `src/server/agentLoop/*` 中 agent 编排相关代码
- 迁移通用节点执行能力到新模块
- 更新测试与文档

## 风险与约束

### 1. 不能再把 opencode 事件监听错误变成进程级崩溃

必须保证：

- 事件订阅失败只会进入业务错误态
- 后端返回明确的失败事件
- 不允许再出现 `ERR_CONNECTION_RESET` 作为主要失败表现

### 2. Projection 不能演变成新的厚编排层

Projection 只做映射，不做 agent 决策。

### 3. 前端必须继续体现数据分析系统语义

不能直接展示大量通用 agent 调试信息而稀释：

- 当前分析目标
- 当前方法
- 当前草案
- 当前结论

## 测试策略

### 后端

- session bridge 单测
- projection 映射单测
- MCP 交互测试
- 事件流异常与恢复测试
- canvas-sync 集成测试

### 前端

- store 恢复与流式更新测试
- 单列业务流渲染测试
- 业务态卡片插入顺序测试
- 折叠执行详情测试

### 端到端

验收标准：

- 使用指定 GLM 配置能真实跑通一次
- 不再出现 loop/preset/iteration 文案
- 单列消息流中能看到三类业务信息
- 可同步到右侧画布并生成版本快照
- 事件流异常时仅呈现业务错误，不会打崩前后端进程

## 涉及文件范围

后端重点范围：

- `src/server/opencode/*`
- `src/server/app.ts`
- `src/server/workflowAi/*`
- `src/server/agentLoop/*`（迁移后删除或瘦身）

前端重点范围：

- `src/stores/workflowAiStore.ts`
- `src/services/workflowAi/*`
- `src/services/agentWorkspace/*`
- `src/components/agent/*`

文档范围：

- `工作流系统.md`
- `CHANGELOG.md`

## 推荐落地顺序

1. 先建立新 session bridge 与 projection，再接前端。
2. 前端完成单列业务流后，再删除旧 loop 状态和旧组件依赖。
3. 最后再删除旧 `agentLoop` 目录中的编排代码，避免迁移过程失去参照物。
