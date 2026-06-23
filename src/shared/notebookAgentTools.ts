/**
 * Notebook Agent 工具 spec 共享层（前后端共用）。
 *
 * 与画布工具集严格分离：
 *   - notebook 工具不出现在画布会话里
 *   - 画布工具不出现在 notebook 会话里
 *
 * spec 里描述用中文 + 关键约束（详见 docs/design-doc/notebook-agent/工具集协议.md）。
 *
 * 用 typebox 给参数 schema 打字以便 server 复用做 LLM tool definition。
 */

import { Type, type Static } from 'typebox'

export type NotebookToolName =
  | 'python_exec_inline'
  | 'python_exec_file'
  | 'python_packages'
  | 'fs_read'
  | 'fs_write'
  | 'fs_edit'
  | 'fs_list'
  | 'fs_grep'
  | 'todo_write'
  | 'ask_user'

export interface NotebookToolSpec {
  name: NotebookToolName
  description: string
  inputSchema: ReturnType<typeof Type.Object>
}

const PythonExecInlineSchema = Type.Object({
  code: Type.String({ description: 'Python 代码（无状态执行，每次新 globals）' }),
  timeoutMs: Type.Optional(Type.Number({ description: '超时毫秒，默认 60000，最大 300000' })),
})

const PythonExecFileSchema = Type.Object({
  path: Type.String({ description: '相对 workspace 的 .py 路径，必须以 scripts/ 开头' }),
  timeoutMs: Type.Optional(Type.Number({ description: '超时毫秒，默认 60000，最大 300000' })),
})

const PythonPackagesSchema = Type.Object({
  action: Type.Optional(
    Type.Union([Type.Literal('list'), Type.Literal('load')], {
      description:
        "默认 'list'：返回 runtime 已有包及加载状态；'load'：按需加载未预装的包（仅限 runtime 内已有 wheel）",
    }),
  ),
  packages: Type.Optional(
    Type.Array(Type.String(), {
      description: "action='load' 时必填，要加载的包名数组（必须在 runtime lock 中存在）",
    }),
  ),
})

const FsReadSchema = Type.Object({
  path: Type.String({
    description: '相对 workspace 的路径；必须以 inputs/ scripts/ artifacts/ reports/ 之一开头',
  }),
  offset: Type.Optional(Type.Number({ description: '起始行索引（默认 0）' })),
  limit: Type.Optional(
    Type.Number({
      description: '行数上限。文本默认 300 行，数据文件（.csv/.parquet 等）默认 10 行',
    }),
  ),
})

const FsWriteSchema = Type.Object({
  path: Type.String({ description: '相对 workspace 的路径' }),
  content: Type.String({ description: '文本内容（仅支持文本；二进制需用 plt.savefig 等 Python 路径）' }),
})

const FsEditSchema = Type.Object({
  path: Type.String({ description: '相对 workspace 的路径' }),
  oldStr: Type.String({ description: '要替换的字符串；默认必须在文件中唯一存在' }),
  newStr: Type.String({ description: '替换后的内容' }),
  replaceAll: Type.Optional(
    Type.Boolean({ description: '默认 false；为 true 时不要求唯一并替换全部出现' }),
  ),
})

const FsListSchema = Type.Object({
  path: Type.Optional(
    Type.String({ description: '相对路径（默认根，列出 4 个固定顶级目录）' }),
  ),
  recursive: Type.Optional(Type.Boolean({ description: '默认 false' })),
})

const FsGrepSchema = Type.Object({
  pattern: Type.String({ description: '正则表达式' }),
  path: Type.Optional(Type.String({ description: '搜索范围（默认整个 workspace）' })),
  fileGlob: Type.Optional(Type.String({ description: '类似 "scripts/*.py"' })),
  caseInsensitive: Type.Optional(Type.Boolean()),
  contextLines: Type.Optional(Type.Number({ description: '前后上下文行数，默认 0' })),
  maxMatches: Type.Optional(Type.Number({ description: '默认 50，上限 200' })),
})

