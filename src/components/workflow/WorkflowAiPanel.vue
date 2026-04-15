<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Sparkles,
  Wrench,
  X,
} from 'lucide-vue-next'
import Button from 'primevue/button'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import type { AgentSessionEvent, WorkflowAiModelProfile } from '@/ai/types'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const workflowStore = useWorkflowStore()
const aiStore = useWorkflowAiStore()

const draftProfile = reactive<WorkflowAiModelProfile>({
  id: `custom_${Date.now()}`,
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  enabled: true,
  source: 'custom',
})

const canGenerate = computed(() => aiStore.prompt.trim().length > 0 && !!aiStore.selectedProfileId)
const analysisAgentSession = computed(() => aiStore.analysisAgentSession)
const systemProfiles = computed(() => aiStore.systemProfiles)
const customProfiles = computed(() => aiStore.customProfiles)
const hasRepairAttempt = computed(() =>
  aiStore.generationDiagnostics?.attempts.some((attempt: { trigger: string }) => attempt.trigger === 'repair'),
)
const sessionState = computed(() => aiStore.sessionState)
const sessionStatusLabel = computed(() => {
  if (sessionState.value?.status === 'running') return '编排中'
  if (sessionState.value?.status === 'waiting_user') return '待补充信息'
  if (sessionState.value?.status === 'completed') return '已完成'
  if (sessionState.value?.status === 'failed') return '失败'
  return '未开始'
})
const localRecipes = computed(() => aiStore.contextHints?.recipes ?? [])
const localSchemaSummaries = computed(() => aiStore.contextHints?.schemaSummaries ?? [])
const hasLocalContext = computed(
  () => aiStore.toolTrace.length > 0 || localRecipes.value.length > 0 || localSchemaSummaries.value.length > 0,
)
const timelineEvents = computed(() => aiStore.streamEvents.filter((event) => event.type !== 'message.delta'))
const latestAssistantOutput = computed(() => {
  if (aiStore.streamingMessage) {
    return aiStore.streamingMessage
  }

  return [...aiStore.agentMessages]
    .reverse()
    .find((item) => item.kind === 'assistant')?.content ?? ''
})
const missingInfoAnswers = reactive<Record<string, string>>({})
const streamStatusLabel = computed(() => {
  if (aiStore.streamStatus === 'streaming') return '生成中'
  if (aiStore.streamStatus === 'completed') return '已完成'
  if (aiStore.streamStatus === 'failed') return '失败'
  return '空闲'
})
const canContinueSession = computed(() => {
  if (aiStore.isGenerating || sessionState.value?.status !== 'waiting_user') return false
  return sessionState.value.missingInfo.every((item) => !item.blocking || !!missingInfoAnswers[item.key]?.trim())
})

const formatFieldList = (fields: string[] | undefined) =>
  fields && fields.length ? fields.join('、') : '无'

const describeResultKind = (resultKind: string) => {
  if (resultKind === 'table') return '单表'
  if (resultKind === 'tableCollection') return '表集合'
  if (resultKind === 'json') return 'JSON'
  return '未知'
}

const describeDraftNodeStatus = (status: string) => {
  if (status === 'added') return '新增'
  if (status === 'updated') return '已修改'
  if (status === 'removed') return '待删除'
  return '保留'
}

const describeTimelineEvent = (event: AgentSessionEvent) => {
  if (event.type === 'session.status.updated') {
    if (event.session.status === 'running') return '分析会话正在执行'
    if (event.session.status === 'completed') return '分析会话已完成'
    if (event.session.status === 'failed') return '分析会话执行失败'
    return '分析会话已创建'
  }
  if (event.type === 'projection.workflow.updated') return event.projection.draftSummary || '工作流草案已更新'
  if (event.type === 'projection.analysis.updated') return event.projection.summary || '分析状态已更新'
  if (event.type === 'projection.execution.updated') return event.projection.latestAction || '执行状态已更新'
  if (event.type === 'projection.canvas_sync.updated') return event.projection.message || '画布同步状态已更新'
  if (event.type === 'projection.error.updated') return event.projection.message
  if (event.type === 'message.completed') return event.message.content || '代理已返回新消息'
  if (event.type === 'failed') return event.message
  return ''
}

