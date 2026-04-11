<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { Cpu, PlugZap, ShieldCheck, Wrench } from 'lucide-vue-next'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import type { WorkflowAiModelProfile } from '@/ai/types'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

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

const systemProfiles = computed(() => aiStore.systemProfiles)
const customProfiles = computed(() => aiStore.customProfiles)
const canSaveDraft = computed(
  () => draftProfile.name.trim().length > 0 && draftProfile.baseUrl.trim().length > 0 && draftProfile.model.trim().length > 0,
)
const canTestDraft = computed(
  () => draftProfile.baseUrl.trim().length > 0 && draftProfile.model.trim().length > 0,
)

const resetDraftProfile = () => {
  draftProfile.id = `custom_${Date.now()}`
  draftProfile.name = ''
  draftProfile.baseUrl = ''
  draftProfile.model = ''
  draftProfile.apiKey = ''
  draftProfile.enabled = true
  draftProfile.source = 'custom'
}

const ensureProfilesLoaded = async () => {
  if (!aiStore.profiles.length && !aiStore.isLoadingProfiles) {
    await aiStore.loadProfiles()
  }
}

const selectProfile = (profileId: string) => {
  aiStore.selectedProfileId = profileId
}

const handleSaveCustomProfile = () => {
  if (!canSaveDraft.value) return
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
  if (!canTestDraft.value) return
  await aiStore.testProfile({
    ...draftProfile,
    name: draftProfile.name.trim() || '当前草稿',
    baseUrl: draftProfile.baseUrl.trim(),
    model: draftProfile.model.trim(),
    apiKey: draftProfile.apiKey?.trim(),
    enabled: true,
    source: 'custom',
  })
}

onMounted(async () => {
  await ensureProfilesLoaded()
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    await ensureProfilesLoaded()
  },
)
</script>

<template>
  <Dialog
    :visible="props.visible"
    modal
    class="agent-model-settings-dialog"
    :style="{ width: 'min(900px, 92vw)' }"
    @update:visible="emit('close')"
  >
    <template #header>
      <div class="agent-model-settings-dialog__header">
        <span class="agent-model-settings-dialog__badge">
          <Wrench :size="18" />
        </span>
        <div>
          <strong>模型配置</strong>
          <p>支持系统默认模型，以及自定义 OpenAI 兼容接口。</p>
        </div>
      </div>
    </template>

    <div data-testid="agent-model-settings-dialog" class="agent-model-settings-dialog__body">
      <section class="agent-model-settings-dialog__section">
        <div class="agent-model-settings-dialog__section-title">
          <ShieldCheck :size="16" />
          <span>默认模型</span>
        </div>

        <div v-if="!systemProfiles.length" class="agent-model-settings-dialog__empty">
          当前没有可用的默认模型。
        </div>

        <article
          v-for="profile in systemProfiles"
          :key="profile.id"
          class="agent-model-settings-dialog__profile-card"
          :class="{ 'is-selected': aiStore.selectedProfileId === profile.id }"
        >
          <div class="agent-model-settings-dialog__profile-main">
            <strong>{{ profile.name }}</strong>
            <span>{{ profile.baseUrl }} · {{ profile.model }}</span>
          </div>
          <button type="button" class="agent-model-settings-dialog__profile-tag" @click="selectProfile(profile.id)">
            {{ aiStore.selectedProfileId === profile.id ? '当前使用' : '点击使用' }}
          </button>
        </article>
      </section>

      <section class="agent-model-settings-dialog__section">
        <div class="agent-model-settings-dialog__section-title">
          <PlugZap :size="16" />
          <span>OpenAI 兼容接口</span>
        </div>

        <div v-if="customProfiles.length" class="agent-model-settings-dialog__profile-list">
          <article
            v-for="profile in customProfiles"
            :key="profile.id"
            class="agent-model-settings-dialog__profile-card"
            :class="{ 'is-selected': aiStore.selectedProfileId === profile.id }"
          >
            <div class="agent-model-settings-dialog__profile-main">
              <strong>{{ profile.name }}</strong>
              <span>{{ profile.baseUrl }} · {{ profile.model }}</span>
            </div>
            <div class="agent-model-settings-dialog__profile-actions">
              <button type="button" class="agent-model-settings-dialog__profile-tag" @click="selectProfile(profile.id)">
                {{ aiStore.selectedProfileId === profile.id ? '当前使用' : '点击使用' }}
              </button>
              <button type="button" class="agent-model-settings-dialog__tiny-btn" @click.stop="aiStore.testProfile(profile)">测试</button>
              <button type="button" class="agent-model-settings-dialog__tiny-btn is-danger" @click.stop="aiStore.removeCustomProfile(profile.id)">删除</button>
            </div>
          </article>
        </div>

        <div v-else class="agent-model-settings-dialog__empty">
          还没有自定义模型配置。
        </div>

        <div class="agent-model-settings-dialog__form">
          <label class="agent-model-settings-dialog__field">
            <span>配置名称</span>
            <input v-model="draftProfile.name" type="text" placeholder="例如：本地 OpenAI 兼容模型" />
          </label>
          <label class="agent-model-settings-dialog__field">
            <span>Base URL</span>
            <input v-model="draftProfile.baseUrl" type="text" placeholder="例如：https://api.openai.com/v1" />
          </label>
          <label class="agent-model-settings-dialog__field">
            <span>模型 ID</span>
            <input v-model="draftProfile.model" type="text" placeholder="例如：gpt-4o-mini" />
          </label>
          <label class="agent-model-settings-dialog__field">
            <span>API Key</span>
            <input v-model="draftProfile.apiKey" type="password" placeholder="请输入 API Key" />
          </label>
        </div>

        <div class="agent-model-settings-dialog__actions">
          <button type="button" class="agent-model-settings-dialog__primary" :disabled="!canSaveDraft" @click="handleSaveCustomProfile">
            保存自定义配置
          </button>
          <button type="button" class="agent-model-settings-dialog__secondary" :disabled="!canTestDraft" @click="handleTestDraftProfile">
            测试当前配置
          </button>
        </div>

        <p
          v-if="aiStore.lastTestResult"
          class="agent-model-settings-dialog__test-result"
          :class="{ 'is-success': aiStore.lastTestResult.success, 'is-error': !aiStore.lastTestResult.success }"
        >
          {{ aiStore.lastTestResult.message }}
          <span v-if="aiStore.lastTestResult.latencyMs">（{{ aiStore.lastTestResult.latencyMs }}ms）</span>
        </p>
      </section>

      <section class="agent-model-settings-dialog__section agent-model-settings-dialog__section--compact">
        <div class="agent-model-settings-dialog__section-title">
          <Cpu :size="16" />
          <span>当前使用</span>
        </div>
        <p class="agent-model-settings-dialog__current">
          {{ aiStore.selectedProfile ? `${aiStore.selectedProfile.name} · ${aiStore.selectedProfile.model}` : '还没有选择模型配置。' }}
        </p>
      </section>
    </div>
  </Dialog>
