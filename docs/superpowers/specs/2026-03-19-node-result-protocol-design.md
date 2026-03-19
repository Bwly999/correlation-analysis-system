# 节点结果协议与预览体系重构设计

## 背景

当前工作流系统已经具备较好的声明式节点配置能力、递归执行链路和基础数据预览能力，但节点间数据传递与预览渲染主要依赖隐式约定：

- 表格型结果通常约定为 `{ data: [] }`
- 多输入节点通常约定为 `{ inputs: [...] }`
- 终端节点通常约定 `viewType = report | chart | export`
- 上游字段推断主要依赖样本首行键名

这套方案在“表格数据 + 统计分析 + 图表/报告/导出”范围内够用，但随着节点数量和数据形态增长，会出现以下问题：

1. 节点输出没有正式契约，扩展新节点时只能靠约定猜测。
2. 预览层与具体数据结构耦合严重，新增预览器需要改主流程分发逻辑。
3. 配置层字段选择依赖样本数据，空数据、异构数据、分页数据、文件结果都不稳定。
4. 历史记录与持久化默认假设输出含 `data` 数组，难以支持更丰富的数据类型。
5. 当前只有 `single | multiple` 的输入模式，没有正式的端口与结果种类约束，后续多输出和复合节点会受限。

本次重构目标是在不改变产品核心交互模型的前提下，建立统一节点结果协议、标准预览注册体系、可扩展 schema 机制与稳定的运行时输入输出模型，并最终迁移全部现有节点。

## 目标

### 业务目标

- 支持后续新增更多数据处理与分析节点，而不需要反复修改执行层约定。
- 支持更多数据形态：表格、表格集合、图表、报告、文件、纯 JSON、自定义结构等。
- 支持可插拔预览器：新增一种结果展示方式时，不再改主弹窗分发逻辑。
- 支持更稳定的字段推断、默认图表配置和节点参数选项生成。
- 为后续的多输出节点、复合节点、条件节点和端口语义扩展打基础。

### 技术目标

- 将 `execute(input: any, config: any) => any` 升级为统一 `NodeResult` 协议。
- 在执行引擎层建立统一的结果校验、归一化和快照序列化机制。
- 将 viewer 分发从 `viewType + if/else` 改为 registry 模式。
- 将 schema 作为字段推断的优先来源，样本推断只做兜底。
- 将现有所有节点迁移到新协议并补齐测试。

## 非目标

本次重构不处理以下内容：

- 不引入新的调度模型，仍保持当前递归执行方式。
- 不引入复杂的拖拽命名端口 UI。
- 不一次性实现条件分支节点、并发节点、缓存节点等新业务节点。
- 不重做当前工作流画布与整体视觉风格。
- 不在本轮直接引入后端统一数据协议；后端仍由节点自行适配。

## 当前问题分析

### 1. 节点定义过薄

当前 `src/nodes/types.ts` 中的 `NodeDefinition` 只声明了：

- 基本元信息
- 参数 `properties`
- `inputMode`
- `execute(input, config)`

存在的问题：

- 输入输出没有强类型。
- 节点可接收什么数据、产出什么数据没有声明。
- 运行时只能通过节点实现和 UI 逻辑自己猜测。

### 2. 结果对象没有统一信封

当前节点返回结果形态分散，例如：

- 导入和处理节点返回 `{ data, stats, ... }`
- 分析报告节点返回 `{ viewType: 'report', report, metrics }`
- 图表节点返回 `{ viewType: 'chart', chartOption }`
- 导出节点返回 `{ viewType: 'export', exportInfo }`

这导致：

- 预览层需要理解很多私有结构。
- 历史保存逻辑无法按类型处理，只能写特殊分支。
- 下游节点不知道上游结果里的哪些字段是业务数据，哪些字段是预览元数据。

### 3. 预览分发与结构耦合

当前 `DataAnalysisModal` 的分发逻辑为：

- `viewType === 'report'` -> `ReportViewer`
- `viewType === 'chart'` -> `ChartViewer`
- `viewType === 'export'` -> `ExportViewer`
- 否则 fallback 到 `DataChart`

