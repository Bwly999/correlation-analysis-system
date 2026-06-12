<script setup lang="ts">
/**
 * Notebook iframe 主入口。
 *
 * 三种模式（由 URL query 切换）：
 *
 *   - 默认（无 query）           → UX 演示：用 demoSession fixture 渲染完整 NotebookView
 *   - ?demo=loading              → 演示加载中遮罩
 *   - ?demo=failed               → 演示加载失败遮罩
 *   - ?demo=poc                  → PoC 红队验证页（保留既有用例）
 *
 * 真实 Pi Agent 接入时，将由父站 postMessage 灌入消息流；本组件只负责渲染。
 */

import { computed, onMounted, ref } from 'vue'
import NotebookView from './components/NotebookView.vue'
import { createMemOpfsRoot } from './shared/__tests__/memOpfs'
import { ensureWorkspaceTree, writeFile, type OpfsDirectoryHandle } from './shared/opfsAccess'
import { demoSession, demoLoading, demoLoadFailed } from './fixtures/demoSession'
import type { NotebookConversation, NotebookSessionVm } from './types/messageStream'
import PocApp from './PocApp.vue'

const params = new URLSearchParams(window.location.search)
const mode = params.get('demo') ?? 'ux'

const opfsRoot = ref<OpfsDirectoryHandle | null>(null)
const session = ref<NotebookSessionVm>(demoSession)

// 演示态对话列表：列出几条历史会话，匹配 Claude Desktop 设计
const conversations = ref<NotebookConversation[]>([
  {
    id: 'c-current',
    title: '用户流失因子探索分析',
    updatedAt: Date.now(),
  },
  {
    id: 'c-1',
    title: '画布节点与运行时联调',
    updatedAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: 'c-2',
    title: '看板 A/B 对比草稿',
    updatedAt: Date.now() - 1000 * 60 * 60 * 28,
  },
  {
    id: 'c-3',
    title: '复购率单调性专题',
    updatedAt: Date.now() - 1000 * 60 * 60 * 72,
  },
])
const activeConversationId = ref<string>('c-current')

onMounted(async () => {
  if (mode === 'poc') return

  const root = createMemOpfsRoot()
  await ensureWorkspaceTree(root)

  // 灌一些样例文件
  await writeFile(
    root,
    'inputs/upstream.csv',
    'userId,age,region,churn\nu_001,28,East,0\nu_002,34,West,1\nu_003,41,North,0\n',
  )
  await writeFile(root, 'inputs/upstream.meta.json', JSON.stringify({
    rowCount: 12488,
    columnCount: 24,
    sourceLabel: '数据清洗-2025Q2',
  }, null, 2))
  await writeFile(
    root,
    'scripts/01_explore.py',
    `# 数据探索\nimport pandas as pd\n\ndf = pd.read_csv('inputs/upstream.csv')\nprint('shape:', df.shape)\nprint('描述统计：')\nprint(df.describe(include='all').to_string())\n`,
  )
  await writeFile(
    root,
    'scripts/02_corr.py',
    `# 相关性矩阵\nimport pandas as pd\nfrom scipy.stats import pointbiserialr\n\ndf = pd.read_csv('inputs/upstream.csv')\nnum_cols = df.select_dtypes('number').columns\n\nfor c in num_cols:\n    if c == 'churn':\n        continue\n    r, p = pointbiserialr(df['churn'], df[c])\n    print(f'{c:24s} r={r:+.3f} p={p:.4f}')\n`,
  )
  await writeFile(
    root,
    'artifacts/corr_matrix.csv',
    'feature,r,p\ncomplaint_count,0.421,0.0001\nservice_q,-0.387,0.0002\ntenure,-0.342,0.0003\n',
  )
  await writeFile(
    root,
    'reports/main.md',
    `# 用户流失因子探索分析

> 数据来源：画布节点「数据清洗-2025Q2」
> 行列：12,488 × 24

## 1. 数据概览

目标变量 \`churn\` 为二分类，0/1 分布约 **95.2 : 4.8**，存在显著不平衡。

\`\`\`
userId       object
age           int64
region       object
tenure        int64
monthly_fee float64
service_q   float64
\`\`\`

## 2. Top 因子

按 point-biserial r 排序，**前 5 个相关因子**：

| 因子 | r | 说明 |
|------|------|------|
| complaint_count | +0.421 | 投诉次数越多，流失概率越高 |
| service_q       | -0.387 | 服务质量越低越流失 |
| tenure          | -0.342 | 在网越久越稳定 |
| monthly_fee     | +0.298 | 月费越高轻度负相关 |
| late_payment    | +0.276 | 逾期次数推高流失 |

## 3. 单调性

下一步检验单调性，确认方向稳定。
`,
  )
  opfsRoot.value = root

  if (mode === 'loading') session.value = demoLoading
  else if (mode === 'failed') session.value = demoLoadFailed
  else session.value = demoSession
})

const handleSend = (text: string) => {
  // 演示态：把消息追加到 session
  const next: NotebookSessionVm = {
    ...session.value,
    messages: [
      ...session.value.messages,
      { id: 'u-' + Date.now(), role: 'user', text, at: Date.now() },
    ],
  }
  session.value = next
}

const handleAskUserSubmit = (payload: { askId: string; optionId: string; text?: string }) => {
  const next: NotebookSessionVm = {
    ...session.value,
    agent: 'running',
    messages: session.value.messages.map((m) => {
      if (m.role !== 'assistant') return m
      return {
        ...m,
        blocks: m.blocks.map((b) =>
          b.kind === 'ask_user' && b.data.id === payload.askId
            ? {
                kind: 'ask_user' as const,
                data: {
                  ...b.data,
                  status: 'answered' as const,
                  answeredOptionId: payload.optionId,
                  answeredText: payload.text,
                },
              }
            : b,
        ),
      }
    }),
  }
  session.value = next
}

const isPoc = computed(() => mode === 'poc')
</script>

<template>
  <PocApp v-if="isPoc" />
  <NotebookView
    v-else-if="opfsRoot"
    :opfs-root="opfsRoot"
    :session="session"
    :conversations="conversations"
    :active-conversation-id="activeConversationId"
    workspace-label="相关性分析"
    @close="() => undefined"
    @restart="() => session = { ...session, runtime: { ...session.runtime, recentlyRestarted: true, cellCount: 0, memoryMb: 0 } }"
    @download="() => undefined"
    @send="handleSend"
    @ask-user-submit="handleAskUserSubmit"
    @ask-user-cancel="() => undefined"
    @stop-exec="() => undefined"
    @rename="(v) => session = { ...session, title: v }"
    @new-conversation="() => undefined"
    @select-conversation="(id) => (activeConversationId = id)"
    @customize="() => undefined"
    @open-workspace-menu="() => undefined"
  />
</template>
