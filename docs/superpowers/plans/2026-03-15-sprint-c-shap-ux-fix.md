# Sprint C SHAP 体验修复 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SHAP 分析结果重构为“前端主报告 + 后端原始整图补充视图”，修复图表叙事混乱、整图展示与导出语义不清，并补齐测试覆盖。

**Architecture:** 后端 `backend/main.py` 输出结构化的 SHAP 摘要、重要性和全量依赖数据，前端 `xgboostShap` 节点统一归一为单一报告模型，由 `ReportViewer` 渲染主报告与补充视图入口。导出复用同一份报告状态，单独保留“后端原始整图导出”分支。

**Tech Stack:** Vue 3 + TypeScript + Vitest + PrimeVue + ECharts + FastAPI/Python

---

## Chunk 1: 数据契约与节点结果模型

### Task 1: 为 SHAP 节点补充失败测试并定义新结果结构

**Files:**
- Modify: `src/nodes/__tests__/nodeDefinitions.spec.ts`
- Modify: `src/nodes/definitions/xgboostShap.ts`
- Modify: `backend/main.py`

- [ ] **Step 1: 写失败测试，约束新 report 结构**

```ts
it('builds shap report with summary, all features, and supplement assets', async () => {
  // mock results.summary / importance / dependence / assets
  // expect result.report.sections to exist
  // expect result.report.metadata.featureCount toBe(3)
  // expect supplements.fullReportImage to exist
})
```

- [ ] **Step 2: 运行单测确认按预期失败**

Run: `pnpm test:unit -- src/nodes/__tests__/nodeDefinitions.spec.ts`
Expected: FAIL，提示 `tabs` 结构不符合新断言或缺少 summary / supplements 字段。

- [ ] **Step 3: 调整后端 SHAP 接口返回结构**

```py
"results": {
  "summary": {...},
  "importance": [...],
  "dependence": [...],
  "assets": {
    "beeswarmImage": ...,
    "fullReportImage": ...,
    "dependenceImages": [...]
  }
}
```

- [ ] **Step 4: 重写 `xgboostShap` 节点归一化逻辑**

```ts
return {
  viewType: 'report',
  report: {
    title: 'XGBoost + SHAP 因子贡献度分析报告',
    metadata: { ...summary, featureCount: importance.length },
    sections: [...],
    supplements: { fullReportImage, beeswarmImage }
  }
}
```

- [ ] **Step 5: 重新运行节点单测确认通过**

Run: `pnpm test:unit -- src/nodes/__tests__/nodeDefinitions.spec.ts`
Expected: PASS

### Task 2: 规范中文文案与编码问题

**Files:**
- Modify: `src/nodes/definitions/xgboostShap.ts`
- Modify: `backend/main.py`

- [ ] **Step 1: 修复 SHAP 节点中的乱码中文文案**
- [ ] **Step 2: 修复后端错误信息与返回 message 的乱码**
- [ ] **Step 3: 运行节点单测，确认文案变更未破坏结构**

Run: `pnpm test:unit -- src/nodes/__tests__/nodeDefinitions.spec.ts`
Expected: PASS

## Chunk 2: ReportViewer 主报告重构

### Task 3: 为主报告与补充视图渲染补失败测试

**Files:**
- Create: `src/components/workflow/__tests__/ReportViewer.spec.ts`
- Modify: `src/components/workflow/viewers/ReportViewer.vue`

- [ ] **Step 1: 写失败测试，约束新主报告结构**

```ts
it('renders shap main report sections and supplement panel', async () => {
  // mount ReportViewer with report.sections + report.supplements
  // expect summary cards, importance chart title, supplement CTA
})
```

- [ ] **Step 2: 写失败测试，约束“全部因子可达”交互**

```ts
it('allows searching and expanding to access all shap features', async () => {
  // expect initial subset
  // type feature name into search
  // expect off-screen feature to render
})
```

- [ ] **Step 3: 运行报告组件单测确认失败**

Run: `pnpm test:unit -- src/components/workflow/__tests__/ReportViewer.spec.ts`
Expected: FAIL，提示缺少筛选、补充视图入口或新 section 文本。

- [ ] **Step 4: 重构 `ReportViewer` 为单报告渲染模式**

实现要点：
- 移除 SHAP 对 `tabs` 的依赖
- 支持 `report.metadata`、`report.sections`、`report.supplements`
- 提供摘要卡片、因子搜索、显示更多、补充视图卡片
- 对普通旧报告保持兼容

- [ ] **Step 5: 跑报告组件单测确认通过**

Run: `pnpm test:unit -- src/components/workflow/__tests__/ReportViewer.spec.ts`
Expected: PASS

### Task 4: 实现“默认部分展示 + 全量可达”行为

**Files:**
- Modify: `src/components/workflow/viewers/ReportViewer.vue`
- Modify: `src/components/workflow/__tests__/ReportViewer.spec.ts`

- [ ] **Step 1: 写失败测试，验证完整因子明细默认折叠**
- [ ] **Step 2: 运行单测确认失败**
- [ ] **Step 3: 实现显示更多、搜索命中、切换任意因子的逻辑**
- [ ] **Step 4: 再次运行单测确认通过**

Run: `pnpm test:unit -- src/components/workflow/__tests__/ReportViewer.spec.ts`
Expected: PASS

## Chunk 3: 导出语义与整图补充视图

### Task 5: 为导出分支补失败测试

**Files:**
- Modify: `src/components/workflow/__tests__/ReportViewer.spec.ts`
- Modify: `src/components/workflow/viewers/ReportViewer.vue`

- [ ] **Step 1: 写失败测试，约束主报告导出与原始整图导出的分流**
- [ ] **Step 2: 运行单测确认失败**
- [ ] **Step 3: 修改 `ReportViewer` 导出逻辑**

实现要点：
- `导出当前报告` 始终导出当前 `reportRef`
- `导出后端原始整图` 仅在存在 `supplements.fullReportImage` 时显示
- 原始整图导出使用 Base64 直接下载，避免截图分支污染语义

- [ ] **Step 4: 运行报告组件单测确认通过**

Run: `pnpm test:unit -- src/components/workflow/__tests__/ReportViewer.spec.ts`
Expected: PASS

### Task 6: 校正整图展示入口与文案

**Files:**
- Modify: `src/components/workflow/viewers/ReportViewer.vue`
- Modify: `src/components/workflow/DataAnalysisModal.vue`

- [ ] **Step 1: 将“后端原始整图”作为补充入口展示在主报告中**
- [ ] **Step 2: 修正分析弹窗中的相关中文文案**
- [ ] **Step 3: 运行与报告相关的单测**

Run: `pnpm test:unit -- src/components/workflow/__tests__/ReportViewer.spec.ts src/nodes/__tests__/nodeDefinitions.spec.ts`
Expected: PASS

## Chunk 4: 回归验证与文档同步

### Task 7: 补充 changelog 并完成回归测试

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `src/components/workflow/__tests__/ReportViewer.spec.ts`
- Modify: `src/nodes/__tests__/nodeDefinitions.spec.ts`

- [ ] **Step 1: 在 `CHANGELOG.md` 的 `Unreleased` 中记录 Sprint C 修复内容**
- [ ] **Step 2: 运行定向单测**

Run: `pnpm test:unit -- src/nodes/__tests__/nodeDefinitions.spec.ts src/components/workflow/__tests__/ReportViewer.spec.ts`
Expected: PASS

- [ ] **Step 3: 运行类型检查**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 4: 如环境允许，运行一次前后端联调验证命令或给出手工验证记录**

Run: `pnpm test:unit`
Expected: PASS，或明确记录未执行的原因。
