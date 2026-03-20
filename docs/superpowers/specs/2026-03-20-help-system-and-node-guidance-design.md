# 工作流帮助中心与节点帮助体系设计

## 背景

当前项目已经具备较完整的工作流编辑、节点配置、执行与结果预览能力，但新用户第一次进入系统时，仍然需要自行理解以下内容：

- 工作流应该按什么顺序搭建
- 各类节点分别负责什么
- 节点之间为什么能连或不能连
- 某个节点的参数该怎么配置
- 当前节点输出后下一步应该接什么

现有系统中虽然有以下零散说明能力：

- 节点卡片中的简短 `description`
- 属性级别的 `description` tooltip
- 两份工作流文档 `工作流系统.md` 与 `工作流节点说明.md`

但这些信息目前存在几个问题：

1. 入口分散，用户必须自己猜该去哪里找说明。
2. 首页缺少“3 分钟上手”的最短路径，第一次使用成本高。
3. 节点级帮助只覆盖单个字段 tooltip，无法解释“这个节点整体怎么用”。
4. 帮助内容没有统一挂载到节点定义层，后续新增节点时容易漏。
5. 未来如果要支持 LLM 自动创建节点和工作流，现有帮助内容缺乏结构化语义，模型难以稳定复用。

本次设计目标是在不重做主工作流结构的前提下，新增一套轻量但系统的帮助体系，既改善人工用户上手体验，也为未来 LLM 自动编排能力提供可复用的知识层。

## 目标

### 业务目标

- 为首次进入系统的用户提供固定模板的“3 分钟上手”路径。
- 为每个节点提供统一、可维护的“节点使用帮助”说明。
- 让用户在顶部入口和节点配置弹窗中都能快速获得帮助，不需要跳出当前工作流上下文。
- 将帮助内容沉淀为可复用的数据结构，后续新增节点时默认补齐。
- 为未来“LLM 自动创建节点、自动生成工作流、自动补参数”提供结构化帮助语义。

### 产品目标

- 采用轻量帮助，而非长教程或重引导。
- 全局帮助中心首页第一屏固定展示“最短上手流程”。
- 节点帮助优先贴近配置场景展示，而不是放到用户不易触达的独立页面。
- 帮助内容全部使用中文，保持当前项目文案一致性。

### 技术目标

- 将节点帮助数据挂到 `NodeDefinition` 层统一维护。
- 将全局帮助中心内容做成可渲染、可测试、可扩展的配置结构。
- UI 只负责消费帮助数据，不在组件中硬编码节点帮助映射表。
- 将“面向人类的帮助”和“面向 LLM 的结构化提示”明确分层。

## 非目标

本次设计不处理以下内容：

- 不实现复杂的新手引导气泡、遮罩式 Walkthrough。
- 不实现根据当前画布状态动态变化的“下一步推荐”。
- 不重做节点库、画布和配置弹窗的整体视觉架构。
- 不直接实现 LLM 自动建流功能，本轮只为其准备可复用帮助数据。
- 不将现有两份 Markdown 文档直接嵌入前端作为在线帮助正文。

## 已确认的设计结论

基于本轮设计讨论，已确认以下约束：

1. 帮助体系同时解决两类问题：
   - 新手第一次上手不会用
   - 用户配节点时看不懂参数和连接规则
2. 帮助深度采用“3 分钟能上手的轻量帮助”，不做长教程。
3. 全局结构采用：
   - 顶部帮助中心入口
   - 节点配置弹窗内嵌帮助
4. 帮助中心首页第一屏优先展示“最短上手流程”。
5. “最短上手流程”采用固定 3 步模板，不做动态提示。
6. 总体方案采用“帮助中心 + 节点帮助”双层结构。
7. 帮助内容需兼容未来 LLM 自动创建节点与工作流能力。

## 总体方案

本次采用“全局帮助中心 + 节点内嵌帮助 + 结构化提示层”的三层方案。

### 第一层：全局帮助中心

