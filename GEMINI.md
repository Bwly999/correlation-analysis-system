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

## 📐 连接规则与限制
- **Trigger**: 流程源头，全局仅允许存在一个。
- **Action**: 中间处理，可多级嵌套。
- **Model**: 分析终点，禁止引出连线。
