<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import NotebookView from './components/NotebookView.vue'
import { createMemOpfsRoot } from './shared/__tests__/memOpfs'
import { ensureWorkspaceTree, writeFile, type OpfsDirectoryHandle } from './shared/opfsAccess'
import { demoSession, demoLoading, demoLoadFailed } from './fixtures/demoSession'
import type { NotebookConversation, NotebookSessionVm, UserAttachment } from './types/messageStream'
import PocApp from './PocApp.vue'
import { createNotebookSessionRuntime, type NotebookSessionRuntime } from './runtime/notebookSessionRuntime'
import { exportWorkspaceZip } from './runtime/workspaceExporter'
import {
  createNotebookSessionEntry,
  deleteNotebookSession,
  listNotebookSessions,
  type NotebookSessionListItem,
} from './runtime/notebookAgentClient'

const params = new URLSearchParams(window.location.search)
const sessionId = params.get('session')
const mode = params.get('demo') ?? (sessionId ? 'session' : 'ux')

// demo 模式独立的 OPFS 根；session 模式直接复用 runtime.opfsRoot（响应式跟随 switchSession）
const demoOpfsRoot = ref<OpfsDirectoryHandle | null>(null)
// session 模式：runtime.opfsRoot 是 shallowRef，切换会话后自动更新 → 文件树/预览响应式跟随
const opfsRoot = computed<OpfsDirectoryHandle | null>(
  () => runtime.value?.opfsRoot.value ?? demoOpfsRoot.value,
)
const session = ref<NotebookSessionVm>(demoSession)
const conversations = ref<NotebookConversation[]>([])
const activeConversationId = ref<string>('')
const workspaceLabel = ref('相关性分析')
const runtime = shallowRef<NotebookSessionRuntime | null>(null)

const toConversation = (item: NotebookSessionListItem): NotebookConversation => ({
  id: item.sessionId,
  title: item.title,
  updatedAt: item.updatedAt,
  preview: item.lastUserMessagePreview,
  status: item.status,
  archived: Boolean(item.archivedAt),
})

const loadConversationList = async () => {
  if (mode !== 'session') return
  const response = await listNotebookSessions()
  conversations.value = response.sessions.map(toConversation)
}

