# 多因子相关性分析系统 - Gemini CLI 上下文

本项目是一个多因子相关性分析系统，具有 **n8n 风格的工作流编辑器**。

## 🚀 项目技术栈

- **核心框架:** Vue 3 (Composition API) + TypeScript。
- **工作流引擎:** [Vue-Flow](https://vueflow.dev/)。
- **UI 组件库:** [PrimeVue v4](https://primevue.org/)。
- **样式方案:** [Tailwind CSS v4](https://tailwindcss.com/)。
- **状态管理:** [Pinia](https://pinia.vuejs.org/)。
- **可视化分析:** [ECharts](https://echarts.apache.org/)。

## 🏗 核心架构设计

### 1. 声明式节点系统 (`src/nodes/`)
- 节点通过 TypeScript 对象进行**声明式定义**，自动映射生成 UI。
- **DataDisplayPanel**: 统一的浅色系数据展示组件，支持大数据量智能截断预览。
- **DataAnalysisModal**: 集成 ECharts 的深度分析窗口，支持因子趋势可视化。

### 2. 执行引擎逻辑 (`src/stores/workflowStore.ts`)
- **递归执行**: 支持全链路运行和单节点调试。
- **中断机制**: 通过 `isStopping` 信号实现全局执行的实时停止。
- **性能优化**: 核心数据结果强制执行 `markRaw`，消除大数据对象带来的响应式开销。

### 3. n8n 风格 UI 规范
- **Header**: 包含面包屑导航、在线状态、独立保存按钮及导入/导出菜单。
- **Sidebar**: 浮动式节点库，支持分类过滤、搜索及快速建流模式。
- **Canvas**: 采用 Dots 背景，左下角集成“准星”复位按钮及缩放控件。
- **Footer**: 可收缩的浅色执行记录面板，整合系统实时状态。

## 🛠 开发与测试

```bash
# 安装与运行
pnpm install
pnpm dev

# 测试驱动 (TDD)
pnpm test:unit  # 运行全量 13+ 测试用例，覆盖节点逻辑与 Store 状态
```

## 🎨 UI/UX 设计规范

### 1. 视觉风格定位
- **核心理念**: **极简现代 SaaS 美学** (Minimalist Modern SaaS)。对标 Vercel / Linear 的专业工具质感。
- **界面对比**: 强调层级感。背景采用“沉降式”深色调，交互面板采用“悬浮式”纯白底色。
- **文案要求**: 界面所有用户可见的标签、提示、占位符**必须**使用中文。

### 2. 标准色盘 (Palette)
- **主品牌色**: `Slate-900` (#0f172a) - 用于标题、核心文字、深色卡片背景。
- **功能强调色**: `Blue-600` (#2563eb) - 用于主按钮、链接、关键逻辑高亮。
- **状态色**: 成功 (`Emerald-500`)、错误 (`Rose-500`)、警告 (`Amber-500`)。
- **禁忌**: **严禁使用紫色/靛蓝色**（避免产生轻浮的 AI 魔法感，保持工业分析的严谨性）。

### 3. 画布与交互规范
- **画布 (Canvas)**:
  - 背景色: `#f4f7fa` (Slate-50)。
  - 网格系统: 采用双层交叉线 (`lines`)。基础网格 20px (`#e2e8f0`)，主网格 100px (`#cbd5e1`)。
  - 视觉效果: 容器边缘需带微弱内阴影 (`inset shadow`) 以模拟面板嵌套感。
- **节点 (Nodes)**: 纯白背景、1px 细边框。状态反馈采用 `ring` 扩散，严禁使用复杂的 Conic Gradient。
- **连接点 (Handle)**: 物理中心点必须**绝对静止**。悬浮反馈应使用 `box-shadow` (Outer Glow) 模拟，禁止使用 `transform: scale`。

### 📋 提交规范
- **语言要求**: Git 提交消息 (Commit Message) **必须**使用中文。
- **CHANGELOG 同步**: 每次进行代码修改并准备提交 (commit) 时，**必须**同步更新 `CHANGELOG.md`，记录新增功能、优化或修复的内容。
- **原子化提交**: 尽量保持每个 commit 职责单一。

## 📐 连接规则与限制
- **Trigger**: 流程源头，全局仅允许存在一个。
- **Action**: 中间处理，可多级嵌套。
- **Model**: 分析终点，禁止引出连线。
