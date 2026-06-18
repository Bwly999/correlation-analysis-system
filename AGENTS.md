# AGENTS.md

This file provides guidance to LLM when working with code in this repository.

## 项目概述

多因子相关性分析系统 — 一个 n8n 风格的工作流编辑器 + 执行引擎 + AI 辅助分析平台。用户通过拖拽节点构建分析流程，系统执行节点并标准化输出结果。

## 技术栈

- **核心框架**: Vue 3 (Composition API, `<script setup>`) + TypeScript
- **工作流引擎**: Vue Flow (画布、节点、连线)
- **UI 组件库**: PrimeVue v4
- **样式方案**: Tailwind CSS v4
- **状态管理**: Pinia
- **可视化**: ECharts (vue-echarts)
- **构建工具**: Vite
- **测试**: Vitest + jsdom + @vue/test-utils
- **代码质量**: ESLint + Prettier
- **服务端**: 纯 Node HTTP server (无 Express), esbuild 打包, tsx 开发
- **数据库**: MySQL (production via Drizzle ORM), LowDB/localStorage (dev)
- **AI Agent 核心**: @earendil-works/pi-coding-agent (Pi Agent SDK)
- **工作流 AI 辅助**: @ai-sdk/openai-compatible + ai (Vercel AI SDK)
- **前端请求层**: axios 统一实例（`src/services/httpClient.ts`）

## 常用命令

```bash
pnpm dev            # 前端 Vite 开发服务器
pnpm build          # 前端 + 服务端构建
pnpm test:unit      # 运行所有单元测试
pnpm type-check     # vue-tsc 类型检查
pnpm lint:fix       # ESLint 自动修复
```

### 运行单个测试

```bash
pnpm test:unit -- <test-pattern>
# 例如: pnpm test:unit -- workflowStore
```

## 项目架构

### 目录结构

```
├── src/                          # 前端源码
│   ├── nodes/                    # 节点系统 (核心)
│   │   ├── types.ts              # NodeDefinition 接口定义
│   │   ├── registry.ts           # 节点注册表 (所有节点汇集处)
│   │   ├── result.ts             # NodeResult 标准结果协议
│   │   ├── libraryGroups.ts      # 节点库分组
│   │   ├── definitions/          # 各节点具体实现 (~30 个节点)
│   │   └── fileImport/           # 文件导入逻辑
│   ├── components/
│   │   ├── workflow/             # 工作流画布组件
│   │   │   ├── config/           # 节点配置面板
│   │   │   ├── viewers/          # 结果预览 viewer 组件
│   │   │   └── composables/      # 拖拽缩放等组合式函数
│   │   ├── agent/                # Agent 可观测性面板
│   │   └── piAgent/              # Pi Agent (AI 编码助手) 面板
│   ├── stores/                   # Pinia 状态管理
│   │   ├── workflowStore.ts      # 工作流核心 store (~76KB)
│   │   ├── piAgentStore.ts
│   │   └── ...
│   ├── server/                   # 服务端源码 (前后端同仓)
│   │   ├── app.ts                # 服务端入口 (createServerHandler)
│   │   ├── http/                 # HTTP 基础设施 (router, handler, CORS, auth)
│   │   ├── modules/              # 路由模块
│   │   │   ├── storageRoutes.ts      # 工作流 CRUD
│   │   │   ├── workflowAiRoutes.ts   # 工作流 AI 辅助
│   │   │   ├── piAgentRoutes.ts      # Pi Agent (AI Agent)
│   │   │   └── analysisRoutes.ts     # 分析代理
│   │   ├── storageDb/            # MySQL 存储实现 (Drizzle)
│   │   ├── workflowAi/           # 工作流 AI 编排 (LLM 辅助建工作流)
│   │   ├── piAgent/              # Pi Agent 服务端 (AI Agent 核心)
│   │   │   └── tools/            # 原子工作流工具集
│   │   ├── opencode/             # OpenCode/MCP 基础设施 (Pi Agent 复用)
│   │   └── bootstrap/            # 依赖注入组合根
│   ├── workflow/                 # 工作流模板 & 连接规则
│   │   ├── templates.ts           # 模板定义 (相关性排查/因子筛选/变量解释/看板对比)
│   │   └── connectionRules.ts     # 连线规则
│   ├── ai/                       # AI 辅助 (draft, recipes, schema inspector)
│   ├── api/                      # API 客户端
│   ├── services/                 # 业务服务
│   ├── shared/                   # 前端/服务端共享代码
│   ├── utils/                    # 工具函数
│   │   └── storage/              # 存储层抽象 (localStorage / 服务端)
│   └── style/                    # 全局样式
├── server/                       # 服务端启动入口
│   └── index.ts
├── scripts/                      # 构建/发布/评估脚本
└── test/                         # 测试 mock 等
```