const resetDraftProfile = () => {
  draftProfile.id = `custom_${Date.now()}`
  draftProfile.name = ''
  draftProfile.baseUrl = ''
  draftProfile.model = ''
  draftProfile.apiKey = ''
  draftProfile.enabled = true
  draftProfile.source = 'custom'
}

const handleGenerate = async () => {
  await aiStore.generatePlan(workflowStore as any)
}

const handleSyncCanvas = () => {
  aiStore.syncAnalysisCanvas(workflowStore as any)
}

const syncMissingInfoAnswers = () => {
  const items = sessionState.value?.missingInfo ?? []
  const userAnswerMap = new Map((sessionState.value?.contextHints?.userAnswers ?? []).map((item) => [item.key, item.value]))
  const activeKeys = new Set(items.map((item) => item.key))

  Object.keys(missingInfoAnswers).forEach((key) => {
    if (!activeKeys.has(key)) {
      delete missingInfoAnswers[key]
    }
  })

  items.forEach((item) => {
    if (!missingInfoAnswers[item.key]) {
      missingInfoAnswers[item.key] = userAnswerMap.get(item.key) ?? ''
    }
  })
}

const handleApply = async () => {
  try {
    aiStore.errorMessage = ''
    aiStore.applyCurrentPlan(workflowStore as any)
    workflowStore.addLog('AI编排计划应用成功', 'info')
  } catch (error: any) {
    const message = error.message ?? '应用 AI 计划失败'
    aiStore.setApplyError(message)
    workflowStore.addLog(`AI编排计划应用失败: ${message}`, 'error')
  }
}

const handleRestore = () => {
  aiStore.restoreLastApplied(workflowStore as any)
}

const handleContinueSession = async () => {
  const answers = Object.fromEntries(
    (sessionState.value?.missingInfo ?? []).map((item) => [item.key, missingInfoAnswers[item.key] ?? '']),
  )
  await aiStore.continueSession(workflowStore as any, answers)
}

const handleSaveCustomProfile = () => {
  aiStore.upsertCustomProfile({
    id: draftProfile.id,
    name: draftProfile.name.trim(),
    baseUrl: draftProfile.baseUrl.trim(),
    model: draftProfile.model.trim(),
    apiKey: draftProfile.apiKey?.trim(),
    enabled: true,
  })
  resetDraftProfile()
}

const handleTestDraftProfile = async () => {
  await aiStore.testProfile({
    ...draftProfile,
    name: draftProfile.name.trim(),
    baseUrl: draftProfile.baseUrl.trim(),
    model: draftProfile.model.trim(),
    apiKey: draftProfile.apiKey?.trim(),
    enabled: true,
    source: 'custom',
  })
}

onMounted(async () => {
  if (!aiStore.profiles.length) {
    await aiStore.loadProfiles()
  }
})