</template>

<style scoped>
.agent-model-settings-dialog__header {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: center;
}

.agent-model-settings-dialog__badge {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  color: #ffffff;
}

.agent-model-settings-dialog__header strong {
  display: block;
  color: #0f172a;
  font-size: 16px;
}

.agent-model-settings-dialog__header p,
.agent-model-settings-dialog__profile-main span,
.agent-model-settings-dialog__empty,
.agent-model-settings-dialog__current,
.agent-model-settings-dialog__test-result {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.agent-model-settings-dialog__body {
  display: grid;
  gap: 16px;
}

.agent-model-settings-dialog__section {
  display: grid;
  gap: 12px;
  border: 1px solid #dbe4ef;
  border-radius: 20px;
  background: #ffffff;
  padding: 16px;
}

.agent-model-settings-dialog__section--compact {
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.agent-model-settings-dialog__section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.agent-model-settings-dialog__profile-list {
  display: grid;
  gap: 10px;
}

.agent-model-settings-dialog__profile-card {
  width: 100%;
  border: 1px solid #dbe4ef;
  border-radius: 16px;
  background: #f8fafc;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  text-align: left;
  cursor: pointer;
}

.agent-model-settings-dialog__profile-card.is-selected {
  border-color: #2563eb;
  background: #eff6ff;
}

.agent-model-settings-dialog__profile-main strong {
  display: block;
  color: #0f172a;
  font-size: 12px;
}

.agent-model-settings-dialog__profile-tag {
  align-self: center;
  border: none;
  border-radius: 999px;
  background: #ffffff;
  color: #1d4ed8;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.agent-model-settings-dialog__profile-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.agent-model-settings-dialog__tiny-btn,
.agent-model-settings-dialog__primary,
.agent-model-settings-dialog__secondary {
  height: 32px;
  border-radius: 12px;
  border: 1px solid #dbe4ef;
  background: #ffffff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0 12px;
}

.agent-model-settings-dialog__tiny-btn.is-danger {
  color: #b91c1c;
}

.agent-model-settings-dialog__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.agent-model-settings-dialog__field {
  display: grid;
  gap: 6px;
}

.agent-model-settings-dialog__field span {
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}

.agent-model-settings-dialog__field input {
  width: 100%;
  border: 1px solid #dbe4ef;
  border-radius: 12px;
  background: #ffffff;
  color: #0f172a;
  font-size: 12px;
  padding: 10px 12px;
  outline: none;
}

.agent-model-settings-dialog__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-model-settings-dialog__primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.agent-model-settings-dialog__secondary {
  background: #ffffff;
}

.agent-model-settings-dialog__primary:disabled,
.agent-model-settings-dialog__secondary:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.agent-model-settings-dialog__test-result.is-success {
  color: #166534;
}

.agent-model-settings-dialog__test-result.is-error {
  color: #b91c1c;
}

@media (max-width: 960px) {
  .agent-model-settings-dialog__form {
    grid-template-columns: 1fr;
  }

  .agent-model-settings-dialog__profile-card {
    grid-template-columns: 1fr;
  }

  .agent-model-settings-dialog__profile-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
