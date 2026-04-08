# 聊天式分析代理工作台 UI/UX 设计方案

## 1. 目标与判断

当前实现虽然已经把“分析代理”语义接入现有系统，但 UI 仍停留在“右侧 AI 抽屉 + 编排表单”的旧形态。这种交互不符合用户对 agent 产品的预期，也无法承载以下关键体验：

- 像 Codex / Claude Code 一样的连续对话工作流
- 实时流式输出，而不是一次性结果回填
- 当前执行阶段、工具调用、思考块、阻塞确认项的结构化可见性
- 对话与执行流之间的强联动
- “先看任务推进，再看底层工作流”的产品心智

因此，本次方案不再继续增强现有右侧抽屉，而是将主界面重构为：

- 左侧：`Agent Workspace`
- 右侧：`Execution Workspace`

工作流画布不再是唯一主视图，而是变成 agent 的执行现场和证据层。

## 2. 产品定位

### 2.1 用户入口

用户通过聊天式输入直接发起分析任务，例如：

- 帮我分析影响销量的关键因素
- 看看哪些变量和目标值最相关
- 帮我把两份数据合并后做因子筛选

系统默认进入“分析代理工作台”，而不是要求用户先拖节点搭工作流。

### 2.2 产品心智

产品心智从：

- “AI 帮我生成工作流”

切换为：

- “我和一个分析代理协作，代理负责理解任务、推进分析、执行工具、解释结果；工作流是它的执行过程和证据链”

### 2.3 设计原则

- 聊天优先：任务从对话开始，而不是从画布开始
- 执行透明：用户能看到 agent 正在做什么
- 工具可见：工具调用应显式呈现，而不是埋在日志中
- 思考可折叠：展示结构化思考摘要，但默认折叠，避免噪音
- 工作流可追溯：右侧随时可查看、可编辑、可回流到对话
- 业务语言优先：默认文案面向业务分析人员，而不是统计工程师

## 3. 总体布局

## 3.1 页面结构

主页面采用双栏主工作台：

- 左栏 `Agent Workspace`：约 40%
- 右栏 `Execution Workspace`：约 60%

顶部保留一条轻量工具栏，底部保留执行日志区，但日志区不再承担 agent 主叙事。

## 3.2 顶部栏

保留现有项目名、保存、模板、帮助等核心入口，但重新组织信息优先级：

- 左侧：
  - 项目名
  - 未保存状态
- 中间：
  - 当前任务状态
  - 当前分析标题 / 当前任务目标摘要
- 右侧：
  - 保存
  - 新建
  - 模板
  - 帮助
  - 代理展开 / 收起
  - 文件

“AI 编排”入口文案统一替换为“分析代理”。

## 3.3 左右栏职责边界

### 左侧 Agent Workspace

左侧是用户与 agent 协作的主界面，负责：

- 发起任务
- 查看流式对话
- 观察 agent 当前阶段
- 查看工具调用
- 查看思考块
- 补充确认项
- 继续追问

### 右侧 Execution Workspace

右侧是执行与证据工作区，负责：

- 查看 agent 物化出的执行流
- 查看结果摘要
- 查看最终报告
- 编辑工作流
- 从节点与结果回跳到对话上下文

## 4. 左侧 Agent Workspace 设计

左侧由 4 个主模块组成。

## 4.1 Agent Header

顶部固定区域，显示任务态信息。

建议内容：

- 标题：`分析代理`
- 当前状态：
  - 分析中
  - 等待确认
  - 已完成
  - 失败
- 当前会话摘要
- 模型信息
- 操作按钮：
  - 停止
  - 新会话
  - 清空会话
  - 展开报告

视觉方向：

- 极简现代 SaaS，但不能是普通表单头
- 更接近“命令工作台”，而不是“配置面板”
- 使用高密度信息卡而不是松散按钮组

## 4.2 Agent Message List

这是整个 agent 体验的主体区域，按消息流展示。

每条 assistant 消息不再是单段文本，而是由多个 block 组成。

建议 block 类型：

- `message.text`
  - 普通说明文本
- `message.stream`
  - 正在流式输出的实时文本
