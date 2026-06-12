/**
 * 演示用 mock fixture：覆盖 §5 全部卡片形态、§3.4 runtime 状态、§3 三栏结构。
 *
 * App.vue 在 ?demo=ux 模式下使用本 fixture 渲染 NotebookView。
 * 用于 UX 设计阶段独立验收，未连真实 Pi Agent。
 */
import type {
  NotebookSessionVm,
  NotebookMessage,
  TodoItem,
} from '../types/messageStream'

const baseTime = Date.UTC(2026, 5, 12, 10, 0, 0)

const todos: TodoItem[] = [
  { id: 't1', text: '数据概览与缺失值检查', state: 'completed' },
  { id: 't2', text: '单调性分析与目标变量分布', state: 'in_progress' },
  { id: 't3', text: '多因子建模（Lasso / RF）', state: 'pending' },
  { id: 't4', text: '形成结论与导出报告', state: 'pending' },
]

const messages: NotebookMessage[] = [
  {
    id: 'u-1',
    role: 'user',
    at: baseTime,
    text: '帮我看看「数据清洗-2025Q2」里这份用户流失数据，找几个最相关的因子，写一份报告。',
  },
  {
    id: 'a-1',
    role: 'assistant',
    at: baseTime + 1500,
    blocks: [
      {
        kind: 'thinking',
        data: {
          id: 'th-1',
          durationMs: 1180,
          text:
            '先确认数据规模与字段类型，再做缺失值与目标变量分布。churn 多半是 0/1，先看类别均衡情况。',
        },
      },
      {
        kind: 'text',
        data: {
          id: 'tx-1',
          text:
            '收到。我先把数据载入并扫一遍**结构与分布**，然后再决定建模策略。',
        },
      },
      {
        kind: 'tool',
        data: {
          id: 'tl-1',
          kind: 'python_exec',
          variant: 'inline',
          status: 'success',
          durationMs: 234,
          code:
            "import pandas as pd\n" +
            "df = pd.read_csv('inputs/upstream.csv')\n" +
            "print('shape:', df.shape)\n" +
            "print('dtypes:')\n" +
            "print(df.dtypes.head(8))",
          stdout:
            "shape: (12488, 24)\n" +
            "dtypes:\n" +
            "userId      object\n" +
            "age          int64\n" +
            "region      object\n" +
            "tenure       int64\n" +
            "monthly_fee float64\n" +
            "service_q   float64\n" +
            "complaint   object\n" +
            "churn        int64",
          stderr: '',
        },
      },
      {
        kind: 'tool',
        data: {
          id: 'tl-2',
          kind: 'python_exec',
          variant: 'inline',
          status: 'success',
          durationMs: 318,
          code:
            "print('churn 分布：')\n" +
            "print(df['churn'].value_counts(normalize=True))\n" +
            "print('缺失率前 5：')\n" +
            "print(df.isna().mean().sort_values(ascending=False).head(5))",
          stdout:
            "churn 分布：\n" +
            "0    0.952\n" +
            "1    0.048\n" +
            "Name: churn, dtype: float64\n" +
            "缺失率前 5：\n" +
            "service_q    0.082\n" +
            "monthly_fee  0.014\n" +
            "complaint    0.011",
          stderr: '',
        },
      },
      {
        kind: 'ask_user',
        data: {
          id: 'ask-1',
          status: 'pending',
          question:
            '这个数据集里 churn=0 占 95.2%，存在严重不平衡。你希望优先：',
          options: [
            {
              id: 'opt-keep',
              label: '维持现状，分析自然分布',
              detail: '适合：探索性分析、单变量趋势',
              recommended: true,
            },
            {
              id: 'opt-smote',
              label: '使用 SMOTE 等方法平衡再建模',
              detail: '适合：直接训练分类模型',
            },
            {
              id: 'opt-let-agent',
              label: '让 Agent 决定',
            },
          ],
          allowFreeText: true,
        },
      },
    ],
  },
  {
    id: 'u-2',
    role: 'user',
    at: baseTime + 8000,
    text: '维持现状，先看自然分布里哪些因子和 churn 最相关。',
  },
  {
    id: 'a-2',
    role: 'assistant',
    at: baseTime + 9000,
    blocks: [
      {
        kind: 'tool',
        data: {
          id: 'todo-1',
          kind: 'todo_write',
          status: 'success',
          durationMs: 4,
          items: todos,
        },
      },
      {
        kind: 'text',
        data: {
          id: 'tx-2',
          text: '好。我把分析步骤先列下来，然后接着跑相关性矩阵。',
        },
      },
      {
        kind: 'tool',
        data: {
          id: 'tl-3',
          kind: 'fs_write',
          status: 'success',
          durationMs: 12,
          path: 'scripts/02_corr.py',
          bytes: 2412,
          preview:
            "# 相关性矩阵\nimport pandas as pd\nfrom scipy.stats import pointbiserialr\n\ndf = pd.read_csv('inputs/upstream.csv')\nnum_cols = df.select_dtypes('number').columns",
        },
      },
      {
        kind: 'tool',
        data: {
          id: 'tl-4',
          kind: 'python_exec',
          variant: 'file',
          status: 'success',
          durationMs: 1872,
          code: 'scripts/02_corr.py',
          stdout:
            "Top 8 相关因子（point-biserial r vs churn）\n" +
            "complaint_count   0.421\n" +
            "service_q        -0.387\n" +
            "tenure           -0.342\n" +
            "monthly_fee       0.298\n" +
            "late_payment      0.276\n" +
            "support_ticket    0.241\n" +
            "age               0.103\n" +
            "region_East      -0.082",
          stderr: '',
        },
      },
      {
        kind: 'tool',
        data: {
          id: 'tl-5',
          kind: 'fs_grep',
          status: 'success',
          durationMs: 9,
          pattern: 'lasso',
          scope: 'scripts/*.py',
          matches: [
            { path: 'scripts/02_corr.py', line: 12, text: '# TODO: try lasso for sparse selection' },
            { path: 'scripts/02_corr.py', line: 47, text: '# lasso path will sit in a separate cell' },
          ],
        },
      },
      {
        kind: 'tool',
        data: {
          id: 'tl-6',
          kind: 'fs_read',
          status: 'failed',
          durationMs: 3,
          path: 'data.csv',
          linesShown: 0,
          content: '',
          truncated: false,
          errorMessage:
            '路径越界：路径必须以 inputs/scripts/artifacts/reports 之一开头，得到 "data.csv"',
        },
      },
      {
        kind: 'tool',
        data: {
          id: 'tl-7',
          kind: 'fs_write',
          status: 'success',
          durationMs: 8,
          path: 'reports/main.md',
          bytes: 4318,
          preview:
            '# 用户流失因子探索分析\n\n> 数据来源：画布节点「数据清洗-2025Q2」\n> 行列：12,488 × 24\n\n## 1. 数据概览\n\n目标变量 churn 为二分类，0/1 分布约 95:5，存在显著不平衡...',
        },
      },
      {
        kind: 'text',
        data: {
          id: 'tx-3',
          text:
            '初稿写到 `reports/main.md` 了。**Top 5 相关因子**：投诉次数、服务质量、在网时长、月费、逾期次数。下一步我会做单调性检验，确认这些因子的方向是否稳定。',
        },
      },
    ],
    streaming: true,
  },
]

export const demoSession: NotebookSessionVm = {
  sessionId: 'demo-2026-06-12',
  title: '用户流失因子探索',
  phase: { kind: 'ready' },
  agent: 'awaiting_user',
  runtime: {
    memoryMb: 234,
    cellCount: 12,
    agentSeconds: 313,
    isRunning: false,
  },
  messages,
  todos,
  connection: 'online',
}

/** 用于演示加载页 */
export const demoLoading: NotebookSessionVm = {
  ...demoSession,
  agent: 'idle',
  phase: {
    kind: 'loading',
    progress: { stage: 'load_packages', percent: 62, detail: 'pandas (12.3 / 100 MB)' },
  },
  messages: [],
}

/** 用于演示加载失败 */
export const demoLoadFailed: NotebookSessionVm = {
  ...demoSession,
  agent: 'idle',
  phase: {
    kind: 'failed',
    failure: {
      reason: '网络错误',
      detail: '无法加载 /pyodide/v0.27/pandas.whl',
    },
  },
  messages: [],
}
