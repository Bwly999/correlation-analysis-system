# Notebook Agent · M1 验收对照表

本文档把 [验收与基线 §1.2 验收 Gate](../docs/design-doc/notebook-agent/验收与基线.md#12-验收-gate) 的 17 项落到具体的自动化 / 手动验收路径，并标记当前 M1 实现下每项的覆盖状态。

> 命名约定：
> - **UNIT**：vitest 已覆盖
> - **MANUAL**：需要 dev 起服后人工点
> - **E2E**：需要 Playwright（M1 暂不引入；M2 计划建立基础设施）

| # | Gate | 覆盖类型 | 落点 |
|---|------|---------|------|
| 1 | 主站顶部菜单按钮可点击，弹出 dialog | UNIT | `src/components/notebookAgent/__tests__/NotebookLauncher.spec.ts` |
| 2 | dialog 列出当前画布上所有可用节点 | UNIT | `src/components/notebookAgent/__tests__/NewNotebookDialog.spec.ts`（mock 数据源） |
| 3 | 选中节点 + 点 "开始分析" → iframe 出现 | UNIT | `NotebookFrame.spec.ts` 渲染契约 + `NotebookLauncher.spec.ts` emit start |
| 4 | iframe 显示加载进度，含具体阶段 / 包名 | MANUAL | `notebook.html` + `App.vue` 的"启动中：xxx"徽标；运行 `pnpm dev` → 访问 `/notebook.html` 观察 |
| 5 | 加载完成（≤ 90s 冷启动 / ≤ 5s 热启动）| MANUAL | 同上；性能基线由浏览器实测 |
| 6 | 笔记本就绪后 Agent 自动开始 grill | E2E | 服务端 gateway 的 LLM 推理接入留迭代二，M1 仅 system prompt 含 grill-me 风格（`systemPrompt.spec.ts`） |
| 7 | Agent 用 ask_user 提问，UI 卡片显示选项 | UNIT | `askUserQueue.spec.ts` 队列行为；UI 卡片渲染留 M2 |
| 8 | 用户选项 → Agent 继续推理 | UNIT | 同上：`askUserQueue.resolve` 路径 |
| 9 | Agent 用 todo_write，TODO 面板渲染 | UNIT | `notebookTodoStore.spec.ts`（store 行为）；面板组件留 M2 |
| 10 | Agent 用 python_exec_inline，stdout 流式显示 | UNIT + MANUAL | `workerHost.spec.ts` 协议；流式 UI 留 M2 |
| 11 | Agent 用 fs_write 写脚本和报告，文件树 2s 内出现 | UNIT | `useWorkspaceTree.spec.ts` 轮询行为 + `fsTools.spec.ts` |
| 12 | Agent 出图 plt.savefig 到 artifacts/，文件树出现 .png | MANUAL | 走 Pyodide 真启；`workspaceExporter.spec.ts` 已确认 png 文件能被 zip 打包 |
| 13 | 点 reports/main.md → 预览面板显示渲染后的 Markdown，图表内联可见 | UNIT | `NotebookView.spec.ts` 点击 .md → 渲染 + `markdownRenderer.spec.ts` sanitize |
| 14 | 点 "下载 zip" → 文件正确生成，包含全部产物 | UNIT | `workspaceExporter.spec.ts` |
| 15 | 关闭笔记本 → iframe 销毁，回到画布 | UNIT | `NotebookFrame.spec.ts` close 触发 emit + dispose |
| 16 | 安全清单 20 项全过 | UNIT + E2E | `redTeamUnits.spec.ts` 覆盖单测可校验 8 项；其余（Pyodide jsglobals、Worker fetch 删除等）需要 Pyodide 真启 |
| 17 | 性能基线全过 | UNIT + MANUAL | `performance.spec.ts` 覆盖 fs_* 基线（10x 防回归 budget）；Pyodide 启动时间需浏览器实测 |
| 18 | Linux + Windows 本地都能运行整套验收 | MANUAL | Vitest 在两个平台均跑通；浏览器侧待手动验证 |

---

## 自动化验收命令

```bash
# 单元 / 组件 / 协议层（80+ 测试）
pnpm vitest run src/notebook src/shared src/components/notebookAgent src/server/notebookAgent

# 类型检查
pnpm type-check
```

## 手动验收

1. `pnpm dev`
2. 访问 `http://localhost:5173/notebook.html`
3. 观察顶部 "COI ✓" 与 "SAB ✓" 徽标
4. 点击红队卡片：
   - ✅ pandas describe（Pyodide + pandas 链路通畅）
   - 🛡 from js import 阻断（jsglobals 锁定）
   - ⏱ while True 中断（点"中断"按钮 → 5s 内 KeyboardInterrupt）
   - 🌐 COI 头部
5. 自由编辑器中粘贴 Python 代码并执行

## 已知未覆盖（迁移计划见 [验收与基线 §4.1 / §4.2](../docs/design-doc/notebook-agent/验收与基线.md)）

- LLM 推理 / SSE 工具调用流（M1 提供路由 + sessionStore；推理接入复用 piAgent 的 SDK 留迭代二）
- 三栏 UI 的工具卡片渲染（python_exec_* / fs_write 卡片样式）
- ask_user 卡片 UI（卡片样式参考 grill-me skill）
- TODO 面板组件
- Playwright E2E（M2 引入）