- `message.step_group`
  - 当前执行步骤汇总
- `message.tool_call`
  - 工具调用卡片
- `message.thinking`
  - 思考块，默认折叠
- `message.approval_request`
  - 等待用户确认的结构化阻塞项
- `message.artifact`
  - 结论卡片、报告卡片、风险卡片、建议卡片

### 消息流交互要求

- 用户消息与代理消息视觉区分明显
- 代理流式输出时，消息卡实时追加，不等待全量完成
- 工具调用必须显式插入消息流，而不是写到隐藏日志
- 思考块必须默认折叠，避免过载
- 审批项必须高亮，不允许埋在正文里

## 4.3 Agent Timeline

这是 agent 的阶段时间线，不等同于原始日志。

默认阶段建议：

1. 理解问题
2. 检查数据
3. 选择方法
4. 构建流程
5. 执行分析
6. 解释结果
7. 输出结论

每个阶段有以下状态：

- `idle`
- `running`
- `completed`
- `waiting`
- `failed`

交互要求：

- 时间线常驻显示，不随着消息滚动丢失
- 当前阶段高亮
- 点击某阶段可过滤相关工具调用和消息块
- 若某阶段失败，可展开失败原因

## 4.4 Agent Composer

底部固定输入框区域。

支持：

- 输入新的分析问题
- 在当前上下文上继续追问
- 回复阻塞确认项
- 输入后续约束，例如“按区域分组”“忽略异常值”

需要支持两种状态：

- 普通输入模式
- 阻塞确认模式

阻塞确认模式下，输入区上方显示当前待确认项列表，并支持快捷确认按钮。

## 5. 右侧 Execution Workspace 设计

右侧不再只是纯画布，而是一个带 Tab 的多视图执行区。

## 5.1 Tab 结构

建议 3 个一级 Tab：

- `执行流`
- `结果`
- `报告`

### 执行流

显示工作流画布，承担：

- 当前 agent 执行路径的可视化
- 当前运行节点高亮
- 节点级调试
- 人工修改工作流

### 结果

显示运行后的聚合结果与关键输出：

- 当前选中节点结果
- 本次执行关键结论摘要
- 图表和表格证据

### 报告

显示最终面向业务用户的结构化报告：

- 一句话结论
- 关键发现
- 风险与限制
- 后续建议

## 5.2 Tab 自动切换规则

- agent 执行中：默认停在 `执行流`
- 出现关键中间结果：可提示切到 `结果`
- agent 完成：默认切到 `报告`
- 用户点击工具调用 / 阶段 / 证据链接时：自动切换到对应 Tab

## 5.3 右侧联动能力

从左侧任意结构化元素应能联动到右侧：

- 点击工具调用卡片 -> 定位对应节点 / 执行结果
- 点击时间线阶段 -> 聚焦对应执行片段
- 点击结论证据 -> 高亮对应图表、结果、节点
- 用户手改工作流 -> 左侧 agent 获得“画布已修改”的结构化消息

## 6. 工具调用、思考块与流式输出设计

## 6.1 工具调用卡片

工具调用要像 agent 产品里的“动作证据”，不能只显示英文工具名。

每张卡片包含：

- 工具中文标题
- 工具内部名
- 当前状态
- 输入摘要
- 输出摘要
- 耗时
- 关联执行对象

例如：

- 读取字段摘要
- 检查当前工作流上下文
- 运行 Pearson 相关分析
- 校验草稿工作流

## 6.2 思考块

思考块不展示原始 chain-of-thought，而展示结构化摘要。

建议结构：

- 为什么选这条分析路径
- 当前不确定点
- 为什么暂停让用户确认
- 为什么认为结论可信 / 不足

默认折叠，仅显示标题与一句摘要：

- `分析思考：已确认使用相关性 + 随机森林作为当前最稳妥路径`

展开后展示分段说明，但控制长度，避免冗长。

## 6.3 流式输出

流式输出需要在消息流里原位出现，而不是单独留一个“模型原始输出”区域。

流式输出分两种：

- `结论流`
  - agent 正在写给用户看的内容
- `执行流`
  - agent 正在推进的结构化步骤说明