watch(
  () => sessionState.value?.missingInfo,
  () => {
    syncMissingInfoAnswers()
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <div class="workflow-ai-panel" :data-visible="visible">
    <div class="workflow-ai-panel__header">
      <div class="workflow-ai-panel__title">
        <div class="workflow-ai-panel__badge">
          <Bot :size="16" />
        </div>
        <div>
          <strong>分析代理</strong>
          <p>聊天提问，直接得到分析结论与可追溯流程</p>
        </div>
      </div>
      <button class="workflow-ai-panel__close" @click="emit('close')">
        <X :size="16" />
      </button>
    </div>

    <div class="workflow-ai-panel__body">
      <section class="workflow-ai-panel__section">
        <div class="workflow-ai-panel__section-title">
          <Sparkles :size="14" />
          <span>分析请求</span>
        </div>
        <div class="workflow-ai-panel__field">
          <label>编排模式</label>
          <div class="workflow-ai-panel__segmented">
            <button
              type="button"
              :class="['workflow-ai-panel__segmented-btn', { 'is-active': aiStore.mode === 'create' }]"
              @click="aiStore.mode = 'create'"
            >
              创建工作流
            </button>
            <button
              type="button"
              :class="['workflow-ai-panel__segmented-btn', { 'is-active': aiStore.mode === 'edit' }]"
              @click="aiStore.mode = 'edit'"
            >
              修改现有流程
            </button>
          </div>
        </div>
        <div class="workflow-ai-panel__field">
          <label>模型配置</label>
          <select v-model="aiStore.selectedProfileId" class="workflow-ai-panel__control">
            <option value="">请选择模型配置</option>
            <option v-for="profile in aiStore.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }} · {{ profile.model }}
            </option>
          </select>
        </div>
        <div class="workflow-ai-panel__field">
          <label>需求描述</label>
          <textarea
            v-model="aiStore.prompt"
            class="workflow-ai-panel__textarea"
            placeholder="例如：导入一份 JSON 表格，先做数据清洗，再做 Pearson 相关分析，最后导出结果。"
          />
        </div>
        <div class="workflow-ai-panel__actions">
          <Button :disabled="!canGenerate || aiStore.isGenerating" class="workflow-ai-panel__primary" @click="handleGenerate">
            <Sparkles :size="14" />
            <span>{{ aiStore.isGenerating ? '正在编排...' : '生成计划' }}</span>
          </Button>
          <Button severity="secondary" class="workflow-ai-panel__secondary" @click="aiStore.settingsVisible = !aiStore.settingsVisible">
            <Wrench :size="14" />
            <span>模型设置</span>
            <component :is="aiStore.settingsVisible ? ChevronUp : ChevronDown" :size="14" />
          </Button>
        </div>
        <p v-if="aiStore.errorMessage" class="workflow-ai-panel__error">{{ aiStore.errorMessage }}</p>
      </section>

      <section
        v-if="analysisAgentSession"
        data-testid="analysis-agent-chat"
        class="workflow-ai-panel__section workflow-ai-panel__diagnostics"
      >
        <div class="workflow-ai-panel__section-title">
          <Bot :size="14" />
          <span>对话分析</span>
        </div>
        <div class="workflow-ai-panel__diag-meta">
          <div><strong>当前阶段</strong><span>{{ analysisAgentSession.phase }}</span></div>
          <div><strong>分析目标</strong><span>{{ analysisAgentSession.userGoal }}</span></div>
        </div>
        <div class="workflow-ai-panel__list-block">
          <strong>会话消息</strong>
          <ul>
            <li v-for="message in analysisAgentSession.conversation" :key="message.id">
              {{ message.role === 'user' ? '用户' : '代理' }}：{{ message.content }}
            </li>
          </ul>
        </div>
      </section>

      <section
        v-if="analysisAgentSession?.artifacts.length"
        data-testid="analysis-agent-artifacts"
        class="workflow-ai-panel__section"
      >
        <div class="workflow-ai-panel__section-title">
          <Sparkles :size="14" />
          <span>结论与报告</span>
        </div>
        <div
          v-for="artifact in analysisAgentSession.artifacts"
          :key="artifact.id"
          class="workflow-ai-panel__list-block"
        >
          <strong>{{ artifact.title }}</strong>
          <p class="workflow-ai-panel__summary">{{ artifact.summary }}</p>
          <ul v-if="artifact.bullets?.length">
            <li v-for="bullet in artifact.bullets" :key="bullet">{{ bullet }}</li>
          </ul>
        </div>
      </section>

      <section
        v-if="analysisAgentSession"
        class="workflow-ai-panel__section workflow-ai-panel__diagnostics"
      >
        <div class="workflow-ai-panel__section-title">
          <RefreshCcw :size="14" />
          <span>画布协同</span>
        </div>
        <p class="workflow-ai-panel__summary">
          {{ analysisAgentSession.workflowSummary || '当前还没有同步右侧工作流，可在修改画布后手动同步。' }}
        </p>
        <div class="workflow-ai-panel__actions">
          <Button
            data-testid="analysis-agent-sync-canvas"
            severity="secondary"
            class="workflow-ai-panel__secondary"
            @click="handleSyncCanvas"
          >
            <RefreshCcw :size="14" />
            <span>同步当前画布</span>
          </Button>
        </div>
      </section>

      <section
        v-if="aiStore.isGenerating || aiStore.streamEvents.length"
        data-testid="workflow-ai-stream-progress"
        class="workflow-ai-panel__section workflow-ai-panel__diagnostics"
      >
        <div class="workflow-ai-panel__section-title">
          <RefreshCcw :size="14" />
          <span>实时进度</span>
        </div>
        <div class="workflow-ai-panel__diag-meta">
          <div><strong>当前状态</strong><span>{{ streamStatusLabel }}</span></div>
          <div><strong>进度说明</strong><span>{{ aiStore.streamHeadline || '等待开始' }}</span></div>
        </div>
        <div v-if="timelineEvents.length" class="workflow-ai-panel__list-block">
          <strong>进度时间线</strong>
          <ul>
            <li v-for="(event, index) in timelineEvents" :key="`${event.type}-${index}`">
              {{ describeTimelineEvent(event) }}
            </li>
          </ul>
        </div>
      </section>

      <section
        v-if="sessionState"
        data-testid="workflow-ai-session-strategy"
        class="workflow-ai-panel__section workflow-ai-panel__diagnostics"
      >
        <div class="workflow-ai-panel__section-title">
          <Sparkles :size="14" />
          <span>当前策略</span>
        </div>
        <div class="workflow-ai-panel__diag-meta">
          <div><strong>会话状态</strong><span>{{ sessionStatusLabel }}</span></div>
          <div v-if="sessionState.selectedRecipe"><strong>当前模板</strong><span>{{ sessionState.selectedRecipe.name }}</span></div>
          <div v-if="sessionState.selectedRecipe"><strong>命中原因</strong><span>{{ sessionState.selectedRecipe.reason }}</span></div>
        </div>
      </section>

      <section
        v-if="sessionState"
        data-testid="workflow-ai-session-draft"
        class="workflow-ai-panel__section"
      >
        <div class="workflow-ai-panel__section-title">
          <RefreshCcw :size="14" />
          <span>草稿结构</span>
        </div>
        <p class="workflow-ai-panel__summary">
          {{ sessionState.draft.summary || '当前草稿尚未形成明确摘要。' }}
        </p>
        <div class="workflow-ai-panel__ops-count">
          当前草稿共 {{ sessionState.draft.nodes.length }} 个节点、{{ sessionState.draft.edges.length }} 条连线
        </div>
        <div v-if="sessionState.draft.nodes.length" class="workflow-ai-panel__list-block">
          <strong>草稿节点</strong>
          <ul>
            <li v-for="node in sessionState.draft.nodes" :key="node.ref">
              {{ node.label }} · {{ describeDraftNodeStatus(node.status) }}
            </li>
          </ul>
        </div>
      </section>

      <section
        v-if="sessionState?.missingInfo.length"
        data-testid="workflow-ai-missing-info"
        class="workflow-ai-panel__section workflow-ai-panel__diagnostics"
      >
        <div class="workflow-ai-panel__section-title">
          <AlertTriangle :size="14" />
          <span>缺失信息</span>
        </div>
        <div class="workflow-ai-panel__list-block is-warning">
          <strong>待补充项</strong>
          <ul>
            <li v-for="item in sessionState.missingInfo" :key="item.key">
              {{ item.label }}：{{ item.reason }}
            </li>
          </ul>
        </div>
        <div class="workflow-ai-panel__form-grid">
          <div v-for="item in sessionState.missingInfo" :key="`input-${item.key}`" class="workflow-ai-panel__field">
            <label :for="`workflow-ai-missing-${item.key}`">{{ item.label }}</label>
            <textarea
              :id="`workflow-ai-missing-${item.key}`"
              :data-testid="`workflow-ai-missing-info-input-${item.key}`"
              v-model="missingInfoAnswers[item.key]"
              class="workflow-ai-panel__textarea workflow-ai-panel__textarea--compact"
              :placeholder="`请补充：${item.reason}`"
            />
          </div>
        </div>
        <div class="workflow-ai-panel__actions">
          <Button
            data-testid="workflow-ai-continue-session"
            :disabled="!canContinueSession"
            class="workflow-ai-panel__primary"
            @click="handleContinueSession"
          >
            <RefreshCcw :size="14" />
            <span>{{ aiStore.isGenerating ? '继续编排中...' : '继续编排' }}</span>
          </Button>
        </div>
      </section>

      <section
        v-if="hasLocalContext"
        data-testid="workflow-ai-context"
        class="workflow-ai-panel__section workflow-ai-panel__diagnostics"
      >
        <div class="workflow-ai-panel__section-title">
          <Wrench :size="14" />
          <span>应用内上下文</span>
        </div>

        <div v-if="aiStore.toolTrace.length" class="workflow-ai-panel__list-block">
          <strong>本地工具轨迹</strong>
          <ul>
            <li v-for="item in aiStore.toolTrace" :key="`${item.toolName}-${item.summary}`">
              {{ item.toolName }} · {{ item.status === 'success' ? '成功' : '失败' }} · {{ item.summary }}
            </li>
          </ul>
        </div>

        <div v-if="localRecipes.length" class="workflow-ai-panel__list-block">
          <strong>候选模板</strong>
          <ul>
            <li v-for="recipe in localRecipes" :key="recipe.id">
              <span class="workflow-ai-panel__context-name">{{ recipe.name }}</span>
              <span>（{{ recipe.id }}）</span>
              <span> · {{ recipe.reason }}</span>
              <span> · 最小骨架：{{ recipe.minimalPattern.join(' -> ') }}</span>
            </li>
          </ul>
        </div>

        <div v-if="localSchemaSummaries.length" class="workflow-ai-panel__list-block">
          <strong>字段摘要</strong>
          <div
            v-for="summary in localSchemaSummaries"
            :key="summary.nodeId"
            class="workflow-ai-panel__schema-card"
          >
            <div class="workflow-ai-panel__schema-header">
              <span class="workflow-ai-panel__context-name">{{ summary.nodeLabel }}</span>
              <span>{{ describeResultKind(summary.resultKind) }}</span>
              <span v-if="typeof summary.rowCount === 'number'">约 {{ summary.rowCount }} 行</span>
            </div>
            <div class="workflow-ai-panel__schema-grid">
              <div><strong>数值字段</strong><span>{{ formatFieldList(summary.numericColumns) }}</span></div>
              <div><strong>分类字段</strong><span>{{ formatFieldList(summary.categoricalColumns) }}</span></div>
              <div><strong>时间字段</strong><span>{{ formatFieldList(summary.datetimeColumns) }}</span></div>
              <div><strong>候选特征字段</strong><span>{{ formatFieldList(summary.candidateFeatureColumns) }}</span></div>
              <div><strong>候选目标字段</strong><span>{{ formatFieldList(summary.candidateTargetColumns) }}</span></div>
              <div><strong>阻塞原因</strong><span>{{ formatFieldList(summary.blockedReasons) }}</span></div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="latestAssistantOutput"
        data-testid="workflow-ai-stream-output"
        class="workflow-ai-panel__section"
      >
        <div class="workflow-ai-panel__section-title">
          <Bot :size="14" />
          <span>代理实时输出</span>
        </div>
        <div class="workflow-ai-panel__list-block">
          <strong>{{ aiStore.streamingMessage ? '正在生成中' : '最新代理消息' }}</strong>
          <pre class="workflow-ai-panel__raw-output">{{ latestAssistantOutput }}</pre>
        </div>
      </section>

      <section
        v-if="aiStore.generationDiagnostics"
        data-testid="workflow-ai-diagnostics"
        class="workflow-ai-panel__section workflow-ai-panel__diagnostics"
      >
        <div class="workflow-ai-panel__section-title">
          <AlertTriangle :size="14" />
          <span>诊断信息</span>
        </div>
        <div class="workflow-ai-panel__diag-meta">
          <div><strong>失败阶段</strong><span>{{ aiStore.generationDiagnostics.stage }}</span></div>
          <div><strong>当前状态</strong><span>{{ aiStore.generationDiagnostics.status }}</span></div>
          <div v-if="hasRepairAttempt"><strong>自动修复重试</strong><span>已执行</span></div>
        </div>

        <div v-if="aiStore.generationDiagnostics.attempts.length" class="workflow-ai-panel__list-block">
          <strong>尝试记录</strong>
          <ul>
            <li v-for="attempt in aiStore.generationDiagnostics.attempts" :key="`${attempt.attempt}-${attempt.trigger}`">
              第 {{ attempt.attempt }} 次 · {{ attempt.trigger === 'repair' ? '自动修复重试' : '首次生成' }} · {{ attempt.stage }} ·
              {{ attempt.status === 'success' ? '成功' : '失败' }}
              <span v-if="attempt.message"> · {{ attempt.message }}</span>
            </li>
          </ul>
        </div>

        <div v-if="aiStore.generationDiagnostics.issues.length" class="workflow-ai-panel__list-block is-warning">
          <strong>失败明细</strong>
          <ul>
            <li v-for="issue in aiStore.generationDiagnostics.issues" :key="`${issue.stage}-${issue.operationId}-${issue.message}`">
              {{ issue.stage }} / {{ issue.operationId }}：{{ issue.message }}
            </li>
          </ul>
        </div>

        <div
          v-if="aiStore.generationDiagnostics.rawOutputExcerpt"
          data-testid="workflow-ai-raw-output"
          class="workflow-ai-panel__list-block"
        >
          <strong>模型原始输出摘要</strong>
          <pre class="workflow-ai-panel__raw-output">{{ aiStore.generationDiagnostics.rawOutputExcerpt }}</pre>
        </div>
      </section>

      <section v-if="aiStore.plan" class="workflow-ai-panel__section workflow-ai-panel__plan">
        <div class="workflow-ai-panel__section-title">
          <RefreshCcw :size="14" />
          <span>计划预览</span>
        </div>
        <p class="workflow-ai-panel__summary">{{ aiStore.plan.summary }}</p>
        <div v-if="aiStore.plan.assumptions?.length" class="workflow-ai-panel__list-block">
          <strong>假设</strong>
          <ul>
            <li v-for="item in aiStore.plan.assumptions" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div v-if="aiStore.plan.warnings?.length" class="workflow-ai-panel__list-block is-warning">
          <strong>风险提示</strong>
          <ul>
            <li v-for="item in aiStore.plan.warnings" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div v-if="aiStore.plan.questions?.length" class="workflow-ai-panel__list-block">
          <strong>仍需确认</strong>
          <ul>
            <li v-for="item in aiStore.plan.questions" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div class="workflow-ai-panel__ops-count">本次计划共 {{ aiStore.plan.operations.length }} 个操作</div>
        <div class="workflow-ai-panel__actions">
          <Button class="workflow-ai-panel__primary" @click="handleApply">应用到画布</Button>
          <Button severity="secondary" class="workflow-ai-panel__secondary" @click="handleRestore">恢复到应用前</Button>
        </div>
      </section>

      <section v-if="aiStore.settingsVisible" class="workflow-ai-panel__section">
        <div class="workflow-ai-panel__section-title">
          <Wrench :size="14" />
          <span>模型设置</span>
        </div>
        <div class="workflow-ai-panel__profile-groups">
          <div>
            <strong class="workflow-ai-panel__subheading">系统默认模型</strong>
            <div v-if="!systemProfiles.length" class="workflow-ai-panel__empty">当前没有可用的系统默认模型</div>
            <div v-for="profile in systemProfiles" :key="profile.id" class="workflow-ai-panel__profile-card">
              <div>
                <div class="workflow-ai-panel__profile-name">{{ profile.name }}</div>
                <div class="workflow-ai-panel__profile-meta">{{ profile.baseUrl }} · {{ profile.model }}</div>
              </div>
              <button class="workflow-ai-panel__tiny-btn" @click="aiStore.testProfile(profile)">测试</button>
            </div>
          </div>
          <div>
            <strong class="workflow-ai-panel__subheading">自定义模型</strong>
            <div v-if="!customProfiles.length" class="workflow-ai-panel__empty">还没有自定义模型配置</div>
            <div v-for="profile in customProfiles" :key="profile.id" class="workflow-ai-panel__profile-card">
              <div>
                <div class="workflow-ai-panel__profile-name">{{ profile.name }}</div>
                <div class="workflow-ai-panel__profile-meta">{{ profile.baseUrl }} · {{ profile.model }}</div>
              </div>
              <div class="workflow-ai-panel__profile-actions">
                <button class="workflow-ai-panel__tiny-btn" @click="aiStore.testProfile(profile)">测试</button>
                <button class="workflow-ai-panel__tiny-btn is-danger" @click="aiStore.removeCustomProfile(profile.id)">删除</button>
              </div>
            </div>
          </div>
        </div>

        <div class="workflow-ai-panel__form-grid">
          <div class="workflow-ai-panel__field">
            <label>配置名称</label>
            <input v-model="draftProfile.name" class="workflow-ai-panel__control" placeholder="例如：本地 OpenAI 兼容模型" />
          </div>
          <div class="workflow-ai-panel__field">
            <label>Base URL</label>
            <input v-model="draftProfile.baseUrl" class="workflow-ai-panel__control" placeholder="例如：https://api.openai.com/v1" />
          </div>
          <div class="workflow-ai-panel__field">
            <label>模型名称</label>
            <input v-model="draftProfile.model" class="workflow-ai-panel__control" placeholder="例如：gpt-4o-mini" />
          </div>
          <div class="workflow-ai-panel__field">
            <label>API Key</label>
            <input v-model="draftProfile.apiKey" class="workflow-ai-panel__control" type="password" placeholder="请输入 API Key" />
          </div>
        </div>
        <div class="workflow-ai-panel__actions">
          <Button class="workflow-ai-panel__primary" @click="handleSaveCustomProfile">保存自定义模型</Button>
          <Button severity="secondary" class="workflow-ai-panel__secondary" @click="handleTestDraftProfile">测试当前配置</Button>
        </div>
        <p v-if="aiStore.lastTestResult" class="workflow-ai-panel__test-result" :class="{ 'is-success': aiStore.lastTestResult.success, 'is-error': !aiStore.lastTestResult.success }">
          {{ aiStore.lastTestResult.message }}
          <span v-if="aiStore.lastTestResult.latencyMs">（{{ aiStore.lastTestResult.latencyMs }}ms）</span>
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.workflow-ai-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(37, 99, 235, 0.08) 0%, rgba(248, 250, 252, 0) 42%),
    linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-left: 1px solid #dbe4ef;
}