这会导致：

- 新增 viewer 要改主弹窗。
- 节点作者必须知道具体 viewer 的内部约定。
- 普通数据结果与终端结果被混合处理。

### 4. schema 缺失导致字段推断脆弱

`NodeConfigModal` 和 `PropertyField` 里的 `useUpstreamFactors` 现在主要根据：

- `data.data[0]`
- 数组首元素
- 手工 JSON 输入解析结果

来推断字段名。

这样在以下情况下不稳定：

- 数据为空
- 数据按页/按块返回
- 结果不是表格而是文件、图表、报告
- 表格集合中不同分组字段不一致
- 行级结构异构

### 5. 历史记录快照逻辑过于表格化

当前执行历史仅对 `output.data` 做长度截断，这说明历史层默认所有大型结果都含 `data` 数组。该逻辑无法自然支持：

- 文件结果
- 图片结果
- 图表结果
- 富报告结果
- 自定义结果

## 重构总方案

### 核心原则

1. 节点只负责产出“标准结果”，不再让 UI 猜测结构。
2. 业务数据、展示建议、统计信息、血缘信息分层表达。
3. viewer 注册中心负责把结果映射到具体展示组件。
4. schema 是字段选择、预览和默认分析行为的首选依据。
5. store 统一管理结果流转、校验、序列化和历史快照。

## 新协议设计

### 1. 数据种类

新增 `DataKind`，用于描述结果的主语义：

```ts
type DataKind =
  | 'table'
  | 'tableCollection'
  | 'report'
  | 'chart'
  | 'file'
  | 'json'
  | 'scalar'
  | 'matrix'
  | 'timeseries'
  | 'custom'
```

第一阶段实际落地至少覆盖：

- `table`
- `tableCollection`
- `report`
- `chart`
- `file`
- `json`
- `scalar`

预留 `matrix`、`timeseries`、`custom` 供后续扩展。

### 2. 字段 schema

新增 `FieldSchema` 和 `NodeSchema`：

```ts
interface FieldSchema {
  name: string
  type: 'number' | 'string' | 'boolean' | 'date' | 'json' | 'unknown'
  nullable?: boolean
  label?: string
}

interface NodeSchema {
  fields?: FieldSchema[]
}
```

规则：

- 表格型结果必须尽量提供 `schema.fields`
- 表格集合结果可提供“公共字段 schema”或在 `meta` 中提供分组字段摘要
- 非表格结果可以省略 schema
- UI 优先消费 schema，缺失时再做样本探测

### 3. 预览规范

新增 `NodePreviewSpec`：

```ts
interface NodePreviewSpec {
  viewer: string
  title?: string
  summary?: string
  props?: Record<string, unknown>
}
```

设计原则：

- `preview.viewer` 用于声明“推荐 viewer”
- `preview.props` 只存 viewer 消费的展示参数
- 节点不直接决定组件，只声明 viewer key
- viewer key 由 registry 解析到具体 Vue 组件

### 4. 统一结果信封

```ts
interface NodeResult<T = unknown> {
  kind: DataKind
  payload: T
  schema?: NodeSchema
  meta?: Record<string, unknown>
  preview?: NodePreviewSpec
  lineage?: Record<string, unknown>
}
```

字段语义：

- `kind`: 主数据语义
- `payload`: 业务数据主体
- `schema`: 字段和结构摘要
- `meta`: 统计信息、诊断信息、摘要信息
- `preview`: 推荐展示方式
- `lineage`: 字段来源、输入来源、处理链信息

### 5. 端口与执行上下文

```ts
interface NodePort {
  name: string
  accepts: DataKind[]
  multiple?: boolean
  required?: boolean
}

interface NodeExecutionContext {
  nodeId: string
  nodeLabel: string
  upstream: Array<{
    sourceNodeId: string
    sourceNodeLabel: string
    edgeId: string
    result: NodeResult
  }>
}
```

用途：

- 端口层为后续多输出和命名输入预留空间
- `NodeExecutionContext` 让节点在需要时读取上游来源，而不是反查 store

