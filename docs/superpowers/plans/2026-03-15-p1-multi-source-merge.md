# P1 多源合并与多输入工作流 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为工作流编辑器补齐多起始数据源、多输入执行模型，以及 `append` / `object merge` 合并节点。

**Architecture:** 通过扩展节点定义的输入能力声明，统一由 `workflowStore` 收集和分发多路上游输入，同时在节点层实现 `append` 和 `object merge` 的声明式执行逻辑。UI 层只做第一版必要表达，重点保证连接规则、执行模型、合并诊断和输入预览形成闭环。

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Flow, PrimeVue, Vitest

---

## Chunk 1: 多输入协议与连接规则

### Task 1: 扩展节点类型定义

**Files:**
- Modify: `src/nodes/types.ts`
- Test: `src/stores/__tests__/workflowStore.spec.ts`

- [ ] **Step 1: 写失败测试，覆盖多输入能力默认值与单输入限制**
- [ ] **Step 2: 运行相关测试确认失败**
  Run: `pnpm test:unit -- src/stores/__tests__/workflowStore.spec.ts`
- [ ] **Step 3: 为 `NodeDefinition` 增加 `inputMode` / `minInputs` / `maxInputs` 等字段**
- [ ] **Step 4: 让现有节点保持单输入默认兼容**
- [ ] **Step 5: 再跑测试确认通过**

### Task 2: 改造连接校验支持多 trigger 与多输入节点

**Files:**
- Modify: `src/stores/workflowStore.ts`
- Test: `src/stores/__tests__/workflowStore.spec.ts`

- [ ] **Step 1: 新增失败测试**
  - 允许多个 trigger 共存
  - 单输入节点禁止第二条入边
  - 多输入节点允许多条入边
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 在 store 中接入节点输入能力校验**
- [ ] **Step 4: 调整 `checkTriggerExists` 和 `validateConnection`**
- [ ] **Step 5: 运行测试确认通过**

## Chunk 2: 执行引擎多输入化

### Task 3: 为节点执行增加统一多输入 payload

**Files:**
- Modify: `src/stores/workflowStore.ts`
- Modify: `src/nodes/types.ts`
- Test: `src/stores/__tests__/workflowStore.spec.ts`

- [ ] **Step 1: 写失败测试，验证多输入节点收到完整 `inputs[]`**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 在 `executeNode` 中按稳定顺序收集所有上游输入**
- [ ] **Step 4: 按节点 `inputMode` 传单输入或多输入结构**
- [ ] **Step 5: 补输入数不足时的错误提示**
- [ ] **Step 6: 运行测试确认通过**

### Task 4: 配置面板输入预览支持多输入摘要

**Files:**
- Modify: `src/components/workflow/NodeConfigModal.vue`
- Possibly Modify: `src/components/workflow/DataDisplayPanel.vue`
- Test: `src/__tests__/App.spec.ts`

- [ ] **Step 1: 写失败测试或最小回归测试，覆盖多输入节点配置预览**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 将单一路输入预览调整为“多输入摘要 + 第一层诊断”**
- [ ] **Step 4: 运行测试确认通过**

## Chunk 3: `append` 节点

### Task 5: 注册 `append` 节点定义

**Files:**
- Create: `src/nodes/definitions/append.ts`
- Modify: `src/nodes/registry.ts`
- Modify: `src/components/workflow/NodeSidebar.vue`
- Test: `src/nodes/__tests__/nodeDefinitions.spec.ts`

- [ ] **Step 1: 写失败测试，覆盖节点注册与基础执行**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 实现 `append` 节点属性与输入能力声明**
- [ ] **Step 4: 在 registry 和侧边栏中挂载节点**
- [ ] **Step 5: 运行测试确认通过**

### Task 6: 完成 `append` 合并逻辑与诊断

**Files:**
- Modify: `src/nodes/definitions/append.ts`
- Test: `src/nodes/__tests__/nodeDefinitions.spec.ts`

- [ ] **Step 1: 写失败测试**
  - 并集合并
  - 交集合并
  - 来源标记
  - 缺失字段补值统计
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 实现数据对齐、来源标记、stats、diagnostics、lineage**
- [ ] **Step 4: 运行测试确认通过**

## Chunk 4: `object merge` 节点

### Task 7: 注册 `object merge` 节点定义

**Files:**
- Create: `src/nodes/definitions/objectMerge.ts`
- Modify: `src/nodes/registry.ts`
- Modify: `src/components/workflow/NodeSidebar.vue`
- Test: `src/nodes/__tests__/nodeDefinitions.spec.ts`

- [ ] **Step 1: 写失败测试，覆盖节点注册与最小执行**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 实现节点声明与属性定义**
- [ ] **Step 4: 在 registry 和侧边栏中挂载节点**
- [ ] **Step 5: 运行测试确认通过**

### Task 8: 完成 `object merge` 合并逻辑与诊断

**Files:**
- Modify: `src/nodes/definitions/objectMerge.ts`
- Test: `src/nodes/__tests__/nodeDefinitions.spec.ts`

- [ ] **Step 1: 写失败测试**
  - `left`
  - `inner`
  - `full`
  - 冲突策略
  - 重复键诊断
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 实现按键合并、冲突处理、诊断和字段血缘**
- [ ] **Step 4: 运行测试确认通过**

## Chunk 5: 节点 UI 与运行反馈

### Task 9: 多输入节点在画布和配置中提供可见反馈

**Files:**
- Modify: `src/components/workflow/nodes/BaseNode.vue`
- Modify: `src/components/workflow/WorkflowCanvas.vue`
- Modify: `src/components/workflow/NodeSidebar.vue`
- Test: `src/__tests__/App.spec.ts`

- [ ] **Step 1: 写失败测试或最小回归测试**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 增加“多输入”标识、连接提示、缺输入提示**
- [ ] **Step 4: 运行测试确认通过**

## Chunk 6: 验证与收尾

### Task 10: 更新变更记录并完成验证

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新 `CHANGELOG.md` 记录多输入工作流和合并节点**
- [ ] **Step 2: 运行单测**
  Run: `pnpm test:unit`
- [ ] **Step 3: 运行类型检查并记录现状**
  Run: `pnpm type-check`
  Expected: 现有全局类型错误仍可能存在；确认本次改动没有新增无关错误
- [ ] **Step 4: 检查 `git status`**
- [ ] **Step 5: 以中文提交**

Plan complete and saved to `docs/superpowers/plans/2026-03-15-p1-multi-source-merge.md`. Ready to execute?