入口位于顶部 `WorkflowHeader`，用于提供系统级帮助内容。该入口解决“我第一次进来应该怎么开始”的问题。

帮助中心首页结构：

1. 第一屏：`3 分钟上手`
2. 第二屏：`常见问题`
3. 第三屏：`节点分类索引`

### 第二层：节点内嵌帮助

入口位于 `NodeConfigModal` 内，与参数设置紧邻展示。该层解决“当前节点具体怎么用”的问题。

节点帮助覆盖：

- 这个节点做什么
- 什么时候用
- 需要什么输入
- 关键参数说明
- 输出结果与下一步
- 常见问题

### 第三层：结构化提示层

帮助数据不仅给用户看，也同时为未来 LLM 自动建节点、自动建工作流、自动补参数提供机器可消费语义。

该层不直接面向终端用户展示，但必须与人类帮助同源维护，避免出现两套知识体系。

## 信息架构设计

## 1. 全局帮助中心

### 1.1 入口位置

帮助中心入口放在 `WorkflowHeader.vue` 的右侧工具栏，与“新建 / 保存 / 文件”同层级，作为稳定入口存在。

选择该位置的原因：

- 入口可见性高，适合承载系统级帮助
- 不影响当前节点库与画布主区域
- 不依赖用户先打开节点配置弹窗
- 与当前操作流兼容，不需要重构画布布局

### 1.2 打开形式

帮助中心采用独立弹窗，不跳转页面。

原因：

- 保持用户仍在当前工作流上下文内
- 可随时打开与关闭，不打断当前编辑状态
- 与当前 `WorkflowHeader` 和 `NodeConfigModal` 的交互方式一致
- 更适合首期固定内容展示，不需要为了侧边占位改动主布局

首期明确采用 PrimeVue `Dialog` 实现，不再保留抽屉式分叉方案

### 1.3 首页结构

帮助中心首页第一屏固定展示“3 分钟上手”。

固定模板如下：

1. 第 1 步：导入数据
   - 目标：先得到可分析的表格数据
   - 推荐节点：`file-import`、`manual-json-import`
   - 常见误区：导入后直接分析，未检查字段格式

2. 第 2 步：数据准备
   - 目标：完成清洗、筛选、聚合或合并
   - 推荐节点：`data-cleaning`、`data-filter`、`data-aggregation`、`data-merge`
   - 常见误区：多源数据未对齐字段或关联键

3. 第 3 步：分析输出
   - 目标：产出相关性结果、图表或导出文件
   - 推荐节点：`pearson`、`spearman`、`kendall`、`lasso`、`xgboost-shap`、`chart-display`、`data-export`
   - 常见误区：终端节点前输入类型不匹配

### 1.4 常见问题区

首期建议覆盖以下高频问题：

- 为什么节点连不上
- 为什么节点没有输出
- 什么情况下用 Pearson / Spearman / Kendall
- 什么时候需要先做数据清洗
- 多个数据源什么时候用数据合并

### 1.5 节点分类索引

按当前系统分类展示：

- 数据接入（trigger）
- 数据准备（action）
- 分析输出（terminal）

节点分类索引不做复杂搜索系统，首期只需支持浏览与点击查看摘要。

摘要来源统一复用 `NodeDefinition.help.summary`。

点击节点后的展示方式也不单独维护第二套文案，而是在帮助中心弹窗内部切换到节点详情视图，直接展示与 `NodeConfigModal` 中同源的 `NodeHelpDoc` 内容。这样帮助中心与节点配置弹窗只维护一份节点帮助数据。

## 2. 节点内嵌帮助

### 2.1 展示位置

节点帮助不单独做成第三个主 Tab，而是放在节点配置区内，与“参数设置”紧邻展示。

推荐方式：

- 在参数区顶部增加“使用帮助”信息卡
- 支持折叠/展开
- 默认展开摘要，减少首次理解成本

不推荐单独 Tab 的原因：

- 用户配置参数时最需要帮助
- 额外切换 Tab 会降低帮助实际使用率
- 节点帮助与参数阅读有强上下文关系，应尽量贴近