const syncActiveConversation = () => {
  if (!runtime.value) return
  const currentSession = runtime.value.state.session
  const activeId = currentSession.sessionId
  activeConversationId.value = activeId
  const existing = conversations.value.find((item) => item.id === activeId)
  if (existing) {
    // 仅同步标题，不更新 updatedAt —— 切换/加载历史本身不构成「活动」，
    // 不应把该会话顶到列表最前。updatedAt 由真实发消息/重命名推进。
    existing.title = currentSession.title
    return
  }
  conversations.value.unshift({
    id: activeId,
    title: currentSession.title,
    updatedAt: Date.now(),
  })
}

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
  // 图片预览 mock：complaint_count → churn 概率散点图（与报告主题呼应，验证 image viewer 链路）
  await writeFile(
    root,
    'artifacts/churn_scatter.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" font-family="ui-sans-serif,system-ui,sans-serif">
  <rect width="360" height="240" fill="#fbfaf6"/>
  <text x="180" y="26" text-anchor="middle" font-size="13" font-weight="600" fill="#3b3530">complaint_count → churn 概率（正相关）</text>
  <line x1="60" y1="200" x2="330" y2="200" stroke="#8a8378" stroke-width="1"/>
  <line x1="60" y1="40" x2="60" y2="200" stroke="#8a8378" stroke-width="1"/>
  <line x1="60" y1="190" x2="330" y2="80" stroke="#c76b4a" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.7"/>
  <g fill="#c76b4a" fill-opacity="0.55">
    <circle cx="60" cy="196.8" r="3.4"/><circle cx="87" cy="193.6" r="3.4"/><circle cx="114" cy="188.8" r="3.4"/>
    <circle cx="114" cy="192" r="3.4"/><circle cx="141" cy="179.2" r="3.4"/><circle cx="168" cy="168" r="3.4"/>
    <circle cx="195" cy="158.4" r="3.4"/><circle cx="222" cy="140.8" r="3.4"/><circle cx="249" cy="120" r="3.4"/>
    <circle cx="276" cy="105.6" r="3.4"/><circle cx="303" cy="88" r="3.4"/><circle cx="330" cy="75.2" r="3.4"/>
  </g>
  <g font-size="9" fill="#6b645c" text-anchor="middle">
    <text x="60" y="214">0</text><text x="114" y="214">2</text><text x="168" y="214">4</text>
    <text x="222" y="214">6</text><text x="276" y="214">8</text><text x="330" y="214">10</text>
  </g>
  <g font-size="9" fill="#6b645c" text-anchor="end">
    <text x="54" y="203">0</text><text x="54" y="163">0.25</text><text x="54" y="123">0.5</text>
    <text x="54" y="83">0.75</text><text x="54" y="44">1.0</text>
  </g>
  <text x="195" y="232" text-anchor="middle" font-size="10" fill="#6b645c">complaint_count</text>
</svg>\n`,
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
  demoOpfsRoot.value = root
  if (mode === 'loading') session.value = demoLoading
  else if (mode === 'failed') session.value = demoLoadFailed
  else session.value = demoSession

  // 左侧对话栏 mock：第一条为当前 demo 会话（激活态），其余为历史对话
  const now = Date.now()
  const min = 60_000
  activeConversationId.value = demoSession.sessionId
  conversations.value = [
    {
      id: demoSession.sessionId,
      title: demoSession.title,
      updatedAt: now - 5 * min,
      preview: '帮我看看这份用户流失数据，找几个最相关的因子',
    },
    {
      id: 'demo-hist-2',
      title: '营销活动 ROI 归因',
      updatedAt: now - 3 * 60 * min,
      preview: '对比三个渠道的转化漏斗，找出边际收益最高的',
    },
    {
      id: 'demo-hist-3',
      title: '风控特征筛选',
      updatedAt: now - 26 * 60 * min,
      preview: '从 120 个变量里筛出对欺诈识别最稳的子集',
    },
    {
      id: 'demo-hist-4',
      title: 'Q1 看板波动解释',
      updatedAt: now - 3 * 24 * 60 * min,
      preview: 'DAU 为什么在三月初突然下跌',
    },
  ]
}

const initSessionMode = async (targetSessionId: string) => {
  const notebookRuntime = await createNotebookSessionRuntime(targetSessionId)
  runtime.value = notebookRuntime
  session.value = notebookRuntime.state.session
  activeConversationId.value = targetSessionId
  workspaceLabel.value = '画布分析'

  try {
    await loadConversationList()
    await notebookRuntime.connect()
    syncActiveConversation()
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

const handleSend = async (text: string, attachments: UserAttachment[] = []) => {
  if (runtime.value) {
    await runtime.value.sendUserMessage(text, attachments)
    await loadConversationList()
    syncActiveConversation()
    return
  }

  session.value = {
    ...session.value,
    messages: [
      ...session.value.messages,
      {
        id: 'u-' + Date.now(),
        role: 'user',
        text,
        at: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
      },
    ],
  }
}

/** MessageInput 通过此函数把文件写入 workspace inputs/，返回附件元数据 */
const handleAttach = async (files: File[]): Promise<UserAttachment[]> => {
  if (!runtime.value) return []
  return runtime.value.importAttachments(files)
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
  if (runtime.value) {
    void runtime.value.renameSession(nextTitle).then(async () => {
      session.value = runtime.value!.state.session
      await loadConversationList()
      syncActiveConversation()
    })
    return
  }

  session.value = {
    ...session.value,
    title: nextTitle,
  }
}

const handleRenameConversation = async (conversationId: string, nextTitle: string) => {
  if (!runtime.value) return
  await runtime.value.renameConversationById(conversationId, nextTitle)
  // 改的是当前激活会话时，同步顶部 session 视图
  if (conversationId === activeConversationId.value) {
    session.value = runtime.value.state.session
  }
  await loadConversationList()
  syncActiveConversation()
}

const handleSelectConversation = async (conversationId: string) => {
  if (!runtime.value || conversationId === activeConversationId.value) {
    activeConversationId.value = conversationId
    return
  }
  await runtime.value.switchSession(conversationId)
  session.value = runtime.value.state.session
  await loadConversationList()
  syncActiveConversation()
}

const handleNewConversation = async () => {
  if (!runtime.value) return
  const payload = await createNotebookSessionEntry({ origin: window.location.origin })
  await runtime.value.switchSession(payload.sessionId)
  session.value = runtime.value.state.session
  await loadConversationList()
  syncActiveConversation()
}

const handleDeleteConversation = async (conversationId: string) => {
  try {
    await deleteNotebookSession(conversationId)
  } catch (error) {
    console.error('[notebook] 删除会话失败', error)
    return
  }
  const wasActive = conversationId === activeConversationId.value
  await loadConversationList()
  if (!wasActive) return
  // 删除的是当前会话：落到列表里最近的会话，或新建一个空白会话
  const next = conversations.value[0]
  if (next) {
    await handleSelectConversation(next.id)
  } else {
    await handleNewConversation()
  }
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
    :can-attach="true"
    :on-attach="runtime ? handleAttach : undefined"
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
    @new-conversation="handleNewConversation"
    @select-conversation="handleSelectConversation"
    @rename-conversation="handleRenameConversation"
    @delete-conversation="handleDeleteConversation"
    @customize="() => undefined"
    @open-workspace-menu="() => undefined"
  />
</template>
