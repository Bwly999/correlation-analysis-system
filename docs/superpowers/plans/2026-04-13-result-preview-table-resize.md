# 结果预览表格可调列宽与表头配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将结果预览表格切换到 PrimeVue `DataTable`，补齐列宽拖拽、表头高度拖拽、标题截断 tooltip 和批量列宽设置面板。

**Architecture:** 保留 `TableViewer.vue` 作为结果预览入口，继续负责分页和数据整理；引入一个面向表格布局状态的 composable 管理列宽、表头高度和设置面板状态；使用 PrimeVue `DataTable` 提供基础表格与原生列宽拖拽能力，在列头模板和表头外层补上 tooltip、批量设置面板和表头高度拖拽。

**Tech Stack:** Vue 3 Composition API、TypeScript、PrimeVue `DataTable`/`Column`/`Popover`/`MultiSelect`/`InputNumber`、Vitest、Vue Test Utils

---

## 文件结构

- Modify: `src/components/workflow/viewers/TableViewer.vue`
  - 将原生 `table` 改为 PrimeVue `DataTable`
  - 接入分页、批量列宽设置面板、列头 tooltip、表头高度拖拽
- Create: `src/components/workflow/viewers/useTablePreviewLayout.ts`
  - 管理列宽映射、表头高度、批量设置逻辑、拖拽状态
- Modify: `src/components/workflow/__tests__/TableViewer.spec.ts`
  - 为新交互补齐测试

## 任务拆解

### Task 1: 表格布局状态 composable

**Files:**
- Create: `src/components/workflow/viewers/useTablePreviewLayout.ts`
- Test: `src/components/workflow/__tests__/TableViewer.spec.ts`

- [ ] **Step 1: 写失败测试，覆盖批量列宽应用与重置的外部可见行为**

在 `TableViewer.spec.ts` 增加一个测试，用例名类似：

```ts
it('applies width to selected columns and resets them from the settings panel', async () => {
  // mount TableViewer
  // 打开设置面板
  // 选中列
  // 输入宽度
  // 点击应用
  // 断言对应列样式变化
  // 点击重置
  // 断言对应列样式恢复
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts`

Expected: 新增用例失败，提示找不到设置面板、交互节点或列宽样式尚未实现。

- [ ] **Step 3: 实现最小 composable**

在 `useTablePreviewLayout.ts` 中实现最小 API：

```ts
export interface TablePreviewLayoutApi {
  columnWidths: Ref<Record<string, number | undefined>>
  headerRowHeight: Ref<number>
  selectedFields: Ref<string[]>
  pendingWidth: Ref<number | null>
  isWidthPanelOpen: Ref<boolean>
  setColumnWidth: (field: string, width: number) => void
  applyWidthToFields: () => void
  resetColumnWidths: () => void
  openWidthPanel: () => void
  closeWidthPanel: () => void
}
```

实现要求：

- 默认表头高度返回固定值
- `applyWidthToFields()` 将 `pendingWidth` 应用到 `selectedFields`
- `resetColumnWidths()` 清空映射

- [ ] **Step 4: 运行测试确认仍失败但失败位置前移**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts`

Expected: 测试仍失败，但应从“缺少基础状态结构”前移到“组件界面尚未接入这些状态”。

- [ ] **Step 5: 提交检查点**

Run:

```bash
git add src/components/workflow/viewers/useTablePreviewLayout.ts src/components/workflow/__tests__/TableViewer.spec.ts
git diff --cached
```

Expected: 仅包含 composable 和测试骨架改动；此阶段不提交 commit，只做 staged diff 自检。

### Task 2: 将 TableViewer 切换为 PrimeVue DataTable

**Files:**
- Modify: `src/components/workflow/viewers/TableViewer.vue`
- Test: `src/components/workflow/__tests__/TableViewer.spec.ts`

- [ ] **Step 1: 写失败测试，确认分页在 PrimeVue 版本中保持不变**

保留现有分页测试，并补一个更明确的断言，确保切换到 `DataTable` 后：

```ts
expect(wrapper.findAll('[data-test="table-row"]')).toHaveLength(50)
expect(wrapper.text()).toContain('当前显示第 1 - 50 条，共 60 条')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "paginates table rows instead of rendering all rows at once"`

Expected: 在替换表格结构前后至少有一次明确失败，证明测试能约束渲染结构变化。

- [ ] **Step 3: 用最小实现替换表格主体**

在 `TableViewer.vue` 中：

- 引入 PrimeVue `DataTable` 与 `Column`
- 继续使用现有 `pagedRows`
- 保持顶部统计和底部分页按钮
- `DataTable` 先接入：

```vue
<DataTable
  :value="pagedRows"
  resizableColumns
  columnResizeMode="fit"
  scrollable
  tableStyle="min-width: 100%"
>
  <Column v-for="field in fields" :key="field" :field="field" :header="field" />
