# 简历优化方案：面向 AI Agent 开发岗位

> **用途**：投递 AI Agent 开发工程师/AI 应用开发/LLM 工程师岗位时，简历项目该怎么写、该突出什么、该回避什么。
> **方法论**：先列 JD 真实要求（来自招聘市场调研），再逐条映射到本项目的实证能力，最后给出简历可直接复制的文案 + 面试话术。
> **核心原则**：① 只写有代码/文档证据的（不被穿）② 主动暴露取舍（显得真懂）③ 把项目重新"翻译"成 Agent 岗位语言。

---

## 一、Agent 岗位到底 care 什么（市场调研结论）

综合 2025 年招聘信息（[南开/国家大学生就业网 JD](https://career.nankai.edu.cn/correcruit/content/id/116181.html)、[瀚纳仕 AI/Agent 平台开发](https://hays-china.career.gllue.com/jobs/2415)、[Anthropic 上下文工程](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)、[PromptEngineeringGuide Agent 模块](https://www.promptingguide.ai/research/llm-agents)），核心能力图谱按权重排序：

| 权重 | 能力维度 | JD 原文关键词 |
|------|---------|-------------|
| ★★★★★ | **工具调用（Tool Use / Function Calling）** | Function Calling、Tool Use、MCP、工具调用编排 |
| ★★★★★ | **Agent 架构与编排** | 任务规划、多轮对话、自主决策、Agent 设计模式、ReAct/反思 |
| ★★★★ | **LLM 工程实践** | 多 provider 接入、流式输出、上下文管理、Prompt 工程 |
| ★★★★ | **记忆与上下文工程** | 上下文窗口管理、会话持久化、检索、状态管理 |
| ★★★ | **评测与可靠性** | Agent 行为评测、回归测试、可观测性 |
| ★★★ | **RAG / 知识库** | 向量检索、语义检索、知识库管理 |
| ★★ | **安全与防护** | Prompt Injection 防护、沙箱、越权 |
| ★★ | **框架经验** | LangChain/LangGraph/LlamaIndex、MCP |

> ⚠️ **关键认知**：Agent 岗位**不太 care** 你前端用 Vue 还是 React，也不太 care 工作流画布。他们 care **你懂不懂让 LLM 可靠地调工具、做规划、管上下文、能评测**。所以简历要**把项目重新叙事**——从"工作流平台"叙事，转成"AI Agent 系统"叙事。

---

## 二、本项目能命中 JD 的哪些点（实证映射，含证据）

> 这是关键自查表。每一项都标了代码/文档锚点，**只列有实证的，没做到的诚实标"缺口"**。

### ✅ 强命中（简历主武器）

| JD 能力 | 本项目实证 | 证据锚点 |
|---------|-----------|---------|
| **工具调用编排** | 自研 FrontendBridge：toolCallId 配对的请求-响应桥接、Promise 挂起/恢复、超时续期心跳、共享 spec 驱动的工具注册 | `frontendBridge.ts`、`shared/piWorkflowTools.ts` |
| **多 provider LLM 接入** | 从 baseUrl 推断 provider（DeepSeek/OpenAI/OpenRouter/Groq/Mistral...），OpenAI-compatible 统一协议；运行时热切换模型 | `runtimeFactory.ts` |
| **Agent 架构（规划+循环）** | grill-me 需求澄清 → todo_write 任务规划 → 无状态执行循环 → stop_diagnosis 停止诊断 | `notebookAgent/systemPrompt.ts`、`gatewayStopDiagnosis.ts` |
| **流式输出** | 统一事件流协议（标准 SSE，fetch + 手写解析）：message.delta/thinking_delta/tool.start-end/十几种事件类型 | `eventBridge.ts`、`sseStream.ts` |
| **会话持久化与恢复** | Pi SDK SessionManager + 会话归档 + 断线快照恢复（`recoverSessionState`）+ Notebook 跨设备 workspace zip 恢复 | `sessionStore.ts`、`pushWorkspaceSnapshot` |
| **Prompt 工程** | 两套工程化 system prompt（Pi Agent 编排型 / Notebook 自由分析型），含强约束、grill-me 风格、执行循环规范 | `piAgent/systemPrompt.ts`、`notebookAgent/systemPrompt.ts` |
| **Agent 评测** | XML 用例集驱动的端到端评测（6 维度：目标理解/数据画像/方法规划/工作流执行/自修复/证据报告）| `scripts/agentic-analysis-evaluation/`、`docs/evaluations/` |
| **沙箱安全** | 6 层纵深防御 + 20 项红队回归（prompt injection、WASM 沙箱、能力剥夺）| `安全模型.md`、`tests/notebook-agent/security/` |

### ⚠️ 中等命中（可提，但别当主力吹）

| JD 能力 | 本项目现状 | 怎么讲 |
|---------|-----------|--------|
| **MCP（Model Context Protocol）** | **曾经接入过 opencode/MCP，已废弃**，当前用 Pi SDK 工具调用 | 老实说"评估过 MCP，最终选了 Pi SDK 工具调用方案"——体现选型判断力，**别假装现在是 MCP 方案** |
| **多 Agent 协作** | 是"三个独立 Agent 子系统"，**不是多 Agent 协作**（它们互不通信）| 别吹"多 Agent 协作"，讲"多 Agent 子系统架构 + 工具集严格隔离" |
| **可观测性** | 有审计日志（ring buffer + 关键事件上报）、会话归档、诊断日志 | 可讲，但不是 OpenTelemetry 级别的分布式追踪 |
| **反思机制** | `stop_diagnosis` 判断"只读后停止"并提示续问，算轻量反思 | 别吹成 ReAct/Reflection，讲成"停止原因诊断 + 续问引导" |

### ❌ 缺口（面试被问到要诚实，别装）

| JD 能力 | 缺口 | 诚实说法 |
|---------|------|---------|
| **RAG / 向量检索** | 项目无向量库、无 embedding 检索 | "我的项目是工具调用型 Agent，不是 RAG 型；但理解 RAG 原理（向量库/语义检索/chunking）" |
| **LangChain/LangGraph** | 用的是 Pi SDK，不是主流框架 | "我用的是 pi-coding-agent SDK，原理和 LangGraph 的工具调用循环一致，能快速迁移" |
| **大规模并发** | 单进程内存 Map 管理会话，没做分布式 | "当前是单实例，会话存内存 Map；分布式需要把 session state 外移到 Redis" |
| **长记忆（跨会话）** | 会话级记忆，无跨会话长期记忆 | "目前是会话内记忆 + 归档，跨会话长期记忆没做" |

---

## 三、简历文案建议（可直接复制 + 按投递岗位微调）

### 3.1 项目标题与定位（**重新叙事，去工作流化**）

❌ **不要这么写**（太偏前端/工作流，Agent 岗位 HR 会跳过）：
> 多因子相关性分析系统 —— Vue3 工作流编辑器

✅ **建议这么写**（Agent 岗位语言）：
> **AI Agent 数据分析平台** —— 基于 LLM 工具调用的多 Agent 系统
> - 自研 3 个独立 Agent 子系统（工作流编排 / 代码编程 / 自由数据分析），覆盖"显式编排"与"自由分析"两种 Agent 范式
> - 技术栈：TypeScript · Pi Agent SDK · Vercel AI SDK · Fastify · Pyodide(WASM) · Vue 3

### 3.2 项目要点（按 JD 权重排序，挑 5-6 条）

**1. 工具调用编排（★★★★★ 命中）**
> 设计并实现「前端执行 + 后端调度」的 Agent 工具调用架构：LLM 推理在后端、工具执行在浏览器，通过 toolCallId 配对的请求-响应桥接（Promise 挂起/恢复 + 超时续期心跳）联动；工具元数据由共享 spec 单源驱动，前后端按 executorKey 注册执行器，**缺失即失败**保证配置一致性。

**2. Agent 架构：规划-执行-诊断循环（★★★★★ 命中）**
> 实现完整的 Agent 工作循环：grill-me 式需求澄清 → todo_write 任务规划 → 无状态工具执行 → 停止原因诊断（区分正常结束/只读后停止/中断/失败并引导续问）；支持用户插话排队、followUp、continue 续跑等多种会话恢复语义。

**3. 多 provider LLM 接入与流式（★★★★ 命中）**
> 基于 OpenAI-compatible 协议统一接入 DeepSeek/OpenAI/OpenRouter/Groq 等多家 LLM；设计统一事件流协议承载十几种事件类型（流式文本/思考链/工具调用/会话状态），支持对话中热切换模型。

**4. 浏览器 Python 沙箱 Agent（★★★★ 命中 + 差异化亮点）**
> 构建基于 Pyodide(WASM) 的 AI 数据分析 Agent，让 LLM 在浏览器 Web Worker 内自由编写并执行 Python；设计 6 层纵深防御安全模型（WASM 沙箱/iframe COI 隔离/jsglobals 锁定/出站能力剥夺/超时配额/审计日志）+ 20 项红队回归测试。

**5. Agent 评测体系（★★★ 命中，体现工程化）**
> 搭建 XML 用例集驱动的 Agent 端到端评测，覆盖 6 个能力维度（目标理解/数据画像/方法规划/工作流执行/自修复/证据报告），每个用例声明 requiredTools 与 acceptance 标准，CI 自动化回归。

**6. 会话持久化与恢复（★★★★ 命中）**
> 实现 Agent 会话全生命周期管理：会话归档、断线快照恢复（断线后 GET 会话状态完整重建消息/工具调用/停止原因）、Notebook workspace 跨设备恢复（OPFS + 服务端 zip 兜底）。

### 3.3 技术关键词（ATS 友好，按 JD 高频词）

> **Agent 核心**：LLM 工具调用 / Function Calling、Tool Use 编排、Agent 工作循环（规划-执行-反思）、Prompt Engineering、多 provider LLM 接入、流式推理、上下文管理、会话持久化、Agent 评测、沙箱安全、Prompt Injection 防护
>
> **协议/框架**：OpenAI-compatible API、Model Context Protocol（评估过）、Pi Agent SDK、Vercel AI SDK
>
> **工程**：TypeScript、Fastify、Web Worker、WASM/Pyodide、OPFS、Vue 3

---

## 四、面试高频问题预案（Agent 岗位专属）

### Q：你的 Agent 用什么工具调用框架？为什么不用 LangChain？
> "我用的是 pi-coding-agent SDK，它和 LangGraph 的核心循环一致——都是 LLM 决定调工具 → 执行 → 结果回灌 → 继续推理。选它是因为它原生支持会话持久化（SessionManager）和工具定义（defineTool），且我们的工具执行端在浏览器（前端执行型 Agent），需要一个能桥接前后端的架构。原理上迁移到 LangGraph 很快，差异主要在工具执行的运行时位置。"

### Q：怎么保证 Agent 调工具的可靠性？
> "三层：① 共享 spec 单源驱动，前后端按 executorKey 注册，缺失即抛错，杜绝静默漏配；② toolCallId 全流程配对，前端执行完 POST 回结果 resolve 后端挂起的 Promise；③ 超时续期心跳，长任务（如跑 Python 600s）前端每 10s 发 tool-progress 续期，防误杀。"

### Q：Agent 评测怎么做？
> "XML 用例集驱动，每个用例声明 goal、requiredTools、acceptance。覆盖 6 个能力维度。acceptance 校验报告是否包含特定方法（如 Pearson）+ 是否引用了 evidenceId。跑在 scripts/agentic-analysis-evaluation/ 里，CI 自动化。老实说我这个评测偏功能正确性，对 LLM 输出的语义质量评测还比较粗。"

### Q：你的 Agent 有记忆机制吗？怎么管上下文？
> "会话级记忆：Pi SDK 的 SessionManager 管理会话历史，能持久化到 sessionFile；断线后拉快照重建。Notebook 还做了跨设备恢复——workspace 打成 zip 上传服务端，OPFS 空时拉回。但**没有跨会话长期记忆、没有向量检索**，这块是缺口，如果是 RAG 重度的岗位我会说明理解原理但项目里没实践。"

### Q：怎么防 Prompt Injection？
> "Notebook Agent 这块做了硬工程：6 层纵深防御。重点三层：① Worker 出站能力剥夺（删 fetch/XHR/WebSocket），LLM 即便被注入也发不出数据；② Pyodide jsglobals 锁定，Python 拿不到 globalThis；③ 路径校验 + 配额。配 20 项红队回归（包括注入场景）。但 Pi Agent 主链那块因为是工作流编排，注入风险低些，主要靠系统提示词约束。"

### Q：RAG 你做过吗？（**高风险题，缺口**）
> "这个项目是工具调用型 Agent，没有 RAG。但我理解 RAG 的完整链路：文档 chunking → embedding → 向量库（FAISS/PGVector/Milvus）→ 语义检索 → 上下文拼接。如果岗位需要，我能快速补，因为检索-增强-生成这条链路和我的会话上下文管理是同构的。"
> ⚠️ **绝对不要装做过**，被追问 chunking 策略/embedding 模型选型就穿了。

---

## 五、按投递岗位类型的差异化建议

### 5.1 投"AI Agent 开发"（纯 Agent 岗）
- **主武器**：工具调用架构、Agent 工作循环、评测体系
- **弱化**：工作流画布、前端 UI（一句话带过）
- **必备**：诚实承认 RAG/LangChain 缺口，强调"工具调用型 Agent 深度"

### 5.2 投"AI 应用开发 / LLM 应用"（偏全栈 AI）
- **主武器**：多 provider 接入、流式、Prompt 工程、浏览器沙箱（差异化）
- **平衡**：前端能力可以多写点（Vue3 + 工程化），这类岗位看全栈
- **加分**：安全模型 + 红队回归（很多 AI 应用岗缺这个）

### 5.3 投"AI 平台 / AI Infra"（偏平台工程）
- **主武器**：多 Agent 子系统架构、双存储抽象、组合根 DI、会话编排
- **必备**：会承认"当前单实例，分布式是下一步"
- **加分**：评测体系、可观测性（审计日志）

### 5.4 投"数据分析 / BI + AI"（业务+AI）
- **主武器**：Notebook Agent（Pyodide 自由分析）、30 个分析节点、相关性/回归/SHAP
- **叙事**：突出"让 LLM 当数据科学家"，这是强差异化

---

## 六、⚠️ 简历红线（千万别这么写）

1. **别把"协议本身"当亮点吹** —— 当前是标准 SSE，对齐业界主流；亮点应是"刻意不依赖 SSE 自动重连、改用快照恢复"的工程判断，而非协议格式
2. **别写"多 Agent 协作"** —— 是多独立 Agent 子系统，不是协作，被穿
3. **别写"基于 MCP 的 Agent"** —— MCP 已废弃，当前是 Pi SDK 工具调用
4. **别写"实现了 RAG"** —— 没有，被穿
5. **别写"LangChain/LangGraph 实战"** —— 用的是 Pi SDK，可以写"原理等同，可迁移"
6. **别把工作流画布/Vue Flow 当核心** —— Agent 岗位不 care，一笔带过

---

## 七、一句话电梯陈述（按岗位选）

**投纯 Agent 岗**：
> "我设计实现了一个基于 LLM 工具调用的多 Agent 系统，核心是「前端执行+后端调度」的工具调用架构和完整的规划-执行-诊断工作循环，含 3 个独立 Agent 子系统和浏览器 Pyodide 沙箱；配套 XML 驱动的 6 维度 Agent 评测体系。"

**投 AI 应用岗**：
> "我设计实现了一个 AI 数据分析平台，统一接入多家 LLM、自研流式事件协议，落地了基于浏览器 Pyodide 沙箱的自由分析 Agent（含 6 层纵深安全模型），覆盖工具调用、Prompt 工程、会话恢复全链路。"

---

## 附：证据自查清单（简历每条主张都要能指到代码）

| 简历主张 | 证据文件 |
|---------|---------|
| 工具调用桥接 | `frontendBridge.ts` |
| 共享 spec 驱动 | `shared/piWorkflowTools.ts` |
| 规划-执行-诊断循环 | `notebookAgent/systemPrompt.ts`、`gatewayStopDiagnosis.ts` |
| 多 provider 接入 | `runtimeFactory.ts` |
| 流式事件协议 | `eventBridge.ts`、`sseStream.ts` |
| 6 维度评测 | `scripts/agentic-analysis-evaluation/`、`docs/evaluations/*.xml` |
| 6 层安全 + 红队 | `安全模型.md`、`tests/notebook-agent/security/` |
| 会话持久化恢复 | `sessionStore.ts`、`pushWorkspaceSnapshot` |
| Pyodide 沙箱 | `pyodideBoot.ts`、`opfsAccess.ts` |