### 6. 新版节点定义

```ts
interface NodeDefinition<I = unknown, O = unknown> {
  name: string
  displayName: string
  icon: string
  category: NodeCategory
  description: string
  properties: NodeProperty[]
  inputs?: NodePort[]
  outputs?: NodePort[]
  inputMode?: NodeInputMode
  minInputs?: number
  maxInputs?: number | null
  execute: (input: I, config: any, ctx: NodeExecutionContext) => Promise<NodeResult<O>> | NodeResult<O>
}
```

兼容策略：

- 短期内保留 `inputMode/minInputs/maxInputs`
- 连接规则仍可继续利用 `inputMode`
- 中期再逐步将连接与校验切换到 `inputs[]`

## 运行时设计

### 1. store 中的输出对象

将 `WorkflowNode.data.output?: any` 升级为：

```ts
output?: NodeResult | null
```

并为手动输入、冻结输出、历史模式等状态都使用统一结果结构。

### 2. 执行输入模型

- 单输入节点：传入单个 `NodeResult | null`
- 多输入节点：传入结构化数组，数组项带来源信息和 `NodeResult`

推荐结构：

```ts
interface StructuredExecutionInputItem {
  sourceNodeId: string
  sourceNodeLabel: string
  edgeId: string
  order: number
  result: NodeResult | null
}

interface MultiNodeExecutionInput {
  inputs: StructuredExecutionInputItem[]
}
```

### 3. 结果校验与归一化

store 在拿到节点结果后进行统一校验：

- 必须存在 `kind`
- 必须存在 `payload`
- 对 `table/tableCollection` 尝试补默认 schema
- 对缺失 `preview` 的已知 kind 自动补推荐 viewer

好处：

- 节点实现更简单
- UI 可以依赖最小一致性
- 历史记录与快照更稳定

### 4. 历史快照序列化

新增结果快照序列化规则：

- `table`: 截前 N 行并保留 schema 和 meta
- `tableCollection`: 每组截前 N 行并保留组名/组统计
- `report`: 保留结构化 sections，必要时裁剪超长文本
- `chart`: 保留 option，但可裁剪大型 series
- `file`: 保留文件名、mime、下载信息摘要，不保留大二进制
- `json/custom`: 保留裁剪后的 JSON 摘要

这样历史模式不再依赖 `output.data` 特殊分支。

## 预览体系设计

### 1. viewer registry

新增目录建议：

- `src/components/workflow/viewers/registry.ts`
- `src/components/workflow/viewers/types.ts`
- `src/components/workflow/viewers/builtins/*.ts`

registry 负责：

- 根据 `NodeResult.kind + preview.viewer` 解析最终 viewer
- 提供默认 viewer fallback
- 隔离主弹窗与具体 viewer 的直接耦合

示意接口：

```ts
interface ViewerRegistration {
  key: string
  supports: (result: NodeResult) => boolean
  component: Component
  mapProps?: (result: NodeResult) => Record<string, unknown>
}
```

### 2. 内建 viewer 规划

第一阶段内建 viewer：

- `table-preview`
- `table-collection-preview`
- `report-viewer`
- `chart-viewer`
- `file-viewer`
- `json-viewer`

与现有组件的映射：

- `ReportViewer.vue` 继续保留并升级为消费 `NodeResult`
- `ChartViewer.vue` 继续保留并升级为消费 `NodeResult`
- `ExportViewer.vue` 重命名语义为 `FileViewer` 或保留组件名但转换消费结构
- `DataChart.vue` 改成 table/tableCollection 的默认分析 viewer，而不是总 fallback

### 3. DataDisplayPanel 重构

`DataDisplayPanel` 不再按原始对象猜结构，而是按 `NodeResult.kind`：

- `table`: 显示记录数、字段数、前几行摘要
- `tableCollection`: 显示每组记录数和公共字段摘要
- `report`: 显示标题、section 数量、摘要
- `chart`: 显示图表类型和系列数量摘要
- `file`: 显示文件名、格式、下载状态
- `json/custom`: 显示裁剪后的 JSON