不建议继续强调“原始模型 token 输出”，而应强调：

- 当前正在做什么
- 已经完成了什么
- 还差什么

## 7. 数据结构设计

当前 `plan + diagnostics + sessionState + streamEvents` 不足以直接支撑新的 UI。

需要新增面向前端工作台的派生状态模型。

## 7.1 Agent Workspace 视图模型

建议新增：

```ts
type AgentWorkspaceSession = {
  sessionId: string
  userGoal: string
  phase: 'intent' | 'planning' | 'executing' | 'interpreting' | 'waiting_for_input' | 'completed' | 'failed'
  workflowSummary?: string
  messages: AgentMessage[]
  timeline: AgentTimelineStep[]
  toolCalls: AgentToolCall[]
  artifacts: AgentArtifact[]
  approvalRequests: AgentApprovalRequest[]
  activeExecutionRef?: string
}
```

## 7.2 Message Block 模型

```ts
type AgentMessage =
  | {
      id: string
      role: 'user' | 'assistant'
      blocks: AgentMessageBlock[]
      createdAt: number
    }

type AgentMessageBlock =
  | { type: 'text'; content: string }
  | { type: 'stream'; content: string; status: 'streaming' | 'completed' }
  | { type: 'tool_call'; toolCallId: string }
  | { type: 'thinking'; title: string; summary: string; details: string[]; collapsed: boolean }
  | { type: 'artifact'; artifactId: string }
  | { type: 'approval_request'; requestId: string }
  | { type: 'step_group'; stepIds: string[] }
```

## 7.3 Timeline 模型

```ts
type AgentTimelineStep = {
  id: string
  title: string
  description?: string
  status: 'idle' | 'running' | 'completed' | 'waiting' | 'failed'
  linkedToolCallIds?: string[]
  linkedExecutionRef?: string
}
```

## 7.4 Tool Call 模型

```ts
type AgentToolCall = {
  id: string
  toolName: string
  displayName: string
  status: 'success' | 'failed' | 'running'
  inputSummary?: string
  outputSummary?: string
  startedAt?: number
  finishedAt?: number
  linkedExecutionRef?: string
}
```

## 8. 前端组件设计

建议新增一个独立的 `components/agent/` 目录，不再继续把所有能力塞进 `WorkflowAiPanel.vue`。

## 8.1 新增组件

- `components/agent/AgentWorkspace.vue`
- `components/agent/AgentHeader.vue`
- `components/agent/AgentMessageList.vue`
- `components/agent/AgentTimeline.vue`
- `components/agent/AgentComposer.vue`
- `components/agent/AgentToolCallList.vue`
- `components/agent/AgentThinkingBlock.vue`
- `components/agent/AgentArtifactCard.vue`
- `components/agent/AgentApprovalCard.vue`

## 8.2 现有组件职责调整

### `WorkflowCanvas.vue`

从“画布容器”升级为“整页工作台布局容器”，负责：

- 左右双栏布局
- 执行区 Tab 管理
- agent workspace 显隐控制
- 右侧工作流、结果、报告联动

### `WorkflowAiPanel.vue`

不建议继续作为主承载组件长期演化。

建议：

- 第一阶段保留兼容，内部改为调用新 agent 组件
- 第二阶段移除，或者只保留兼容导出壳

### `WorkflowHeader.vue`

替换“AI 编排”文案为“分析代理”，但不承担复杂交互，仅作为全局开关和状态提示入口。

## 9. 视觉方向

### 9.1 风格基调

采用“现代分析工作台 + 控制台气质”的混合风格。

要求：

- 极简现代 SaaS
- 不做紫色科技风
- 不做聊天气泡玩具感
- 不做纯白表单后台感

建议视觉特征：

- 主基调仍以 `Slate-900 / Blue-600` 为核心
- 左侧 agent 区更像“会话控制台”
- 右侧执行区更像“专业分析台”
- 使用清晰层级、细颗粒边框、半透明浮层、状态色点缀

### 9.2 左侧视觉重点

