# 工作流 AI Tool-first 编排设计

## 背景

当前工作流 AI 编排已经具备以下能力：

- 两阶段编排：先生成最小骨架，再补最小运行配置
- 流式观测：前端可查看实时进度、实时输出与诊断
- 自动修复重试：首轮输出不合法时可定向修复
- 最终安全闸：计划仍需经过校验并由前端应用到画布

当前实现的主要问题仍然集中在“模型需要一次性做太多事情”：

- 需要同时理解用户意图、节点能力、连接规则和配置约束
- 缺少真实字段事实时，只能硬猜字段名和目标变量
- 失败恢复仍偏向“整轮重生成”，不擅长局部修补
- `assistantHints` 目前主要服务于提示词和节点推荐，还没有升级为编排级知识

本设计目标不是把 AI 编排做成跨系统代理，而是在当前应用内部，把 AI 编排升级成“应用内 tool-first 编排器”。

## 设计目标

- AI 编排主链全部使用应用内受控 tools，不引入 MCP
- AI 优先构建草稿工作流，再生成最终 `WorkflowAiPlan`
- AI 在编排阶段可以读取“AI 专用摘要”，但不复用 `data-profiling` 节点
- AI 专用摘要支持“读缓存”和“必要时临时执行上游链路”
- 继续保留当前 `plan -> validate -> apply` 的最终安全边界
- 优先提升常见场景的稳定性，而不是追求一次性生成最复杂工作流

## 非目标

- 不把工作流 AI 编排改造成跨系统 MCP 网络
- 不让 AI 直接操作真实画布
- 不在编排阶段读取全量原始数据
- 不让 AI 编排直接写执行历史、节点正式输出或结果面板
- 不复用 `data-profiling` 节点承担 AI 摘要能力

## 总体方案

### 1. 分层结构

工作流 AI 编排升级为 5 层：

1. 意图层
   - 解析用户需求
   - 判断是创建还是编辑
   - 识别明显缺失信息

2. 配方层
   - 召回与需求最匹配的 `recipe`
   - 给出最小可运行骨架
   - 约束常见节点组合

3. 工具编排层
   - 模型通过应用内 tools 获取事实和修改草稿
   - 不直接输出完整 plan 作为唯一中间态

4. 草稿层
   - 所有 AI 改动先落到 `AiDraftGraph`
   - 与真实画布完全隔离

5. 安全应用层
   - 把草稿转换成现有 `WorkflowAiPlan`
   - 复用现有 plan 校验和应用链路

### 2. 总体链路

建议编排流程为：

1. 读取当前工作流上下文
2. 召回候选 recipe
3. 按 recipe 选择骨架节点
4. 读取节点定义和约束
5. 在草稿图上创建或修改节点
6. 读取真实上游字段摘要
7. 补充关键配置
8. 校验草稿
9. 追问或 finalize 成最终 plan

## Tool-first 设计

### 1. 总原则

- tool 数量少而硬
- 所有 tool 返回统一结构
- 模型只能操作草稿，不直接操作真实画布
- 数据读取只返回压缩摘要，不返回全量数据

### 2. 统一返回结构

```ts
type AiToolResult<T = unknown> = {
  ok: boolean
  message: string
  data?: T
  issues?: Array<{
    code: string
    message: string
    level: 'info' | 'warn' | 'error'
  }>
  suggestedNextTools?: string[]
}
```

### 3. 第一批 tools

第一期建议只开放以下 9 个 tools：

1. `get_workflow_context`
   - 读取当前画布上下文
   - 主要用于 `edit` 模式

2. `search_recipes`
   - 根据 prompt 召回编排 recipe

3. `search_nodes`
   - 根据意图、recipe 和上下文召回候选节点

4. `get_node_definition`
   - 读取节点硬约束、必填配置、推荐上下游和常见误用

5. `inspect_upstream_schema`
   - 读取 AI 专用数据摘要
   - 支持缓存读取和必要时临时执行

