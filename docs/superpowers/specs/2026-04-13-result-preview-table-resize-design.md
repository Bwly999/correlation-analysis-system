# 结果预览表格可调列宽与表头配置设计

## 背景

当前结果预览表格由 `TableViewer.vue` 内的原生 `table` 渲染，已具备基础分页能力，但缺少以下交互：

- 列宽拖拽调整
- 标题栏行高拖拽调整
- 标题文本截断后的完整信息提示
- 表格左上角的批量列宽设置入口

本次改动仅要求“当次生效”，即状态只保留在当前结果预览组件实例内，不做本地存储和跨节点复用。

## 目标

在结果预览中的表格视图内提供以下能力：

1. 使用 PrimeVue `DataTable` 作为表格主体，尽量复用其原生列宽调整能力。
2. 支持用户通过拖拽调整单列列宽。
3. 支持用户通过拖拽调整表头整行高度。
4. 当表头文字显示不全时，悬浮显示完整标题 tooltip。
5. 在表格左上角增加一个设置列宽的 Icon 按钮。
6. 点击按钮后，在右侧展开一个小面板，包含：
   - 支持搜索的多选列名选择器
   - 列宽数值输入框
   - 应用按钮：将输入宽度应用到选中列
   - 重置按钮：恢复列宽到默认状态

## 非目标

- 不做列宽、表头高度的持久化
- 不引入新的全局 store 状态
- 不扩展到图表 viewer、报表 viewer 或其他非表格结果
- 不实现复杂列冻结、列拖拽排序、隐藏列管理

## 文档结论与设计边界

根据 PrimeVue `DataTable` 文档，以下能力可以直接复用：

- `resizableColumns`：启用列宽拖拽
- `columnResizeMode`：可选 `fit` / `expand`
- `#header` 插槽：可在表格顶部放置自定义工具区
- `Column` 模板：可自定义列头内容

以下能力未见原生直接支持，需要在 PrimeVue 表格外层或列头模板中补齐：

- 表头整行高度拖拽
- 仅在标题文本截断时显示 tooltip
- 自定义“批量设置列宽”面板的业务行为

因此本次采用“PrimeVue 负责表格骨架与原生列宽调整，自定义层负责业务交互补足”的混合方案。

## 组件边界

### `TableViewer.vue`

继续作为结果预览表格的入口组件，职责调整为：

- 组织分页数据
- 维护临时表格交互状态
- 渲染 PrimeVue `DataTable`
- 连接设置面板、tooltip 和拖拽逻辑

### 新增 composable：`useTablePreviewLayout.ts`

建议抽离一个面向表格布局状态的 composable，职责如下：

- 管理列宽映射 `columnWidths`
- 管理表头高度 `headerRowHeight`
- 管理设置面板状态
- 提供批量应用列宽、重置列宽的方法
- 提供拖拽表头高度的方法

这样可以避免 `TableViewer.vue` 膨胀成包含分页、布局、浮层、拖拽等多种职责的单文件。

### 可选新增子组件：`TablePreviewWidthPanel.vue`

如果 `TableViewer.vue` 模板增长明显，则将设置面板拆分为独立子组件，职责如下：

- 展示多选列名
- 接收列宽输入
- 发出“应用”“重置”事件

如果实现规模较小，也可以先保留在 `TableViewer.vue` 内。

## 数据与状态设计

### 输入数据

- `rows`
- `fields`
- `pageSize`
- `currentPage`

这些数据沿用当前实现。

### 新增本地状态

- `columnWidths: Record<string, number | undefined>`
  - key 为列名
  - value 为当前会话内生效的列宽
- `headerRowHeight: number`
  - 表头行高，单位 `px`
- `isWidthPanelOpen: boolean`
  - 控制批量设置面板开关
- `selectedFields: string[]`
  - 面板中被选中的列
- `pendingWidth: number | null`
  - 面板输入中的目标列宽

### 派生状态

- `columnOptions`
  - 用于 `MultiSelect` 的列名选项
- `resolvedColumnStyle(field)`
  - 输出每列最终样式，如 `width`、`minWidth`
- `headerStyle`
  - 输出表头高度样式

## 交互设计

### 1. 单列列宽拖拽

