# Notebook Agent 系统

本文档是 Notebook Agent（AI 数据分析笔记本）系统的入口。整个文档系统聚焦"前端 Pyodide + iframe 隔离 + Pi Agent 自由分析"的整体设计，作为 Notebook Agent 系统级规则的主入口。

> **读者对象：** 开发者和 LLM Agent，需要理解 Notebook Agent 的产品定位、架构边界、协议约束和实现规范。

## 1. 系统定位

Notebook Agent 是一个**独立于画布的 AI 数据分析工作站**：用户给目标和数据，Agent 用 Python 自由分析，产出图文并茂的长报告。

它的存在解决了一个明确的痛点：**当前画布范式把 LLM 锁在"节点编排员"角色，无法发挥它在数据分析上的真正实力**。Notebook Agent 把 LLM 解放成"带 Python 沙箱的数据科学家"，让它像 Claude Code 那样跑 → 看 → 改假设 → 再跑。

### 1.1 与画布的关系

| 系统 | 角色 | 心智 |
|------|------|------|
| **画布（Workflow）** | 给人和 Agent 共同使用的「显式编排」工具 | 节点可见、可调、可复用 |
| **笔记本（Notebook）** | 给 Agent 自由发挥的「黑盒分析」工具 | 过程透明可观察，结论是终点产物 |

**一句话：画布管"流程"，笔记本管"洞察"。**

两个系统**严格分离**：

- 笔记本中 Agent 看不到画布工具，画布中 Agent 看不到笔记本工具
- 笔记本可以读取画布某节点的输出作为输入数据（启动时一次性灌入）
- 笔记本不能反向修改画布

### 1.2 核心交付物

一个 Notebook session 的最终产物 = `reports/main.md` + `artifacts/` 下的图表与中间数据。

用户对产物的操作仅限：

- 下载整个 workspace zip
- 复制 Markdown 报告到剪贴板
- 不能在笔记本里编辑报告（保证报告"可重跑、可追溯"的可信度）

---

## 2. 关键技术决策

| 维度 | 选择 |
|------|------|
| **运行环境** | 前端浏览器 Web Worker，Pyodide（WASM）|
| **隔离形态** | 主站对 `/notebook.html` 启用 Cross-Origin Isolation；笔记本作为独立 HTML 入口，通过 iframe 全屏覆盖嵌入主站 |
| **跨边界通信** | 主站 ↔ iframe 用 postMessage RPC；iframe ↔ Worker 用 postMessage |
| **数据持久化** | OPFS（Origin Private File System）按 sessionId 隔离 |
| **执行语义** | **无状态**：每次 `python_exec_*` 起新 globals，仅 import 缓存共享。等价于 `python -c` |
| **资源治理** | Worker 单 cell 60s 软超时（SIGINT）+ 90s 硬超时（terminate）；OPFS 单 session 配额 500MB |
| **跨平台** | Linux / Windows / macOS 一致 —— 不依赖 Docker、WSL、Hyper-V、独立用户、ACL 等 OS 沙箱原语 |