6. `mutate_draft`
   - 唯一允许修改草稿图的 tool
   - 支持 create/update/connect/remove 等草稿操作

7. `validate_draft`
   - 对草稿做结构、配置和最终一致性校验

8. `ask_for_missing_info`
   - 结构化产出追问项，避免模型硬编配置

9. `finalize_plan`
   - 把草稿图转换成最终 `WorkflowAiPlan`

### 4. 调用顺序建议

建议模型的主调用路径尽量稳定：

1. `get_workflow_context`
2. `search_recipes`
3. `search_nodes`
4. `get_node_definition`
5. `mutate_draft`
6. `inspect_upstream_schema`
7. `mutate_draft`
8. `validate_draft`
9. `ask_for_missing_info` 或 `finalize_plan`

## Recipe 设计

### 1. 定位

`recipe` 是应用内的编排模板库，用于承载多节点组合经验。

它类似 skills 的“工作法”，但不是运行时技能系统，而是产品内的稳定知识层。

### 2. 职责边界

recipe 负责：

- 选择常见入口节点
- 给出最小可运行骨架
- 约束常见主链结构
- 识别阻塞信息
- 给出安全追问策略

recipe 不负责：

- 最终字段名
- 最终 target/factor
- 用户特定过滤条件
- 全部节点配置细节

### 3. 数据结构

```ts
type WorkflowRecipe = {
  id: string
  name: string
  description: string
  intentTags: string[]
  appliesToModes: Array<'create' | 'edit'>
  triggers: {
    keywords: string[]
    excludeKeywords?: string[]
  }
  minimalPattern: {
    nodes: string[]
    edges: Array<[string, string]>
  }
  preferredEntryNodes: string[]
  preferredActionNodes?: string[]
  preferredTerminalNodes: string[]
  optionalEnhancements?: string[]
  requiresSchemaInspection?: boolean
  blockingMissingInfo?: string[]
  safeQuestions?: string[]
  warnings?: string[]
}
```

### 4. 第一批 recipe

建议首批实现以下 6 到 8 个：

- `single-table-correlation`
- `single-table-regression`
- `xgboost-shap-analysis`
- `multi-source-merge-analysis`
- `neighbor-system-analysis`
- `data-export-flow`
- `quick-json-demo`

### 5. 与 assistantHints 的关系

- `assistantHints`：单节点知识
- `recipe`：多节点组合知识
- `search_nodes`：主要消费 `assistantHints`
- `search_recipes`：主要消费 `recipe`

不额外再维护一套重复的节点属性说明。

## AI 专用摘要能力

### 1. 定位

新增独立内部模块 `AiSchemaInspector`，仅服务于 AI 编排，不作为用户节点存在。

它的职责是：

- 读取真实节点输出或草稿分支输出
- 生成压缩后的字段结构摘要
- 辅助 AI 决定字段配置、目标变量和是否可继续分析

### 2. 约束

- 不复用 `data-profiling` 节点
- 不进入节点库
- 不写执行历史
- 不污染正式节点输出
- 不返回全量原始数据

### 3. 数据来源

支持三种来源：

1. 真实画布节点缓存
2. 真实画布节点临时执行
3. 草稿节点临时执行

### 4. 摘要结构

```ts
type AiColumnSummary = {
  name: string
  detectedType: 'number' | 'string' | 'boolean' | 'date' | 'unknown'
  semanticTags: string[]
  nullable: boolean
  nullRate: number
  uniqueCount?: number
  uniqueRate?: number
  isConstant?: boolean
  isLikelyId?: boolean
  isLikelyCategory?: boolean
  isLikelyTarget?: boolean
  isLikelyFeature?: boolean
  sampleValues: unknown[]
}

type AiSchemaSummary = {
  source: {
    kind: 'canvas-cache' | 'canvas-ephemeral-run' | 'draft-ephemeral-run'
    nodeRef: string
  }
  resultKind: 'table' | 'tableCollection' | 'json' | 'unknown'
  rowCount?: number
  columnCount?: number
  columns: AiColumnSummary[]
  summary: {
    numericColumns: string[]
    categoricalColumns: string[]
    datetimeColumns: string[]
    candidateTargetColumns: string[]
    candidateFeatureColumns: string[]
    blockedReasons: string[]
  }
}
```