const TodoItemSchema = Type.Object({
  title: Type.String({ description: '任务标题（1-100 字符）' }),
  status: Type.Union(
    [Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed')],
    { description: '任务状态' },
  ),
})

const TodoWriteSchema = Type.Object({
  items: Type.Array(TodoItemSchema, {
    description: '完整任务列表（全量覆盖语义）',
  }),
})

const AskUserOptionSchema = Type.Object({
  label: Type.String({ description: '选项文字（1-30 字符）' }),
  description: Type.Optional(Type.String({ description: '解释文字（≤80 字符）' })),
})

const AskUserSchema = Type.Object({
  question: Type.String({ description: '问题文本（中文 1-300 字符）' }),
  header: Type.String({ description: '短标签（≤12 字符），UI 显示为 chip' }),
  options: Type.Optional(Type.Array(AskUserOptionSchema)),
  multiSelect: Type.Optional(
    Type.Boolean({ description: '是否多选；默认 false 单选。仅控制单/多选交互，与 allowFreeText 独立' }),
  ),
  allowFreeText: Type.Optional(
    Type.Boolean({
      description: '是否允许自由文本输入（即使有 options 也可附"自由输入"项，类似 Claude Code 的 Other）',
    }),
  ),
  recommendedIndex: Type.Optional(Type.Number({ description: '推荐项索引' })),
})

export const NOTEBOOK_AGENT_TOOL_SPECS: readonly NotebookToolSpec[] = [
  {
    name: 'python_exec_inline',
    description:
      '执行一段一次性 Python 代码（等价 python -c）。无状态：每次都要重新 import 与读数据；想跨步骤复用就把中间结果落盘。【仅用于探查】shape / dtypes / describe / head / info / columns / 简短表达式 ≤20 行。【禁止】用于：数据分析、统计建模、绘图（plt.savefig/subplots）、含 def/class 的代码、多步骤代码、任何后续可能修改的代码 —— 这些必须先 fs_write 到 scripts/ 再用 python_exec_file，否则每次都要重写整段，浪费 token 且易出错。落盘路径强制约束：所有写文件操作（plt.savefig / df.to_csv / df.to_parquet / df.to_excel / open(path,"w") 等）必须以 artifacts/（中间产物）或 reports/（最终报告）开头，禁止写到工作区根或使用无前缀相对路径（如 "out.csv"）——否则文件不会同步到文件树，worker 重启后也会丢失。出图后 plt.close() 释放内存。',
    inputSchema: PythonExecInlineSchema,
  },
  {
    name: 'python_exec_file',
    description:
      '执行 workspace 里某 .py 脚本（等价 python myscript.py）。【这是分析/建模/绘图的默认执行方式】先 fs_write 到 scripts/<语义化名称>.py 再用本工具跑。命名建议：scripts/eda_<step>.py（探查）/ scripts/plot_<topic>.py（绘图）/ scripts/model_<name>.py（建模），便于后续定位修改。修改已有脚本时优先 fs_edit 局部替换（改列名/调参数/换算法）——先 fs_read 看当前内容再改，只有大重构才 fs_write 整文件覆盖。脚本内的所有写文件操作同样必须以 artifacts/ 或 reports/ 开头（见 python_exec_inline 的路径约束）。',
    inputSchema: PythonExecFileSchema,
  },
  {
    name: 'python_packages',
    description:
      '查询/加载 Python 运行时包。action=list（默认）：返回 runtime 内所有包及加载状态（loaded=立即可用 / notLoaded=runtime 有 wheel 但尚未加载）。action=load：按需加载指定包（仅限 runtime lock 内已有的包；加载后即可 import）。boot 预装的包（numpy/pandas/scipy/scikit-learn/matplotlib/seaborn/statsmodels）已全部 loaded。遇到 import 报 ModuleNotFoundError 时，先用本工具查：查到 notLoaded 的包先 load 再 import；查不到的包（runtime 没有）就换方案（如某可视化库 → matplotlib 手写）。无法装 runtime 外的包。',
    inputSchema: PythonPackagesSchema,
  },
  {
    name: 'fs_read',
    description:
      '读 workspace 文件。文本默认前 300 行，数据文件（csv/parquet 等）默认前 10 行；要看更多用 python_exec_inline 写代码。不要试图通过 offset/limit 翻完整张表。',
    inputSchema: FsReadSchema,
  },
  {
    name: 'fs_write',
    description:
      '整体覆盖写入文本文件。脚本写到 scripts/，中间产物落到 artifacts/，报告写到 reports/。引用图表用 ../artifacts/xxx.png 相对路径。',
    inputSchema: FsWriteSchema,
  },
  {
    name: 'fs_edit',
    description:
      '精确字符串替换式编辑。oldStr 默认必须在文件中唯一存在；不唯一时扩大上下文带几行；明确需要时传 replaceAll=true。',
    inputSchema: FsEditSchema,
  },
  {
    name: 'fs_list',
    description:
      '列目录内容。默认返回 4 个固定顶级目录；传 path 列子目录；传 recursive=true 递归。返回 entries 含 name / kind / size / modifiedAt。',
    inputSchema: FsListSchema,
  },
  {
    name: 'fs_grep',
    description:
      '在 workspace 内做 ripgrep 风格的全文搜索。仅扫描文本文件；单文件超过 1MB 仅扫描前 100KB；默认匹配上限 50（最多 200）。',
    inputSchema: FsGrepSchema,
  },
  {
    name: 'todo_write',
    description:
      '维护任务清单（全量覆盖）。进入分析前先写下 5-10 条任务；同一时刻只有一个 in_progress；任务粒度面向"清洗数据""相关性热力图"这种业务步骤，不要写成"调 fs_read"工具级粒度。',
    inputSchema: TodoWriteSchema,
  },
  {
    name: 'ask_user',
    description:
      '暂停 Agent，向用户提问。新分析进入时第一件事用本工具跟用户对齐目标（grill-me 风格刨根问底）；只在关键决策点打断用户，不要在每个细节都用。',
    inputSchema: AskUserSchema,
  },
]

export const getNotebookAgentToolSpec = (
  name: string,
): NotebookToolSpec | undefined =>
  NOTEBOOK_AGENT_TOOL_SPECS.find((spec) => spec.name === name)

// ──────────────────────────────────────────────
// 静态类型导出，前端 dispatcher 可以用作参数类型
// ──────────────────────────────────────────────

export type PythonExecInlineParams = Static<typeof PythonExecInlineSchema>
export type PythonExecFileParams = Static<typeof PythonExecFileSchema>
export type PythonPackagesParams = Static<typeof PythonPackagesSchema>
export type FsReadParams = Static<typeof FsReadSchema>
export type FsWriteParams = Static<typeof FsWriteSchema>
export type FsEditParams = Static<typeof FsEditSchema>
export type FsListParams = Static<typeof FsListSchema>
export type FsGrepParams = Static<typeof FsGrepSchema>
export type TodoWriteParams = Static<typeof TodoWriteSchema>
export type AskUserParams = Static<typeof AskUserSchema>