### 2.2 节点帮助模块结构

每个节点帮助区统一展示以下模块：

1. `节点用途`
2. `适用场景`
3. `输入要求`
4. `关键参数`
5. `输出与下一步`
6. `常见问题`

首期原则：

- 每个模块内容短小、直接
- 控制在用户 30 秒内可扫读完成
- 保留结构一致性，避免每个节点样式和顺序不同

### 2.3 属性级帮助

现有属性级 `description` tooltip 继续保留，用于解释单字段含义。

新的节点级帮助补足的是整体说明，二者职责分工如下：

- `property.description`：解释“这个字段是什么意思”
- `node.help`：解释“这个节点整体怎么用”

## 帮助数据模型设计

帮助体系必须建立统一数据源，不能将文案散落在组件中。

### 1. 节点定义新增 `help`

在 `NodeDefinition` 上新增 `help` 字段，面向用户展示。

建议结构：

```ts
interface NodeHelpDoc {
  summary: string
  whenToUse: string[]
  inputGuide: string[]
  parameterGuide?: Array<{
    property: string
    title: string
    content: string
  }>
  outputGuide: string[]
  nextSteps?: string[]
  commonIssues?: Array<{
    title: string
    resolution: string
  }>
}
```

语义说明：

- `summary`：一句话解释节点用途
- `whenToUse`：这个节点适用于哪些场景
- `inputGuide`：推荐输入、前置节点、连接要求
- `parameterGuide`：关键参数的进一步解释，补充字段 tooltip 不足
- `outputGuide`：会输出什么结果
- `nextSteps`：通常建议接什么节点
- `commonIssues`：高频误配与排查建议

### 2. 节点定义新增 `assistantHints`

在 `NodeDefinition` 上新增 `assistantHints` 字段，面向未来 LLM 使用。

建议结构：

```ts
interface NodeAssistantHints {
  useCases: string[]
  keywords: string[]
  workflowRoles: string[]
  inputKinds?: string[]
  outputKinds?: string[]
  requiredConfig?: string[]
  recommendedConfigPatterns?: string[]
  commonMistakes?: string[]
  recommendedPrevNodes?: string[]
  recommendedNextNodes?: string[]
}
```

语义说明：

- `useCases`：节点适合解决的问题
- `keywords`：便于检索的关键词和同义表达
- `workflowRoles`：在工作流中的角色，例如“数据入口”“数据准备”“分析终点”
- `inputKinds/outputKinds`：帮助未来 LLM 判断链路可连接性
- `requiredConfig`：必须补齐的配置项
- `recommendedConfigPatterns`：常见配置模板
- `commonMistakes`：帮助模型在失败后自纠
- `recommendedPrevNodes/recommendedNextNodes`：帮助模型推断前后连接关系

### 3. 全局帮助中心配置

帮助中心首页内容不应写死在组件模板中，而应独立成配置数据。

建议结构：

```ts
interface HelpCenterContent {
  quickStart: Array<{
    step: number
    title: string
    goal: string
    recommendedNodes: string[]
    pitfalls: string[]
  }>
  faqs: Array<{
    question: string
    answer: string
  }>
  categories: Array<{
    id: 'trigger' | 'action' | 'terminal'
    title: string
    description: string
  }>
}
```

该配置同时可被前端帮助中心与未来 LLM 流程模板读取。

## 面向未来 LLM 自动建节点/工作流的兼容设计

帮助体系不仅用于展示，还应作为未来自动编排能力的知识底座。

### 1. 设计原则

1. 人类帮助和机器帮助同源维护
2. 机器语义结构化，不依赖自由文本猜测
3. 节点能力、输入输出与推荐前后关系可被直接读取
4. 固定 3 步上手模板可直接转化为工作流骨架模板

### 2. LLM 可复用方式

未来若实现“自动创建节点 / 自动生成工作流”，模型可按以下方式消费帮助数据：