### 5. 样本和值传输策略

- 每列最多返回 5 个样本值
- 优先去重后采样
- 长字符串截断
- 明显 ID 做掩码
- 不按行返回整表预览

### 6. 临时执行策略

建议新增无副作用执行通道，例如 `executeForAiInspection()`：

- 只执行获取摘要所需的最短链路
- 结果仅保留在内存
- 不写正式节点状态
- 不写执行历史
- 不刷新用户 UI 结果区

### 7. 首期能力边界

第一阶段建议只支持：

- `table` 摘要
- 缓存优先
- 必要时执行 trigger -> action 链拿摘要
- terminal 节点默认不做临时摘要

## 草稿图设计

### 1. 总原则

AI 只操作草稿图，不直接操作真实画布。

### 2. 数据结构

```ts
type AiDraftNode = {
  ref: string
  source: 'existing' | 'draft'
  existingNodeId?: string
  type: string
  label: string
  category: 'trigger' | 'action' | 'terminal'
  position?: { x: number; y: number }
  config: Record<string, unknown>
  status: 'clean' | 'added' | 'updated' | 'removed'
}

type AiDraftEdge = {
  ref: string
  sourceRef: string
  targetRef: string
  existingEdgeId?: string
  status: 'clean' | 'added' | 'removed'
}

type AiDraftGraph = {
  workflowName: string
  mode: 'create' | 'edit'
  nodes: AiDraftNode[]
  edges: AiDraftEdge[]
  assumptions: string[]
  warnings: string[]
  questions: string[]
}
```

### 3. 引用规则

- draft 内统一用 `ref`
- 现有节点：`existing:<nodeId>`
- 新增节点：`draft:<uuid>`

避免模型直接依赖真实 node id 生成细节。

### 4. Draft 与最终 plan 的关系

最终仍输出现有 `WorkflowAiPlan`：

- 新 draft 节点 -> `createNode`
- 现有节点配置改动 -> `updateNodeConfig`
- 现有节点改名 -> `renameNode`
- 现有节点删除 -> `removeNode`
- 新 draft 边 -> `connectNodes`
- 已有边删除 -> `disconnectEdge`
- 位置变化 -> `moveNode`

## 会话状态设计

### 1. 建议结构

```ts
type AiToolTraceItem = {
  id: string
  toolName: string
  startedAt: number
  finishedAt?: number
  inputSummary: string
  outputSummary: string
  status: 'success' | 'failed'
}

type AiMissingInfoItem = {
  key: string
  label: string
  reason: string
  blocking: boolean
  suggestions?: string[]
}

type AiSessionState = {
  sessionId: string
  mode: 'create' | 'edit'
  status: 'idle' | 'running' | 'waiting_user' | 'completed' | 'failed'
  prompt: string
  selectedRecipeId?: string
  draft: AiDraftGraph
  trace: AiToolTraceItem[]
  diagnostics: {
    issues: Array<{
      code: string
      message: string
      level: 'info' | 'warn' | 'error'
    }>
    lastFailedTool?: string
  }
  missingInfo: AiMissingInfoItem[]
  finalizedPlan?: WorkflowAiPlan
}
```

### 2. 状态机

- `idle`
- `running`
- `waiting_user`
- `completed`
- `failed`

### 3. 设计意义

- 替代当前单纯依赖 `streamStatus + raw output`
- 支持结构化追问与继续编排
- 支持工具轨迹展示

## 接口设计

### 1. 新增接口