.workflow-ai-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.workflow-ai-panel__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workflow-ai-panel__title strong {
  display: block;
  font-size: 14px;
  color: #0f172a;
}

.workflow-ai-panel__title p {
  margin: 3px 0 0;
  font-size: 11px;
  color: #64748b;
}

.workflow-ai-panel__badge,
.workflow-ai-panel__close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dbe4ef;
  background: #fff;
  color: #2563eb;
}

.workflow-ai-panel__close {
  color: #475569;
  cursor: pointer;
}

.workflow-ai-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.workflow-ai-panel__section {
  border: 1px solid #dbe4ef;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  padding: 14px;
  box-shadow: 0 14px 32px -28px rgba(15, 23, 42, 0.45);
}

.workflow-ai-panel__section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 800;
  color: #0f172a;
}

.workflow-ai-panel__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.workflow-ai-panel__field label,
.workflow-ai-panel__subheading {
  font-size: 11px;
  font-weight: 700;
  color: #334155;
}

.workflow-ai-panel__control,
.workflow-ai-panel__textarea {
  width: 100%;
  border: 1px solid #dbe4ef;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  padding: 10px 12px;
  outline: none;
}

.workflow-ai-panel__textarea {
  min-height: 110px;
  resize: vertical;
}

.workflow-ai-panel__textarea--compact {
  min-height: 84px;
}