### 4. DataAnalysisModal 重构

`DataAnalysisModal` 调整为：

1. 接收 `NodeResult`
2. 从 registry 解析 viewer
3. 左侧预览面板显示统一结果摘要
4. 右侧主区渲染 registry 返回的组件

主弹窗不再直接判断 `viewType`。

## 配置体系设计

### 1. 上游字段推断优先级

`useUpstreamFactors` 的字段来源改为：

1. `result.schema.fields`
2. `table` payload 样本推断
3. `tableCollection` 公共字段交集推断
4. 手工 JSON 输入解析推断
5. 无字段

### 2. PropertyField 不变的部分

以下能力保持原样：

- `displayIf`
- `resolveOptions`
- `dependencies`
- `collection`
- `tree`
- `json`

### 3. PropertyField 新增的部分

- 接收标准化的 `upstreamSchemaFields`
- 允许 future 扩展为基于 port 的字段来源
- 在 UI 中区分“来自 schema”与“手工输入”的选项来源

## 节点迁移方案

### 第一批：核心骨架节点

#### 1. `file-import`

现状：返回 `{ data, filename, type }`

新协议：

- `kind: 'table'`
- `payload: rows`
- `schema.fields`: 基于首批记录推断字段
- `meta`: `filename`, `sourceType`, `rowCount`
- `preview.viewer: 'table-preview'`

#### 2. `manual-json-import`

现状：与导入节点类似，但来源为手工 JSON

新协议：

- 表格数组 -> `kind: 'table'`
- 普通对象/复杂结构 -> `kind: 'json'`
- `meta` 标记来源为手工输入

#### 3. `data-merge`

新协议：

- append/join -> `kind: 'table'`
- collection -> `kind: 'tableCollection'`
- `meta` 容纳现有 `stats/diagnostics`
- `lineage` 保留字段来源信息
- `preview` 对 collection 推荐 `table-collection-preview` 或图表 viewer

#### 4. `data-profiling`

新协议：

- `kind: 'report'`
- `payload` 为现有报告结构
- `meta` 携带 `metrics` 和 `profileSummary`
- 原 `profile` 可保留到 `meta.profile`
- `preview.viewer: 'report-viewer'`

#### 5. `chart-display`

新协议：

- `kind: 'chart'`
- `payload` 为 `chartOption`
- `meta` 存储图表类型、轴字段等
- `preview.viewer: 'chart-viewer'`

### 第二批：通用处理节点

- `data-cleaning`
- `data-filter`
- `data-aggregation`

统一迁移为：

- `kind: 'table'`
- `payload: rows`
- `schema.fields`: 输出字段 schema
- `meta`: 原 `stats`
- `preview.viewer: 'table-preview'`

### 第三批：分析终端节点

- `pearson`
- `spearman`
- `kendall`
- `lasso`
- `xgboost-shap`
- `data-export`

迁移规则：

- 相关性、Lasso、SHAP -> `kind: 'report'`
- 图表类终端 -> `kind: 'chart'`
- 导出类 -> `kind: 'file'`

### 第四批：远程与特殊 trigger

- `neighbor-system`

迁移重点：

- 根据返回值形态统一封装为 `table` 或 `json`
- 将运行时输入结果也标准化
- 保持现有远程 options 解析逻辑不变

## 目录与文件修改建议

### 新增文件

- `src/nodes/result.ts`
- `src/components/workflow/viewers/registry.ts`
- `src/components/workflow/viewers/types.ts`
- `src/components/workflow/viewers/FileViewer.vue`（或在现有 `ExportViewer.vue` 基础上升级）
- `src/nodes/__tests__/resultProtocol.spec.ts`

### 重点修改文件

- `src/nodes/types.ts`
- `src/utils/storage/types.ts`
- `src/stores/workflowStore.ts`
- `src/components/workflow/DataDisplayPanel.vue`
- `src/components/workflow/DataAnalysisModal.vue`
- `src/components/workflow/NodeConfigModal.vue`
- `src/components/workflow/config/PropertyField.vue`
- `src/components/workflow/viewers/ReportViewer.vue`
- `src/components/workflow/viewers/ChartViewer.vue`
- `src/components/workflow/viewers/ExportViewer.vue`
- `src/nodes/definitions/*.ts`
- `src/stores/__tests__/workflowStore.spec.ts`
- `src/nodes/__tests__/nodeDefinitions.spec.ts`

