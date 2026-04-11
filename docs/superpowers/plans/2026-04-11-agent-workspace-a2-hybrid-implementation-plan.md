# 2026-04-11 Agent Workspace A2 混合方案实现计划

## 1. 当前目标

将左侧 `AgentWorkspace` 重构为混合方案：

- 外层框架采用 `A2-1 稳态平衡`
- `tool / skill` 调用块采用 `A2-2 轻终端感`
- 系统关键节点卡片采用 `A2-3 系统联动更强`

目标体验：

- 整体像成熟 SaaS 控制台，而不是普通聊天框
- Agent Loop 在浏览器端持续实时输出
- tool / skill 调用具备明确的执行感
- 与当前系统强相关的重要节点通过卡片多元展示

## 2. 当前已完成

### 2.1 外层视觉骨架

- 去除 Agent 区域原有渐变背景
- 统一为浅灰白背景、细边框、轻阴影体系
- 顶部 `Header`、状态轨道、底部 `Composer` 已收敛到 `A2-1` 风格
- 顶部进度条已改为紧凑横向时间线

### 2.2 基础消息块样式

- `AgentMessageList` 已改为更克制的消息流容器
- 用户消息、普通 assistant 文本、stream 文本已有新的视觉层级
- `ThinkingBlock` 已降噪，避免和工具块抢视觉

### 2.3 Tool Block 第一轮样式

- `AgentToolCallList` 已改成更接近 agent coding 工具的紧凑执行块
- 已支持展示：
  - 工具名
  - 执行状态
  - 输入摘要
  - 输出摘要
  - 耗时

### 2.4 系统卡片第一轮样式

- `AgentArtifactCard` 已从深色结果卡切换为产品化白底系统卡
- 已加入：
  - 左侧类型色条
  - 卡片标签
  - 更适合“计划 / 结果 / 联动”类节点的样式语言

### 2.5 结构问题修复

- `AgentWorkspace` 右侧 tool rail 改为按需显示
- 没有工具调用时，不再保留空白占位列
- 已移除输入框与消息区之间那个突兀的空矩形来源

## 3. 当前仍未完成

这轮只完成了视觉骨架与基础结构，尚未完成以下关键工作：

### 3.1 统一事件流渲染器

当前消息流仍然是“现有 block 拼接”的延续，尚未真正升级为统一事件流渲染器。

后续应收敛为：

- 用户消息
- assistant 实时文本流
- tool / skill 调用事件
- thinking 事件
- 系统关键节点卡片事件
- 缺失信息 / 审批事件
- 最终结论事件

统一按单一 timeline/message stream 渲染，而不是继续堆多个局部组件。

### 3.2 Agent Loop 实时输出深化

当前已有 `stream` 文本样式，但还不够像 Claude Code / Codex / OpenCode 的体验。

需要继续优化：

- 多段 delta 合并到当前正在输出的同一块中
- 正在输出中的 assistant block 增加更自然的流式反馈
- loop 轮次、执行节点、解释阶段之间的过渡更清晰

### 3.3 Tool / Skill 调用模型增强

当前 `AgentToolCallList` 仍然主要使用现有 `toolCalls` 数据。

需要补足：

- 明确区分 `tool` 与 `skill`
- 支持阶段性运行态更新
- 展开更多上下文时显示更细粒度输入 / 输出
- 减少消息主流与右侧 rail 的信息重复

### 3.4 系统关键节点卡片接入

当前系统卡片样式已经准备好，但卡片类型和事件映射仍不完整。

优先接入的系统关键节点：

- 计划已生成
- 数据理解完成
- 执行结果快照
- 缺失信息待确认
- 画布同步结果

### 3.5 Conclusion 区域统一

当前最终结论仍保留为 `AgentWorkspace` 下方单独的结论区。

后续建议：

- 结论卡统一并入消息流
- 若保留底部结果区，则需与消息流避免重复

## 4. 后续建议实现顺序

### 第一阶段：消息流结构升级

1. 收敛 `buildMessages`
2. 把 loop 事件、tool 事件、artifact 事件统一映射为单流
3. 避免同一信息在消息区、右侧 rail、底部结论区重复出现

### 第二阶段：系统卡片正式接入

1. 为计划生成、数据理解、执行快照、画布同步增加明确 artifact 类型
2. 为不同 artifact 类型提供更稳定的 UI 文案和字段结构
3. 让关键节点卡片具备产品语义，而不只是展示普通文本

### 第三阶段：Tool / Skill 调用深化

1. 将工具调用与消息流联动
2. 明确运行态、成功态、失败态
3. 在必要时支持展开更多细节

### 第四阶段：收口交互体验

1. 处理空态消息区
2. 统一消息块间距与视觉节奏
3. 调整结论区是否保留在流外
4. 做一次浏览器端截图级复核

## 5. 建议继续验证

每轮 UI / 消息流改动后，至少执行：

```bash
pnpm vitest run src/components/agent/__tests__/AgentWorkspace.spec.ts
pnpm vitest run src/components/workflow/__tests__/WorkflowCanvas.spec.ts src/stores/__tests__/workflowAiStoreAgentLoop.spec.ts
pnpm build
```

在进行消息流重构后，再补跑：

```bash
pnpm test:unit
```

## 6. 当前结论

当前版本不是最终完成版。

当前状态应定义为：

- `AgentWorkspace A2 混合方案第一轮视觉骨架已落地`
- `结构性空白 rail 问题已修复`
- `消息流统一建模、系统关键节点卡片接入、Agent Loop 实时对话体验强化仍待继续实现`