使用 PrimeVue `DataTable` 的 `resizableColumns` 能力作为基础方案。

设计约束：

- 优先使用 `columnResizeMode="fit"`
- 每列初始宽度由默认值控制，例如 `180px`
- 用户拖拽后，需要把结果同步回本地 `columnWidths`

实现注意：

- PrimeVue 会直接改动表格 DOM 宽度，但业务侧仍需要本地状态来支持“批量应用”“重置”
- 如果 PrimeVue 的拖拽结果难以直接读回，可在列头渲染节点上监听实际宽度并回写状态

### 2. 表头整行高度拖拽

由于 `DataTable` 无原生整行高度拖拽，采用自定义拖拽条：

- 在表头区域底部增加一条高度较小的拖拽热区
- 鼠标按下后记录起始位置和起始高度
- 拖动时按位移更新 `headerRowHeight`
- 设置最小高度，例如 `40px`
- 拖拽结束后解除全局事件监听

### 3. 标题截断 tooltip

每个列头通过 `Column` 的 header 模板自定义渲染：

- 标题文本固定为单行省略
- 通过元素的 `scrollWidth > clientWidth` 判断是否发生截断
- 仅在截断时绑定 PrimeVue `v-tooltip`

这样可以避免所有列头无差别弹出 tooltip，减少干扰。

### 4. 左上角设置按钮与面板

在 `DataTable` 的 `#header` 插槽左侧放置 Icon 按钮。

交互流程：

1. 点击按钮
2. 在按钮右侧展开一个小面板
3. 面板内包含：
   - 可搜索 `MultiSelect`
   - `InputNumber` 列宽输入
   - 应用 Icon 按钮
   - 重置 Icon 按钮

行为规则：

- 未选择列时，应用按钮禁用
- 未输入合法列宽时，应用按钮禁用
- 点击应用后，将 `pendingWidth` 批量写入 `selectedFields`
- 点击重置后，清空 `columnWidths`
- 关闭面板不清空已生效结果

建议使用 PrimeVue `Popover` 作为承载容器，和仓库现有实现保持一致。

## 视觉与文案

遵循现有工作流 UI 风格：

- 保持中文文案
- 主体使用 `Slate` 系配色
- 强调操作使用 `Blue-600`
- 设置入口采用低干扰 Icon 按钮，不做高饱和按钮

建议文案：

- 面板标题：`批量设置列宽`
- 多选占位：`搜索并选择列名`
- 输入框占位：`输入列宽（像素）`
- 应用按钮 tooltip：`应用到所选列`
- 重置按钮 tooltip：`重置全部列宽`

## 测试设计

测试以 [TableViewer.spec.ts](D:/FrontProjects/correlation-analysis-system/src/components/workflow/__tests__/TableViewer.spec.ts) 为主，必要时补 composable 单测。

至少覆盖：

1. 渲染 PrimeVue 版表格后，分页仍然正确。
2. 点击设置 Icon 后出现批量列宽面板。
3. 选择列并输入宽度后，目标列样式被更新。
4. 点击重置后，列宽状态恢复默认。
5. 表头文本截断时启用 tooltip，未截断时不启用。
6. 拖拽表头高度后，对应样式状态发生变化。

## 风险与应对

### 风险 1：PrimeVue 拖拽后的宽度不易同步回本地状态

应对：

- 优先尝试读取列头元素实时宽度
- 如同步成本过高，则保留 PrimeVue 拖拽作为直接 DOM 效果，本地批量设置只覆盖后续状态

### 风险 2：tooltip 截断检测在测试环境中不稳定

应对：

- 将“是否溢出”的判断封装成可注入或可 mock 的函数
- 单测中通过手动定义元素尺寸属性验证行为

### 风险 3：单文件组件复杂度上升

应对：

- 分离 `useTablePreviewLayout`
- 当模板明显膨胀时拆出 `TablePreviewWidthPanel.vue`

## 实施顺序

1. 先把 `TableViewer` 从原生 `table` 切到 PrimeVue `DataTable`
2. 保持现有分页行为不变
3. 接入 `resizableColumns`
4. 接入自定义列头模板和截断 tooltip
5. 增加左上角设置按钮与 `Popover` 面板
6. 增加表头高度拖拽
7. 补单测并验证