完整决策清单见 [验收与基线](验收与基线.md#决策汇总)。

---

## 3. 文档导航

| 文档 | 内容 |
|------|------|
| [架构与数据流](架构与数据流.md) | 整体架构图、iframe + Worker + Pyodide 三层进程模型、postMessage RPC 协议、OPFS 布局 |
| [执行模型](执行模型.md) | 无状态 exec 语义、import 缓存共享、stdout buffer、超时与中断、Worker 崩溃恢复 |
| [工具集协议](工具集协议.md) | 全部工具 spec、参数、返回格式、错误约定、prompt guidelines |
| [数据接入](数据接入.md) | 启动 dialog、画布节点 vs 数据源、CSV 编码与 Transferable、inputs/ 目录约定 |
| [UX 与交互](UX与交互.md) | 入口、首次加载、笔记本视图布局、文件树、消息流、报告导出、错误恢复 |
| [安全模型](安全模型.md) | COI/COEP、Worker 能力剥夺、jsglobals 锁定、OPFS 路径校验、红队用例清单 |
| [部署与构建](部署与构建.md) | Vite 多页面、Pyodide 自托管、Service Worker 缓存、COOP/COEP 头、构建产物布局 |
| [验收与基线](验收与基线.md) | M1 验收路径、性能基线、决策汇总、分期路线图 |

---

## 4. 关键实现位置

> 文档落档在前，代码尚未实现。下表是设计预定的代码位置，以便后续 PoC 与 M1 实现时落点一致。

| 领域 | 路径 | 职责 |
|------|------|------|
| Notebook 前端入口 | `notebook.html` + `src/notebook/main.ts` | iframe 内的独立 Vue 应用入口 |
| Notebook 主站组件 | `src/components/notebookAgent/` | 主站侧的入口按钮、对话框、iframe 容器 |
| Notebook 视图组件 | `src/notebook/components/` | iframe 内的消息流、文件树、文件预览 |
| Pyodide Worker | `src/notebook/worker/worker.ts`（+ `pyodideBoot.ts`）| Web Worker 内的 Pyodide kernel + RPC |
| 跨 iframe 协议 | `src/notebook/shared/parentBridge.ts` | postMessage RPC 协议（主站 ↔ iframe）|
| Notebook Agent Gateway | `src/server/notebookAgent/gateway.ts` | 复用 Pi SDK，独立于画布主链 |
| Notebook 工具 | `src/server/notebookAgent/tools.ts`（单文件，统一 `bridge.request` 转发壳）| python_exec / fs_* / todo_write / ask_user spec 与执行 |
| 工具 spec（共享）| `src/shared/notebookAgentTools.ts` | 前后端共享的工具 spec |
| HTTP 路由 | `src/server/modules/notebookAgentRoutes.ts` | `/api/notebook-agent/*` 入口 |
| Pyodide 资源 | `dist/pyodide/v0.27/...` | 自托管的 wasm + stdlib + wheel |

---

## 5. 复用与隔离

### 5.1 复用

- `src/server/piAgent/runtimeFactory.ts` —— 模型加载、provider 解析
- `src/server/piAgent/frontendBridge.ts` —— 前端工具执行 bridge（工具调用经此转发到 iframe 执行，gateway 实际复用项）
- `src/server/notebookAgent/eventBridge.ts` —— SSE 事件流封装（**notebook 自有同名文件**，非复用 piAgent/eventBridge.ts；因 notebook 工具执行走前端 bridge 而非画布数据通路，与 piAgent/eventBridge 实现不同）
- ⚠️ `safePayload.ts`：notebook **不复用**（notebook 不走画布 NodeResult 数据通路，工具返回直接回 Agent）
- 前端 `PiAgentMarkdownRenderer` / `AgGridTablePreview` / `ChartViewer` 等组件
- 统一 axios 请求层（`src/services/httpClient.ts`）

### 5.2 隔离

- 路由：`/api/notebook-agent/*` 与 `/api/pi-agent/*` 平级，零耦合
- Session：Notebook Agent 使用独立 sessionStore，不复用 piAgent 的 session 状态机
- 工具：spec、registry、bridge 都独立维护，不与 `src/shared/piWorkflowTools.ts` 共享
- 前端状态：iframe 内状态在 `src/notebook/runtime/notebookSessionRuntime.ts` 的 `reactive(...)`（**刻意不挂 Pinia**，notebook main.ts 保持极小依赖）；Todo 用 `notebookTodoStore.ts` 工厂函数；主站侧会话逻辑在 `useNotebookSession.ts` 组合式。独立于 `piAgentStore.ts`

---

## 6. 关键约束

### 6.1 必须避免的反模式

- ❌ 在 Notebook Agent 中暴露画布工具（破坏"画布管流程，笔记本管洞察"的产品定位）
- ❌ 让 Pyodide 跑在主线程（必须在 Worker 内）
- ❌ Worker 内保留 fetch / XHR / WebSocket / IDB / caches 等出站能力（除非 M2 的 micropip 白名单代理）
- ❌ 让 Pyodide 的 Python 代码访问 globalThis（必须用 jsglobals 锁定）
- ❌ NODEFS 挂载到 OPFS 之外的路径
- ❌ `python_exec_*` 跨调用共享变量面（违背"无状态"的明确决策）
- ❌ 在 Notebook 内部直接发起 HTTP 请求到主站后端（必须走 postMessage RPC 找主站代理）
- ❌ 让用户编辑 Agent 生成的报告（破坏可重跑可追溯）

### 6.2 新增 Notebook 工具的步骤

1. 在 `src/shared/notebookAgentTools.ts` 添加 spec
2. 在 `src/server/notebookAgent/tools.ts` 实现工具的服务端 schema 与执行入口（单文件，统一 `bridge.request` 转发壳）
3. 工具如果需要前端执行（如 `data_import_from_node` 在主站侧），通过 parentBridge 转发
4. 添加或更新工具 spec 一致性测试（前后端 registry 一一对应）
5. 更新 [工具集协议](工具集协议.md) 文档

### 6.3 文档同步规则

涉及以下变更时必须同步更新对应文档：

- 工具集变更 → [工具集协议](工具集协议.md)
- iframe / Worker / RPC 协议变更 → [架构与数据流](架构与数据流.md)
- 安全策略变更 → [安全模型](安全模型.md)
- 部署形态变更 → [部署与构建](部署与构建.md)
- 决策回退或调整 → [验收与基线](验收与基线.md) 的「决策汇总」

---

## 7. 相关文档

- [Agent 系统设计](../Agent系统.md) —— Pi Agent 主链与 Analysis 代理的边界
- [工作流系统](../workflow-system/index.md) —— 画布、节点、执行引擎、结果协议
- [工作流节点说明](../工作流节点说明.md) —— 节点清单与实现规范
