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