建议新增会话化接口：

1. `POST /api/workflow-ai/session/start`
2. `POST /api/workflow-ai/session/:id/run`
3. `POST /api/workflow-ai/session/:id/input`
4. `GET /api/workflow-ai/session/:id`

### 2. 兼容接口

保留：

- `/api/workflow-ai/plan`
- `/api/workflow-ai/plan/stream`

作为兼容层，内部逐步封装成：

- start session
- run session
- finalize plan

### 3. 流式事件建议

建议事件结构从“文本增量优先”升级为“结构化轨迹优先”：

```ts
type WorkflowAiStreamEvent =
  | { type: 'started'; sessionId: string; message?: string }
  | { type: 'recipe_selected'; recipeId: string; recipeName: string; reason: string }
  | { type: 'tool_started'; toolName: string; traceId: string; summary: string }
  | { type: 'tool_completed'; toolName: string; traceId: string; summary: string }
  | { type: 'draft_updated'; draft: AiDraftGraph }
  | { type: 'missing_info'; items: AiMissingInfoItem[] }
  | { type: 'diagnostic'; diagnostics: WorkflowAiDiagnostics }
  | { type: 'completed'; plan: WorkflowAiPlan; draft: AiDraftGraph; diagnostics: WorkflowAiDiagnostics }
  | { type: 'failed'; message: string; diagnostics?: WorkflowAiDiagnostics }
```

`text_delta` 可保留，但只作为调试区展示，不再作为主体验核心。

## 前端改造

### 1. 面板定位

`WorkflowAiPanel` 从“模型输出面板”升级成“编排会话面板”。

### 2. 建议分区

保留现有顶部输入区，重构结果区为 5 块：

1. 当前策略
   - 当前状态
   - 当前 recipe
   - 当前结论

2. 草稿结构
   - 当前草稿节点和连线
   - 节点新增/修改/删除状态
   - 缺配置节点提示

3. 缺失信息
   - 阻塞项
   - 建议选项
   - 用户补充入口

4. 工具轨迹
   - 已调用 tools
   - 工具返回摘要
   - 当前失败点

5. 最终计划与诊断
   - summary
   - warnings
   - questions
   - 应用按钮

模型实时输出区域降级成折叠调试区。

## 文件落点

### 1. 新增文件

- `src/ai/recipes/types.ts`
- `src/ai/recipes/catalog.ts`
- `src/ai/recipes/search.ts`
- `src/ai/draft/types.ts`
- `src/ai/draft/graph.ts`
- `src/ai/schemaInspector/types.ts`
- `src/ai/schemaInspector/inspector.ts`
- `src/server/workflowAi/orchestrator.ts`
- `src/server/workflowAi/sessionStore.ts`
- `src/server/workflowAi/tools/index.ts`
- `src/server/workflowAi/tools/getWorkflowContext.ts`
- `src/server/workflowAi/tools/searchRecipes.ts`
- `src/server/workflowAi/tools/searchNodes.ts`
- `src/server/workflowAi/tools/getNodeDefinition.ts`
- `src/server/workflowAi/tools/inspectUpstreamSchema.ts`
- `src/server/workflowAi/tools/mutateDraft.ts`
- `src/server/workflowAi/tools/validateDraft.ts`
- `src/server/workflowAi/tools/finalizePlan.ts`

### 2. 改造文件

- `src/server/workflowAi/profiles.ts`
- `src/server/app.ts`
- `src/ai/types.ts`
- `src/stores/workflowAiStore.ts`
- `src/components/workflow/WorkflowAiPanel.vue`

## 实施阶段

### 当前实施状态（2026-03-30）

- 已完成：
  - `P1 配方层`
  - `P2 草稿层`
  - `P3 AI 专用摘要层`
  - `P4 Tool-first Orchestrator`