- 要有明显“session 正在推进”的感受
- 时间线、工具卡和思考块之间有层级差异
- 消息流不要像普通 IM 产品
- 可适度引入轻微进度动画和流式闪动，但不能廉价

### 9.3 右侧视觉重点

- 画布仍保持当前风格一致性
- Tab 切换要更强产品化，不是普通浏览器页签
- 报告页要更像“交付物”，而不是原始调试信息

## 10. 状态与行为规则

## 10.1 默认状态

- 默认展开 agent workspace
- 默认展开执行区 Tab
- 默认显示 `执行流`
- 首次进入时焦点落在左下输入框

## 10.2 用户提问后

- 创建用户消息
- agent 进入 `intent/planning`
- 开始流式消息与时间线推进
- 工具调用和阶段变化实时插入
- 若生成工作流草稿，右侧立即同步可视化

## 10.3 进入等待确认

- 左侧顶部状态改为 `等待确认`
- 时间线当前阶段标记为 `waiting`
- 审批卡片插入消息流，并固定显示在输入框上方
- 右侧保持最后相关执行上下文

## 10.4 用户编辑右侧工作流

- 系统产生一条结构化 assistant 消息：
  - 已同步当前画布，共 X 个节点、Y 条连线
- 若 agent 正在等待确认，则保留等待态
- 若 agent 处于已完成态，则把后续输入视为新一轮协作

## 11. API 与状态管理改造建议

当前不需要立即重写后端执行主链，但需要新增前端工作台状态适配层。

## 11.1 后端接口

继续保留：

- `/api/workflow-ai/*`

并基于现有会话新增或继续使用兼容层：

- `/api/analysis-agent/session/start`
- `/api/analysis-agent/session/:id/input`
- `/api/analysis-agent/session/:id/canvas-sync`
- `/api/analysis-agent/session/:id`

## 11.2 前端 store

`workflowAiStore` 需要新增：

- `agentWorkspaceSession`
- `agentMessages`
- `agentTimeline`
- `agentToolCalls`
- `activeExecutionTab`
- `syncAnalysisCanvas()`

并把原有：

- `streamEvents`
- `streamOutputs`
- `toolTrace`
- `sessionState`
- `plan`

映射成新的工作台视图模型。

## 12. 分阶段实施建议

### Phase 1：布局重构

- `WorkflowCanvas` 改为左右双栏
- 引入 `AgentWorkspace`
- 右侧引入执行区 Tab
- 保持现有 store 数据先可用

### Phase 2：消息与 block 化

- 引入 message block 渲染模型
- 流式输出进入消息流
- 工具调用卡片化
- 思考块折叠化

### Phase 3：联动与回跳

- 时间线、工具、证据、画布联动
- 结果 / 报告与工作流节点关联
- 右侧编辑同步回左侧

### Phase 4：视觉精修

- 统一配色、间距、层级
- 微动效
- 更高质量的状态反馈

## 13. 验收标准

以下标准全部满足，才算这轮 UI/UX 改造完成：

- 用户进入页面后，默认看到 agent 工作台，而不是隐藏抽屉
- 用户提问后，能看到流式输出
- 用户能清楚看到 agent 当前所处阶段
- 工具调用以独立卡片显示
- 思考块默认折叠，可展开查看
- 右侧存在 `执行流 / 结果 / 报告` 三个明确视图
- 左侧与右侧存在双向联动
- 用户修改工作流后，agent 能感知并反馈
- 中文文案统一，无乱码
- 移动端或窄宽度下仍有合理退化策略

## 14. 结论

本次 UI/UX 改造的本质不是“美化 AI 面板”，而是把系统从“工作流编辑器附带 AI”升级为“分析代理驱动的工作台”。

真正要对标的不是一个表单型侧边栏，而是具备以下特征的 agent 产品体验：

- 聊天式任务入口
- 流式执行可见性
- 工具调用透明
- 思考块折叠化
- 执行现场与最终交付物并存

实施上，建议直接抛弃当前“右侧 AI 抽屉”的主承载定位，转为左侧主 workspace + 右侧执行区的新布局。这样才能让现有工作流系统、结果协议、执行链路与 agent 体验真正融合，而不是继续互相妥协。
