# 多因子相关性分析系统 - Gemini CLI 上下文

本项目是一个多因子相关性分析系统，具有 **n8n 风格的工作流编辑器**。它允许用户通过连接数据获取、处理和算法分析节点来构建数据分析流水线。

## 🚀 项目概览

- **核心框架:** Vue 3 (Composition API) 与 TypeScript。
- **工作流库:** [Vue-Flow](https://vueflow.dev/) 用于交互式画布。
- **UI 组件库:** [PrimeVue v4](https://primevue.org/) (Aura 主题)，用于对话框、树形控件和选择器等复杂组件。
- **样式:** [Tailwind CSS v4](https://tailwindcss.com/) 用于布局和快速原型开发。
- **状态管理:** [Pinia](https://pinia.vuejs.org/) 用于管理节点图数据、执行逻辑和日志。
- **图标:** [Lucide-Vue-Next](https://lucide.dev/)。

## 🏗 架构与核心组件

系统遵循工作流驱动架构，数据从左向右流动。

### 工作流引擎 (`src/stores/workflowStore.ts`)
- 管理 `nodes` (节点) 和 `edges` (连线) 状态。
- 实现递归执行引擎，支持单节点调试（使用缓存的上游数据）和全局运行。
- 执行 **连接规则**:
    - **数据获取 (Trigger):** 必须作为起点。可以连接到数据处理 (Action) 或算法模型 (Model)。
    - **数据处理 (Action):** 可以连接到其他数据处理 (Action) 或算法模型 (Model)。
    - **算法模型 (Model):** 终点。不能有引出连线。

### 主画布 (`src/components/workflow/WorkflowCanvas.vue`)
- 实现 n8n 风格的背景（点阵）和布局。
- 包含用于全局操作的浮动页眉和全宽可收缩的底部 **执行日志 (Executions Log)** 面板。
- 处理从节点库拖放节点以及点击连接逻辑。

### 自定义元素
- **节点 (`src/components/workflow/nodes/BaseNode.vue`):** 高保真复刻 n8n 节点（120px 方形/胶囊主体、底部浮动标签、运行时的圆锥渐变边框动画）。
- **连线 (`src/components/workflow/edges/N8nEdge.vue`):** 平滑直角路径 (Smoothstep)，带有悬停激活的工具栏，用于添加节点或删除连接。
- **节点侧边栏 (`src/components/workflow/NodeSidebar.vue`):** 浮动式添加节点抽屉，在“快速添加”模式下根据连接规则进行动态过滤。
- **配置弹窗 (`src/components/workflow/NodeConfigModal.vue`):** 大型三栏对话框（输入数据 | 参数设置 | 输出数据），匹配 n8n 的 "NDV" (节点详情视图)。

## 🛠 构建与运行

确保已安装 **pnpm**。

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建项目
pnpm build

# 运行单元测试
pnpm test:unit
```

## 📐 开发规范

### 代码风格
- **SFC 结构:** 使用 `<script setup lang="ts">`。
- **命名规范:** 遵循 Vue 风格指南（组件使用 PascalCase，Props 使用 camelCase）。
- **样式:** 使用 Tailwind 原子类进行布局。对于复杂的组件覆盖，使用 PrimeVue 的 `pt` (Pass Through) 或 scoped CSS。

### 连接约束
添加新节点类型时，请更新 `workflowStore.ts` 中的 `getCategoryByType` 辅助函数，以确保在拖放和快速添加操作中强制执行 `CONNECTION_RULES`。

### 视觉一致性
所有新 UI 元素应符合 **n8n 视觉语言**:
- 明亮、通透的背景（`slate-50` 或 `#fafafa`）。
- 靛蓝色 (`indigo-600`) 作为主要强调色。
- 精确的几何尺寸（节点为 120px，页眉为 40px/56px）。
- 精致的反馈（悬停效果、过渡动画和加载状态）。
