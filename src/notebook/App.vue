<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NotebookView from './components/NotebookView.vue'
import { createMemOpfsRoot } from './shared/__tests__/memOpfs'
import { ensureWorkspaceTree, writeFile, type OpfsDirectoryHandle } from './shared/opfsAccess'
import { demoSession, demoLoading, demoLoadFailed } from './fixtures/demoSession'
import type { NotebookConversation, NotebookSessionVm } from './types/messageStream'
import PocApp from './PocApp.vue'
import { createNotebookSessionRuntime, type NotebookSessionRuntime } from './runtime/notebookSessionRuntime'
import { exportWorkspaceZip } from './runtime/workspaceExporter'

const params = new URLSearchParams(window.location.search)
const sessionId = params.get('session')
const mode = params.get('demo') ?? (sessionId ? 'session' : 'ux')

const opfsRoot = ref<OpfsDirectoryHandle | null>(null)
const session = ref<NotebookSessionVm>(demoSession)
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
const workspaceLabel = ref('相关性分析')
const runtime = ref<NotebookSessionRuntime | null>(null)

const seedDemoWorkspace = async () => {
  const root = createMemOpfsRoot()
  await ensureWorkspaceTree(root)
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
  return root
}

const initDemoMode = async () => {
  const root = await seedDemoWorkspace()
  opfsRoot.value = root
  if (mode === 'loading') session.value = demoLoading
  else if (mode === 'failed') session.value = demoLoadFailed
  else session.value = demoSession
}

const initSessionMode = async (targetSessionId: string) => {
  const notebookRuntime = await createNotebookSessionRuntime(targetSessionId)
  runtime.value = notebookRuntime
  opfsRoot.value = notebookRuntime.opfsRoot
  session.value = notebookRuntime.state.session
  conversations.value = notebookRuntime.state.conversations
  activeConversationId.value = notebookRuntime.state.activeConversationId ?? targetSessionId
  workspaceLabel.value = '画布分析'

  try {
    await notebookRuntime.connect()
  } catch (error) {
    session.value.phase = {
      kind: 'failed',
      failure: {
        reason: 'Notebook 初始化失败',
        detail: error instanceof Error ? error.message : String(error),
      },
    }
    session.value.connection = 'offline'
    session.value.agent = 'failed'
  }
}

onMounted(async () => {
  if (mode === 'poc') return
  if (mode === 'session' && sessionId) {
    await initSessionMode(sessionId)
    return
  }
  await initDemoMode()
})

onBeforeUnmount(() => {
  runtime.value?.dispose()
})

const handleSend = async (text: string) => {
  if (runtime.value) {
    await runtime.value.sendUserMessage(text)
    return
  }

  session.value = {
    ...session.value,
    messages: [
      ...session.value.messages,
      { id: 'u-' + Date.now(), role: 'user', text, at: Date.now() },
    ],
  }
}

const handleAskUserSubmit = async (payload: { askId: string; optionId: string; text?: string }) => {
  if (runtime.value) {
    await runtime.value.answerAskUser(payload)
    return
  }

  session.value = {
    ...session.value,
    agent: 'running',
    messages: session.value.messages.map((message) => {
      if (message.role !== 'assistant') return message
      return {
        ...message,
        blocks: message.blocks.map((block) =>
          block.kind === 'ask_user' && block.data.id === payload.askId
            ? {
                kind: 'ask_user' as const,
                data: {
                  ...block.data,
                  status: 'answered' as const,
                  answeredOptionId: payload.optionId,
                  answeredText: payload.text,
                },
              }
            : block,
        ),
      }
    }),
  }
}

const handleAskUserCancel = async (askId: string) => {
  if (runtime.value) {
    await runtime.value.cancelAskUser(askId)
    return
  }

  // demo 模式：本地置为 cancelled
  session.value = {
    ...session.value,
    messages: session.value.messages.map((message) => {
      if (message.role !== 'assistant') return message
      return {
        ...message,
        blocks: message.blocks.map((block) =>
          block.kind === 'ask_user' && block.data.id === askId
            ? {
                kind: 'ask_user' as const,
                data: { ...block.data, status: 'cancelled' as const },
              }
            : block,
        ),
      }
    }),
  }
}

const handleRestart = async () => {
  if (runtime.value) {
    await runtime.value.restart()
    return
  }
  session.value = {
    ...session.value,
    runtime: {
      ...session.value.runtime,
      recentlyRestarted: true,
      cellCount: 0,
      memoryMb: 0,
    },
  }
}

const handleDownload = async () => {
  if (!opfsRoot.value) return
  const currentSessionId = runtime.value?.state.session.sessionId ?? 'demo'
  const out = await exportWorkspaceZip(opfsRoot.value, currentSessionId)
  const url = URL.createObjectURL(out.toBlob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = out.fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const handleRename = (nextTitle: string) => {
  session.value = {
    ...session.value,
    title: nextTitle,
  }
}

const handleSelectConversation = (conversationId: string) => {
  activeConversationId.value = conversationId
}

const handleStopExec = () => {
  runtime.value?.stop()
}

const handleAbort = async () => {
  await runtime.value?.abort()
}

const handleCompact = async () => {
  await runtime.value?.compact()
}

const handleClose = () => {
  if (runtime.value) {
    runtime.value.requestParentClose()
  }
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
    :workspace-label="workspaceLabel"
    @close="handleClose"
    @restart="handleRestart"
    @download="handleDownload"
    @send="handleSend"
    @ask-user-submit="handleAskUserSubmit"
    @ask-user-cancel="handleAskUserCancel"
    @abort="handleAbort"
    @compact="handleCompact"
    @stop-exec="handleStopExec"
    @rename="handleRename"
    @new-conversation="() => undefined"
    @select-conversation="handleSelectConversation"
    @customize="() => undefined"
    @open-workspace-menu="() => undefined"
  />
</template>
