# Notebook Agent 竞态 E2E 回归

本目录是对「system prompt 声称 `inputs/upstream.csv` 已写入，但 agent 首轮 `fs_list inputs/` 为空」竞态的 E2E 回归规格，独立于 `vitest`（已被 `vitest.config.ts` 的 `exclude` 排除）。

## 竞态背景

旧逻辑下，前端 `GET /api/notebook-agent/sessions/:id/events` 建立 SSE 订阅时，服务端 `subscribeNotebookAgentEvents()` 会**立即**触发 bootstrap prompt；而 `inputs/upstream.csv` 真正写入发生在 iframe 收到主站 `parent.import_csv` 之后。两者无同步，导致 agent 首轮 `fs_list` 看到空 `inputs/`。

## 修复思路

把「创建 session + 建立事件流」与「可以开始 bootstrap」解耦：

- `subscribeNotebookAgentEvents()` 改为只注册 listener，不直接启动 bootstrap。
- 新增显式「数据已导入」确认入口 `POST /api/notebook-agent/sessions/:id/ready`，由前端在 `parent.import_csv` 成功后调用（`useNotebookSession` 内 `notifySessionReady`）。
- 只有当 `streamSubscribed && dataReady` 同时满足，`tryStartNotebookBootstrap()` 才触发；`bootstrapStarted` 保证幂等。
- 导入失败时前端置 `failed` 态，不发 ready，agent 不误启动。

## 运行

前置：dev server 起在本机（`pnpm dev`，默认 `http://localhost:5173`）。

```bash
pnpm test:e2e
# 或直接
node e2e/notebook-bootstrap-race.spec.mjs
```

可选环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DEV_ORIGIN` | `http://localhost:5173` | dev server 地址 |
| `E2E_PRE_READY_WINDOW_MS` | 1000~1500 | ready 前观测窗口 |
| `E2E_POST_READY_WINDOW_MS` | 4000 | ready 后观测窗口 |
| `PLAYWRIGHT_CLI_GLOBAL_PATH` | 自动探测 | 全局 node_modules 根（找不到本地 playwright 时回退） |

## playwright 依赖策略

本仓库当前 pnpm store 版本与全局 pnpm 不一致，直接 `pnpm add` 会失败。`helpers/playwrightResolver.mjs` 因此采用：

1. 优先解析本地 `@playwright/test` / `playwright`（待 `pnpm install` 修复后自动生效）；
2. 回退到全局 `@playwright/cli` 自带的 `playwright`（基于 `process.execPath` 推导全局 node_modules）。

浏览器用 `channel: 'chrome'` 复用系统 Chrome，无需额外下载 headless shell。

## 断言边界

- **确定性断言**：仅订阅 events、ready 前，不应有任何 agent 启动事件（`session.status` / `message.start` / `tool.start`）。这是竞态修复的核心，与真实模型无关。
- **宽松判定**：ready 后的 bootstrap 触发依赖真实模型，可能因网络/配额静默失败。spec 用宽松窗口观测，若环境无可用模型则打印观测、不阻断回归（避免真实 LLM 不稳定污染回归）。
- **协议幂等**：重复 `ready` 始终返回 200，去重由服务端 gateway 保证（gateway 单测覆盖重复 ready 不重复 bootstrap）。

## 与单元测试的分工

| 层次 | 覆盖 |
| --- | --- |
| `gateway.spec.ts` | `tryStartNotebookBootstrap` 的 `streamSubscribed && dataReady` 双条件、重复 ready 幂等 |
| `useNotebookSession.spec.ts` | 前端 import 成功后才发 ready、失败置 `failed` 不发 ready |
| `notebookAgentRoutes.spec.ts` | `POST /ready` 路由 200/404 |
| 本 E2E | 真实 dev server 黑盒时序：subscribe 不 bootstrap、ready 后才启动、ready 幂等 |

## 观测产物

人工排查时可用 `playwright-cli` 走一次真实 Notebook 启动，抓 `trace` / `requests` / `console`。竞态时序证据见本目录历史观测记录。