1. 根据 `assistantHints.useCases + keywords` 做节点召回
2. 根据 `workflowRoles` 决定节点在流程中的位置
3. 根据 `inputKinds / outputKinds` 验证上下游是否可接
4. 根据 `requiredConfig` 判断缺失参数是否需要追问用户
5. 根据 `recommendedConfigPatterns` 自动补默认配置
6. 根据 `commonMistakes` 在失败后执行自纠错
7. 根据 `recommendedPrevNodes / recommendedNextNodes` 组装更稳定的工作流骨架

### 3. 固定 3 步模板的机器价值

本次确认“最短上手流程”为固定模板而非动态提示，这一决定同时降低了未来 LLM 复用成本。

LLM 可将其直接视为标准分析流程骨架：

1. 数据导入
2. 数据准备
3. 分析输出

然后再根据用户意图替换对应节点，而不是从零拼装。

### 4. 首期不做但需要保留的数据边界

本轮不直接实现以下能力，但设计中必须预留：

- 根据用户自然语言意图检索节点
- 自动补全工作流最短路径
- 自动检测当前工作流缺失的关键步骤
- 根据节点帮助自动生成参数表单解释

为此，帮助数据结构应避免只写展示性文案，而要同时保留结构化字段。

## 首期 UI 设计边界

### 1. 帮助中心首期只做三块

1. `3 分钟上手`
2. `常见问题`
3. `节点分类索引`

不做：

- 全量搜索
- 多级目录树
- 视频教程
- 富媒体示例库

### 2. 节点帮助字段约束

首期对现有全部节点统一要求最小帮助集，以下字段为必备：

- `help.summary`
- `help.whenToUse`
- `help.inputGuide`
- `help.outputGuide`

以下字段首期允许按节点复杂度补充，不作为所有节点的必填：

- `help.parameterGuide`
- `help.nextSteps`
- `help.commonIssues`

`assistantHints` 的首期口径如下：

- 对现有全部节点：类型层允许缺省，但不影响 UI 渲染
- 对首期重点覆盖节点：必须补齐最小集
  - `useCases`
  - `keywords`
  - `workflowRoles`
  - `recommendedPrevNodes`
  - `recommendedNextNodes`
- 对该功能上线后新增的节点：`help` 最小集和 `assistantHints` 最小集都视为定义必填项

首期重点覆盖并补齐完整帮助的代表性节点：

- `file-import`
- `manual-json-import`
- `data-cleaning`
- `data-merge`
- `pearson`
- `chart-display`
- `data-export`

### 3. 缺省策略

如果某节点帮助内容缺失，UI 必须安全降级：

- 显示节点基础 `description`
- 显示“该节点帮助正在补充中”
- 不得导致弹窗空白、报错或布局错乱

如果帮助中心静态配置缺失、结构异常或运行时读取失败，帮助中心必须统一降级为：

- 保留弹窗主体可打开与可关闭
- 用兜底文案替代异常区块，例如“帮助内容加载失败，请稍后重试”
- 不影响其他已成功加载的帮助区块显示

如果当前节点定义不存在，例如 `NodeConfigModal` 找不到 `nodeDefinition`，节点帮助区必须：

- 显示“未找到节点定义，暂时无法展示帮助”
- 不影响参数区、输入输出预览区和关闭操作

## 组件与文件修改建议

### 新增文件

- `src/help/content.ts`
- `src/help/types.ts`
- `src/components/workflow/HelpCenterModal.vue`
- `src/components/workflow/help/QuickStartGuide.vue`
- `src/components/workflow/help/NodeHelpPanel.vue`

### 重点修改文件

- `src/nodes/types.ts`
- `src/nodes/registry.ts`
- `src/nodes/definitions/*.ts`
- `src/components/workflow/WorkflowHeader.vue`
- `src/components/workflow/NodeConfigModal.vue`
- `src/components/workflow/config/ConfigForm.vue`
- `src/components/workflow/__tests__/WorkflowHeader.spec.ts`
- `src/components/workflow/__tests__/NodeConfigModal.spec.ts`
- `src/components/workflow/__tests__/uiCopy.spec.ts`