</DataTable>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "paginates table rows instead of rendering all rows at once"`

Expected: 分页用例通过。

- [ ] **Step 5: 提交检查点**

Run:

```bash
git add src/components/workflow/viewers/TableViewer.vue src/components/workflow/__tests__/TableViewer.spec.ts
git diff --cached
```

Expected: 仅包含表格主体切换与必要测试更新。

### Task 3: 批量列宽设置面板

**Files:**
- Modify: `src/components/workflow/viewers/TableViewer.vue`
- Modify: `src/components/workflow/__tests__/TableViewer.spec.ts`

- [ ] **Step 1: 写失败测试，覆盖设置入口与批量应用**

新增用例：

```ts
it('shows the width settings panel from the top-left icon and applies width to selected fields', async () => {
  // 打开 Popover
  // 选中 name / id
  // 输入 240
  // 点击应用
  // 断言对应列头或列样式包含 240px
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "shows the width settings panel"`

Expected: 找不到设置按钮、Popover 或列宽应用结果。

- [ ] **Step 3: 在 TableViewer 中接入设置面板**

实现内容：

- 在表格左上角放置 Icon 按钮，建议 `pi pi-sliders-h`
- 使用 PrimeVue `Popover`
- 面板内容：
  - `MultiSelect`，开启 `filter`
  - `InputNumber`
  - 应用按钮
  - 重置按钮
- 将面板操作绑定到 `useTablePreviewLayout`
- 为关键节点增加 `data-test`：
  - `table-width-settings-trigger`
  - `table-width-settings-panel`
  - `table-width-apply`
  - `table-width-reset`

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "shows the width settings panel"`

Expected: 用例通过，应用与重置行为可见。

- [ ] **Step 5: 提交检查点**

Run:

```bash
git add src/components/workflow/viewers/TableViewer.vue src/components/workflow/viewers/useTablePreviewLayout.ts src/components/workflow/__tests__/TableViewer.spec.ts
git diff --cached
```

Expected: staged diff 只涉及设置面板和列宽批量应用逻辑。

### Task 4: 列头截断 tooltip

**Files:**
- Modify: `src/components/workflow/viewers/TableViewer.vue`
- Modify: `src/components/workflow/__tests__/TableViewer.spec.ts`

- [ ] **Step 1: 写失败测试，覆盖截断时启用 tooltip**

新增用例：

```ts
it('only enables header tooltip when the header text is truncated', async () => {
  // mount 后手动 mock 某个列头 scrollWidth > clientWidth
  // 触发检测
  // 断言该列有 tooltip 标识
  // 再断言未截断列没有该标识
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "only enables header tooltip"`

Expected: 因为列头模板和截断检测尚未实现而失败。

- [ ] **Step 3: 实现列头模板与截断检测**

在 `TableViewer.vue` 中：

- 使用 `Column` 的 `#header` 模板
- 渲染单行省略的列头文本
- 建立 `headerTextRefs`
- 在挂载后和列宽变化后检测：

```ts
const isOverflowing = (el: HTMLElement) => el.scrollWidth > el.clientWidth
```

- 仅在截断时设置 `v-tooltip.top="field"`

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "only enables header tooltip"`

Expected: 用例通过。

- [ ] **Step 5: 提交检查点**

Run:

```bash
git add src/components/workflow/viewers/TableViewer.vue src/components/workflow/__tests__/TableViewer.spec.ts
git diff --cached
```

Expected: staged diff 只包含列头模板和 tooltip 逻辑。

### Task 5: 表头整行高度拖拽

**Files:**
- Modify: `src/components/workflow/viewers/TableViewer.vue`
- Modify: `src/components/workflow/viewers/useTablePreviewLayout.ts`
- Modify: `src/components/workflow/__tests__/TableViewer.spec.ts`

- [ ] **Step 1: 写失败测试，覆盖表头高度调整**

新增用例：

```ts
it('updates the header row height when dragging the resize handle', async () => {
  // 找到表头高度拖拽手柄
  // 触发 mousedown / mousemove / mouseup
  // 断言表头行样式高度已变化
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "updates the header row height"`

Expected: 因手柄不存在或拖拽事件未接入而失败。

- [ ] **Step 3: 实现最小拖拽能力**

在 composable 中补充：

```ts
startHeaderResize(startY: number): void
updateHeaderResize(currentY: number): void
stopHeaderResize(): void
```

在 `TableViewer.vue` 中：

- 在表头区域底部加一个拖拽热区
- 监听 `mousedown`
- 将 `mousemove` / `mouseup` 绑定到 `window`
- 把 `headerRowHeight` 应用到列头容器样式

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts -t "updates the header row height"`

Expected: 用例通过。

- [ ] **Step 5: 提交检查点**

Run:

```bash
git add src/components/workflow/viewers/TableViewer.vue src/components/workflow/viewers/useTablePreviewLayout.ts src/components/workflow/__tests__/TableViewer.spec.ts
git diff --cached
```

Expected: staged diff 只包含表头高度拖拽相关改动。

### Task 6: 全量验证

**Files:**
- Verify: `src/components/workflow/viewers/TableViewer.vue`
- Verify: `src/components/workflow/viewers/useTablePreviewLayout.ts`
- Verify: `src/components/workflow/__tests__/TableViewer.spec.ts`

- [ ] **Step 1: 运行表格相关测试**

Run: `pnpm vitest run src/components/workflow/__tests__/TableViewer.spec.ts`

Expected: 全部通过。

- [ ] **Step 2: 运行工作流组件回归测试**

Run: `pnpm vitest run src/components/workflow/__tests__/TableChartComboViewer.spec.ts src/components/workflow/__tests__/DataAnalysisModal.spec.ts`

Expected: 全部通过，确认表格 viewer 改动未破坏组合预览或分析弹窗。

- [ ] **Step 3: 运行构建验证**

Run: `pnpm build`

Expected: 构建成功，无类型错误。

- [ ] **Step 4: 检查中文文案与编码**

手动检查：

- `TableViewer.vue` 中所有新增文案均为中文
- 文件无乱码

- [ ] **Step 5: 准备提交**

Run:

```bash
git status --short
git diff -- src/components/workflow/viewers/TableViewer.vue src/components/workflow/viewers/useTablePreviewLayout.ts src/components/workflow/__tests__/TableViewer.spec.ts
```

Expected: 仅确认本任务相关改动；不触碰工作区其他已有变更。
