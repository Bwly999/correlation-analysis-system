# P1 多源合并与多输入工作流设计

## 目标

在现有 n8n 风格工作流编辑器中补齐 P1.3 和 P1.4：
- 支持多个起始数据源同时存在
- 支持多输入节点执行模型
- 新增 `append` 与 `object merge` 节点
- 提供多源连接规则校验、合并前依赖检查、合并诊断和基础字段血缘
- 为后续图表节点扩充保留统一的多输入协议

## 当前约束

- `workflowStore.executeNode` 会收集所有入边，但只把 `inputs[0]` 传给节点，实际仍是单输入模型。
- 连接规则只按 `trigger / action / terminal` 分类校验，无法表达“是否允许多输入”“是否允许多个 trigger”。
- `NodeConfigModal` 输入预览只消费第一条上游边。
- 节点定义层没有输入能力声明，导致后续多输入节点无法统一扩展。

## 方案选择

采用“声明式多输入方案”：
- 在节点定义中声明输入能力，而不是让节点直接依赖 store 扫描图结构
- 在 store 中统一完成上游输入收集、顺序编排、依赖校验和执行分发
- `append` 和 `object merge` 作为第一批多输入节点落地

不采用一次性全量引擎重构；第一版不引入拓扑调度器、具名端口系统和全局字段血缘图。

## 架构设计

### 1. 节点声明层

扩展 `src/nodes/types.ts`：
- 为 `NodeDefinition` 增加输入能力描述
- 建议字段：
  - `inputMode: 'single' | 'multiple'`
  - `minInputs?: number`
  - `maxInputs?: number | null`
  - `requiresTabularInput?: boolean`

默认行为：
- 现有节点默认 `inputMode: 'single'`
- `append` 与 `object merge` 声明 `inputMode: 'multiple'`，`minInputs: 2`

### 2. 执行输入协议

保留单输入兼容，新增统一多输入结构：

```ts
type SingleDataset = {
  data?: Record<string, unknown>[]
  stats?: Record<string, unknown>
  charts?: unknown[]
  diagnostics?: unknown
  lineage?: unknown
  [key: string]: unknown
}

type MultiNodeExecutionInput = {
  inputs: Array<{
    sourceNodeId: string
    sourceNodeLabel: string
    edgeId: string
    order: number
    payload: SingleDataset | null
  }>
}
```

执行分发规则：
- 单输入节点收到原有单输入 payload
- 多输入节点收到 `MultiNodeExecutionInput`

### 3. 图与连接规则

连接规则分两级：

- 类别级：
  - `trigger -> action | terminal`
  - `action -> action | terminal`
  - `terminal -> none`

- 能力级：
  - 单输入节点最多 1 条入边
  - 多输入节点允许多条入边，但不得超过 `maxInputs`
  - 多 trigger 被允许存在
  - 多 trigger 只能流向合法多输入节点或各自独立终点

### 4. 执行引擎

在 `workflowStore` 中改造：
- 收集目标节点全部入边
- 按稳定顺序组织输入列表
- 在执行前做输入数校验
- 输出诊断：
  - 缺少输入
  - 上游不是表格型数据
  - 合并键缺失
  - 字段冲突

第一版仍保持串行 `await` 执行，不做真正并发调度。

### 5. 节点设计

#### `append`

用途：
- 将多个上游表格数据按行追加

配置：
- `alignFieldsMode`: `union | intersection`
- `fillMissingValue`: `null | empty_string`
- `addSourceTag`: boolean
- `sourceTagName`: string

输出：
- `data`
- `stats`
- `diagnostics.warnings`
- `lineage.fields`

#### `object merge`

用途：
- 按键横向合并多个上游表格数据

配置：
- `joinType`: `left | inner | full`
- `baseJoinKey`: string
- `perInputJoinKeys`: collection
- `conflictStrategy`: `prefer_first | prefer_last | suffix`
- `suffixMode`: `source_label | source_index`
- `dropDuplicateKeyFields`: boolean

输出：
- `data`
- `stats`
- `diagnostics`
- `lineage.fields`

### 6. 交互设计

第一版交互只做必要表达：
- 多输入节点在节点卡片中显示“多输入”标识
- 单输入节点接第二条边时直接阻止并提示
- 多输入节点在配置面板中展示：
  - 上游输入列表
  - 每路输入的行数、字段数
  - 合并前诊断摘要
- `NodeConfigModal` 输入预览支持多输入摘要而不是只显示第一路输入

### 7. 字段血缘

先做轻量版：
- 在合并节点输出中记录字段来源
- 用于结果诊断和后续图表节点复用
- 不在本次范围内绘制全局血缘图

## 错误处理

- 输入数不足：节点报错并在日志中显示中文提示
- 输入 payload 非表格数据：报错
- merge 键缺失：报错或进入诊断，取决于配置
- 重复键、字段冲突：进入 `diagnostics`

## 测试策略

新增测试覆盖：
- 连接规则：允许多 trigger、限制单输入多入边、允许多输入节点多入边
- 执行引擎：多输入节点收到完整输入数组
- `append`：
  - 并集对齐
  - 交集对齐
  - 来源标记
- `object merge`：
  - left / inner / full
  - 冲突策略
  - 重复键诊断
- 配置面板多输入预览的基础渲染逻辑

## 分阶段交付

1. 扩展节点定义和执行输入协议
2. 改造 store 连接规则与执行逻辑
3. 实现 `append`
4. 实现 `object merge`
5. 补齐多输入节点 UI 和配置预览
6. 完成单测和回归验证

## 非目标

本次不做：
- 完整拓扑执行器
- 分支级调试器
- 命名端口拖拽连线
- 全局字段血缘图
- 多输入图表节点实现