## 验证策略

### 1. 协议层测试

新增测试覆盖：

- `NodeResult` 归一化
- `schema` 自动推断
- `preview` 默认填充
- 不同 `kind` 的历史快照裁剪逻辑

### 2. store 测试

重点覆盖：

- 单输入节点收到标准 `NodeResult`
- 多输入节点收到 `MultiNodeExecutionInput`
- 冻结节点仍返回标准结果
- 手工输入路径能产出标准结果
- 全局运行历史快照按 `kind` 正确裁剪

### 3. viewer 测试

- registry 根据 `kind/preview.viewer` 正确分发
- `ReportViewer` 能消费新协议
- `ChartViewer` 能消费新协议
- `DataAnalysisModal` 不依赖旧 `viewType`

### 4. 节点回归测试

逐节点验证：

- 输出 `kind` 正确
- `payload` 结构正确
- `schema` 存在且合理
- `meta` 中保留原有关键统计
- 对已有行为无回归

### 5. 完整验证命令

实施完成后必须至少执行：

- `pnpm test:unit`
- `pnpm build`

如有新增更细粒度测试，可在开发过程中使用单文件测试命令跑红绿循环。

## 实施顺序

### 阶段 1：协议与测试骨架

1. 新增 `NodeResult` / `DataKind` / `schema` 类型
2. 新增协议层测试
3. 跑测试确认失败

### 阶段 2：执行层与存储层

1. 改造 `workflowStore`
2. 改造历史快照与输出存储类型
3. 跑相关测试直到通过

### 阶段 3：viewer registry 与预览层

1. 建立 registry
2. 改造 `DataAnalysisModal`
3. 改造 `DataDisplayPanel`
4. 改造 `NodeConfigModal` 字段推断

### 阶段 4：核心节点迁移

1. `file-import`
2. `manual-json-import`
3. `data-merge`
4. `data-profiling`
5. `chart-display`

### 阶段 5：其余节点全量迁移

1. 处理节点
2. 分析节点
3. 远程 trigger
4. 导出节点

### 阶段 6：全量回归与清理

1. 更新所有受影响测试
2. 全量运行单元测试
3. 运行构建验证
4. 更新 `CHANGELOG.md`

## 风险与缓解

### 风险 1：一次性迁移面太大

缓解：

- 严格按测试先行推进
- 先打通协议和 store，再分批迁移节点
- 每一类节点迁移后先跑局部测试

### 风险 2：viewer 改造导致 UI 大面积回归

缓解：

- 保留现有 viewer 组件主体
- 仅改变其入参与分发方式
- 为 `DataAnalysisModal` 增加独立测试

### 风险 3：schema 推断与旧数据不一致

缓解：

- schema 缺失时保留样本推断兜底
- 对表格节点统一使用同一套 schema 推断工具

### 风险 4：远程节点返回结构不稳定

缓解：

- 在节点内部显式封装为标准结果
- 对失败场景保留原有错误消息

## 最终结果

完成本次重构后，系统将具备以下能力：

- 节点间数据传递基于统一结果协议，而非隐式字段约定。
- 预览体系具备可插拔能力，新增 viewer 无需改主弹窗。
- 字段推断和参数联动更稳定，能优先依赖 schema。
- 历史记录与持久化不再绑定 `output.data` 这一单一形态。
- 后续扩展矩阵、时序、文件、多输出、复合节点时，核心架构无需再次大改。

## 本轮实施结论

本次直接采用“新协议优先并全量迁移节点”的路线，不走长期兼容包装路线。

理由：

- 当前节点数量可控，仍适合一次性完成协议升级。
- 如果继续依赖兼容包装，后续会形成双协议并存，增加维护成本。
- 现有测试基础已经覆盖大部分关键节点，适合支撑这轮重构。