## 测试与验证策略

### 1. 组件层验证

至少覆盖：

- 点击顶部帮助按钮可打开帮助中心弹窗
- 帮助中心默认展示“3 分钟上手”
- 节点分类索引中的节点摘要复用 `NodeDefinition.help.summary`
- 点击分类索引中的节点后，帮助中心详情与 `NodeConfigModal` 读取同一份 `NodeHelpDoc`
- 节点配置弹窗能根据当前节点渲染对应帮助内容
- 节点帮助缺失时显示安全降级内容
- 找不到当前节点定义时显示统一兜底文案

### 2. 数据层验证

至少覆盖：

- 节点定义新增 `help` 与 `assistantHints` 后，注册表仍可正常消费
- 帮助中心内容配置结构完整
- 帮助中心静态配置缺失或结构异常时能安全降级
- 节点帮助与属性帮助不会互相冲突

### 3. 代表节点回归

至少对以下节点增加帮助渲染断言：

- `file-import`
- `data-cleaning`
- `data-merge`
- `pearson`

### 4. 完整验证命令

本轮帮助体系实施完成后，默认至少执行：

- `pnpm test:unit`
- `pnpm build`

## 文档同步要求

本次实现会影响工作流使用说明与节点规范，需同步更新以下文档：

- `工作流系统.md`
  - 补充帮助中心入口、帮助体系定位、用户上手路径说明
- `工作流节点说明.md`
  - 补充节点帮助字段规范
  - 补充 `assistantHints` 的维护约束
  - 补充新增节点时必须同步填写帮助信息的规则

如果最终准备提交代码，还需按仓库约束同步更新 `CHANGELOG.md`。

## 实施顺序建议

### 阶段 1：类型与帮助数据骨架

1. 为帮助中心与节点帮助新增类型定义
2. 为 `NodeDefinition` 扩展 `help` 与 `assistantHints`
3. 先补代表节点的帮助数据

### 阶段 2：全局帮助中心

1. 新增帮助中心弹窗
2. 接入顶部帮助入口
3. 打通快速开始、FAQ、节点分类索引三块内容

### 阶段 3：节点内嵌帮助

1. 在节点配置弹窗中加入帮助区
2. 将帮助区与当前节点定义打通
3. 加入帮助缺失时的降级展示

### 阶段 4：测试与文档

1. 增加帮助相关组件测试
2. 更新工作流系统文档与节点说明文档
3. 跑单测与构建验证

## 风险与缓解

### 风险 1：帮助内容写散，后续难维护

缓解：

- 所有节点帮助统一挂到 `NodeDefinition`
- 禁止在 Vue 组件中硬编码节点帮助映射

### 风险 2：帮助内容过长，反而影响使用

缓解：

- 严格采用轻量帮助
- 首期所有帮助以摘要为主，控制阅读长度

### 风险 3：为 LLM 预留的字段与 UI 文案耦合

缓解：

- `help` 和 `assistantHints` 明确分层
- 前端 UI 仅消费 `help`
- 未来自动建流能力优先消费 `assistantHints`

### 风险 4：节点帮助覆盖口径不一致导致实现标准模糊

缓解：

- 现有全部节点必须补齐 `help` 最小集
- 首期重点节点必须额外补齐完整帮助和 `assistantHints` 最小集
- 未补齐增强内容的节点必须有安全降级
- 后续新增节点时把 `help` 最小集和 `assistantHints` 最小集都作为定义必填项

## 最终结论

本次帮助体系采用以下路线：

- 顶部新增全局帮助中心
- 帮助中心首页首屏固定展示“3 分钟上手”
- 节点配置弹窗内嵌节点帮助区
- 帮助内容统一挂到 `NodeDefinition`
- 同时新增面向未来 LLM 自动编排的 `assistantHints`

该方案兼顾以下三点：

1. 对当前用户足够轻量，能直接改善上手与配节点体验
2. 对当前代码结构侵入可控，不需要重做画布主架构
3. 对未来 LLM 自动建节点和工作流具备明确复用价值

