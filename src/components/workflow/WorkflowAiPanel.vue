<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { Bot, ChevronDown, ChevronUp, RefreshCcw, Sparkles, Wrench, X } from 'lucide-vue-next'
import Button from 'primevue/button'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import type { WorkflowAiModelProfile } from '@/ai/types'

const props = defineProps<{
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
const systemProfiles = computed(() => aiStore.systemProfiles)
const customProfiles = computed(() => aiStore.customProfiles)

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

const handleApply = () => {
  aiStore.applyCurrentPlan(workflowStore as any)
}

const handleRestore = () => {
  aiStore.restoreLastApplied(workflowStore as any)
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
</script>

<template>
  <div class="workflow-ai-panel" :data-visible="visible">
    <div class="workflow-ai-panel__header">
      <div class="workflow-ai-panel__title">
        <div class="workflow-ai-panel__badge">
          <Bot :size="16" />
        </div>
        <div>
          <strong>AI 编排</strong>
          <p>用自然语言创建或修改工作流</p>
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
          <span>编排请求</span>
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
            <span>{{ aiStore.isGenerating ? '生成中...' : '生成计划' }}</span>
          </Button>
          <Button severity="secondary" class="workflow-ai-panel__secondary" @click="aiStore.settingsVisible = !aiStore.settingsVisible">
            <Wrench :size="14" />
            <span>模型设置</span>
            <component :is="aiStore.settingsVisible ? ChevronUp : ChevronDown" :size="14" />
          </Button>
        </div>
        <p v-if="aiStore.errorMessage" class="workflow-ai-panel__error">{{ aiStore.errorMessage }}</p>
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

.workflow-ai-panel__ops-count {
  margin-bottom: 12px;
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