- 已落地能力：
  - recipe catalog / search 已接入现有 AI 编排
  - draft graph 已作为内部稳定中间层使用，并可回退为可编辑草案计划
  - AI 专用 schema inspector 已支持：
    - `table`
    - 可转表的 JSON 对象数组
    - 缓存优先的字段摘要
    - 前端本地“无副作用临时执行”补摘要
    - 服务端真实画布缓存直读
    - 服务端真实链路无副作用临时执行
    - 草稿分支无副作用临时执行
  - AI 编排已切到 session 化主链：
    - `POST /api/workflow-ai/session/start`
    - `POST /api/workflow-ai/session/:id/run`
    - `POST /api/workflow-ai/session/:id/input`
    - `GET /api/workflow-ai/session/:id`
  - 前端 `WorkflowAiPanel` 已升级为会话面板，能展示：
    - 当前策略
    - 草稿结构
    - 缺失信息
    - 工具轨迹
    - 应用内上下文
- 当前兼容策略：
  - 结构化 stream event 已作为主观测链路，旧的 `text_delta` 与两阶段计划生成链仍保留为兼容调试通道
  - session store 已切到文件持久化 + TTL 过期清理；若部署为多实例，共享能力取决于实例是否使用同一持久化文件路径
  - terminal 节点默认仍不直接参与临时摘要执行；默认策略是向上回溯到最近的可摘要非 terminal 节点

### 建议下一步

- 继续扩展服务端可无副作用执行的节点覆盖面，减少对浏览器专属触发器的降级提示
- 若后续需要真正跨实例共享 session，可把当前文件持久化层替换为数据库或集中式 KV
- 若后续需要更强模型可解释性，可继续把“模型输出计划”过渡为“模型显式 tool 调用序列”
### P1：配方层

目标：
- 让 AI 不再从零猜骨架

实现：
- 新增 recipe catalog / search
- 先接入现有 `profiles.ts`
- 继续保留当前 plan 生成主链

验收：
- 常见场景入口节点误选率下降
- 弱模型空计划减少

### P2：草稿层

目标：
- 把中间态从“模型直接吐 plan”升级成“先构建草稿”

实现：
- 新增 draft graph
- 新增 finalize 逻辑

验收：
- 支持局部修补
- 最终仍兼容现有 apply 流程

### P3：AI 专用摘要层

目标：
- 让 AI 基于真实字段摘要补配置

实现：
- 新增 inspector
- 支持缓存 + 临时执行

验收：
- 目标字段和因子字段配置更准
- 不污染正式执行状态

### P4：Tool-first Orchestrator

目标：
- 完成应用内 tool-first 编排主链

实现：
- 新增 orchestrator、tool registry、session route
- 前端切到 session 模型

验收：
- 结构化可观测
- 支持追问与继续编排
- 模型主要通过 tools 构图

## 风险点

- 现有执行链副作用较重，临时执行摘要可能污染正式状态
- draft ref 与真实节点 id 转换易出错
- schema 摘要如果过大，仍会造成上下文膨胀
- 流式事件过多会增加前端状态复杂度
- tool 数量如果继续扩张，模型调用路径会变差

## 关键约束

- 用户可见文案保持中文
- 不引入 MCP 作为主链
- AI 编排主链全部基于应用内 tools
- AI 专用摘要与用户工作流节点执行解耦
- 最终仍以 `WorkflowAiPlan -> validate -> apply` 为安全边界

## 结论

最优方向不是继续堆提示词，也不是引入 MCP，而是：

把当前“弱模型两阶段 JSON 编排”升级为“recipe 驱动 + draft 中间态 + AI 专用摘要 + 应用内 tool-first 编排”。

这条路径最符合当前项目现状：

- 已有稳定的节点定义和 plan 校验链
- 已有丰富的 `assistantHints`
- 已有两阶段和流式诊断能力
- 现有前端入口和应用链路都可继续复用

建议先从 P1 配方层开始落地，再逐步升级到完整 tool-first 架构。