.workflow-ai-panel__segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.workflow-ai-panel__segmented-btn {
  height: 36px;
  border-radius: 12px;
  border: 1px solid #dbe4ef;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.workflow-ai-panel__segmented-btn.is-active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.workflow-ai-panel__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.workflow-ai-panel__primary,
.workflow-ai-panel__secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.workflow-ai-panel__summary {
  margin: 0 0 10px;
  font-size: 13px;
  color: #0f172a;
  line-height: 1.5;
}

.workflow-ai-panel__list-block {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.workflow-ai-panel__list-block.is-warning {
  background: #fff7ed;
}

.workflow-ai-panel__list-block strong,
.workflow-ai-panel__ops-count {
  font-size: 11px;
  font-weight: 800;
  color: #334155;
}

.workflow-ai-panel__list-block ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: #475569;
  font-size: 12px;
}

.workflow-ai-panel__context-name {
  font-weight: 700;
  color: #0f172a;
}

.workflow-ai-panel__ops-count {
  margin-bottom: 12px;
}

.workflow-ai-panel__diag-meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.workflow-ai-panel__diag-meta div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #334155;
}

.workflow-ai-panel__diag-meta strong {
  color: #0f172a;
}

.workflow-ai-panel__schema-card {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}

.workflow-ai-panel__schema-card:first-of-type {
  margin-top: 8px;
}

.workflow-ai-panel__schema-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #475569;
  margin-bottom: 8px;
}

.workflow-ai-panel__schema-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.workflow-ai-panel__schema-grid div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #334155;
}

.workflow-ai-panel__schema-grid strong {
  color: #0f172a;
}

.workflow-ai-panel__raw-output {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: #334155;
}

.workflow-ai-panel__error,
.workflow-ai-panel__test-result {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.workflow-ai-panel__error,
.workflow-ai-panel__test-result.is-error {
  color: #b91c1c;
}

.workflow-ai-panel__test-result.is-success {
  color: #166534;
}

.workflow-ai-panel__profile-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 12px;
}

.workflow-ai-panel__profile-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  margin-top: 8px;
}

.workflow-ai-panel__profile-name {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.workflow-ai-panel__profile-meta,
.workflow-ai-panel__empty {
  font-size: 11px;
  color: #64748b;
}

.workflow-ai-panel__profile-actions {
  display: flex;
  gap: 6px;
}

.workflow-ai-panel__tiny-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid #dbe4ef;
  background: #fff;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.workflow-ai-panel__tiny-btn.is-danger {
  color: #b91c1c;
}

.workflow-ai-panel__form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
}
</style>