### 工作流系统

包含系统协议、执行链路、持久化、viewer 注册，必要时查阅 `docs/design-doc/workflow-system/`

### 节点系统
包含节点清单、创建规则、实现规范、属性设计，必要时查阅 `docs/design-doc/workflow-nodes/`

### Pi Agent (AI Agent 主系统)

系统的 AI Agent 核心，基于 `@earendil-works/pi-coding-agent` SDK 构建：
必要时查阅 `docs/design-doc/Agent系统.md`

## 关键约束

### 前端 API 请求
- 前端所有后端 API 请求必须使用统一封装的 axios 实例：`src/services/httpClient.ts`
- 禁止在业务模块直接使用 `fetch` 调用后端接口
- 禁止在业务模块手动拼接 `import.meta.env.VITE_API_BASE_URL`
- 流式接口同样必须复用统一请求层提供的流式入口，禁止自行构造裸 URL
- `src/services/workflowRequestContext.ts` 仅负责生成工作流请求头，不负责发送 HTTP 请求

### UI/UX
- 所有用户可见文案必须使用中文
- 主品牌色 Slate-900 (#0f172a), 强调色 Blue-600 (#2563eb)
- 视觉方向: 极简现代 SaaS
- 样式编写尽可能使用tailwindcss v4
- 纯 UI / 视觉样式优化默认不要求执行 TDD 测试；此类改动优先做最小必要验证

### 工作流开发
- 新节点分类、属性、命名必须符合 `docs/design-doc/workflow-nodes/` 协议
- 新结果类型/viewer/多输入节点必须符合 `docs/design-doc/workflow-system/` 协议
- 涉及连接规则、执行顺序、持久化、节点地图变更 → 同步更新对应文档

### Git规范
- 禁止使用 worktree；如使用则合并时必须 rebase 不能 merge

### 提交规范
- Commit message 使用中文
- commit 信息中不要出现 claude 相关的内容
- 尽量原子化，一个 commit 只做一类事情

# 开发行为指导

## 1. 动手写代码前先思考

**不主观臆断。不掩饰困惑。把权衡方案摆在台面上。**

在开始实现之前：

* 明确阐述你的假设。如果不确定，请主动询问。
* 如果存在多种理解方式，请一并列出——不要擅自做决定。
* 如果有更简单的方法，请提出来。在合理的情况下，应当懂得推敲和拒绝。
* 如果有任何含糊不清的地方，请停下来。指出困惑点，并进行提问。

## 2. 至简至上

**用最少的代码解决问题。不做任何前瞻性/推测性的开发。**

* 绝不开发需求之外的功能。
* 绝不为单次使用的代码做抽象。
* 绝不引入未经要求的“灵活性”或“可配置性”。
* 绝不对不可能发生的场景做错误处理。
* 如果你写了 200 行代码，但实际上 50 行就能搞定，请重写。

扪心自问：“资深工程师会觉得这太复杂了吗？”如果是，请简化。

## 3. 精准修改

**只动必须动的地方。只清理自己留下的痕迹。**

在修改现有代码时：

* 不要去“优化”相邻的代码、注释或格式。
* 不要重构没有出故障的东西。
* 保持现有代码风格一致，即使你个人的习惯并非如此。
* 如果你注意到了不相关的废弃代码，请提出来——不要擅自删除。

当你的修改导致部分代码失效时：

* 移除因**你的**修改而不再被使用的 import、变量或函数。
* 除非被要求，否则不要清理原本就存在的废弃代码。

检验标准：改动的每一行代码，都必须能直接追溯到用户的具体需求。

## 4. 目标导向执行

**明确验收标准。持续循环直到验证通过。**

将任务转化为可验证的目标：

* “添加校验” → “为非法输入编写测试，然后使其通过”
* “修复 Bug” → “编写一个能复现该 Bug 的测试，然后使其通过”
* “重构 X” → “确保重构前后的测试都能通过”

对于多步骤任务，请列出简要计划：

```
1. [步骤] → 验证：[检查项]
2. [步骤] → 验证：[检查项]
3. [步骤] → 验证：[检查项]

```

明确的验收标准能让你独立完成验证闭环。而模糊的标准（如“让它能跑就行”）则需要频繁的沟通澄清。

# 特别说明
你不一定是一个人在开发，有可能多个Agent在并行开发