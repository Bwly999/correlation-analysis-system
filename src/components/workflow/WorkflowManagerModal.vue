<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { type SavedWorkflow, type ExecutionRecord } from '@/utils/storage'
import { workflowTemplateDefinitions } from '@/workflow/templates'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { useConfirm } from 'primevue/useconfirm'
import {
  X,
  Plus,
  Layers2,
  FolderOpen,
  History,
  Clock,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  StopCircle,
  Activity,
  Radar,
  Trophy,
  Microscope,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
} from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  initialTab?: string
}>()

const emit = defineEmits([
  'close',
  'load-workflow',
  'create-workflow',
  'create-workflow-from-template',
])

const store = useWorkflowStore()
const confirm = useConfirm()

const activeTab = ref(props.initialTab ?? '0')
const duplicateDialogVisible = ref(false)
const duplicateSourceWorkflowId = ref<string | null>(null)
const duplicateWorkflowName = ref('')

const loadData = async () => {
  await store.getSavedWorkflows()
  await store.loadHistory()
}

onMounted(loadData)

watch(
  () => [props.visible, props.initialTab] as const,
  ([visible, initialTab]) => {
    if (visible) {
      activeTab.value = initialTab ?? '0'
    }
  },
  { immediate: true },
)

// 排序后的工作流列表 (按更新时间倒序)
const sortedWorkflows = computed(() => {
  return [...store.savedWorkflows].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
})

// 管理中心统一展示全部工作流的运行历史
const allWorkflowHistory = computed<ExecutionRecord[]>(
  () => store.executionHistory as ExecutionRecord[],
)

const handleLoadWorkflow = async (id: string) => {
  emit('load-workflow', id)
}

const openDuplicateWorkflowDialog = (workflow: SavedWorkflow) => {
  duplicateSourceWorkflowId.value = workflow.id
  duplicateWorkflowName.value = store.getDuplicatedWorkflowName(workflow.name)
  duplicateDialogVisible.value = true
}

const closeDuplicateWorkflowDialog = () => {
  duplicateDialogVisible.value = false
  duplicateSourceWorkflowId.value = null
  duplicateWorkflowName.value = ''
}

const duplicateWorkflowNameTrimmed = computed(() => duplicateWorkflowName.value.trim())

const handleDuplicateWorkflow = async () => {
  if (!duplicateSourceWorkflowId.value || !duplicateWorkflowNameTrimmed.value) return
  await store.duplicateWorkflow(duplicateSourceWorkflowId.value, duplicateWorkflowNameTrimmed.value)
  closeDuplicateWorkflowDialog()
}

const handleDeleteWorkflow = (id: string) => {
  confirm.require({
    message: '确定要删除这个工作流吗？此操作不可撤销。',
    header: '确认删除',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
      outlined: true,
    },
    acceptProps: {
      label: '确认删除',
      severity: 'danger',
    },
    accept: async () => {
      await store.deleteWorkflow(id)
    },
  })
}

const handleRestoreExecution = (record: ExecutionRecord) => {
  store.enterHistoryMode(record.id)
  emit('close')
}

const handleCreateNew = () => {
  emit('create-workflow')
}

const openTemplateTab = () => {
  activeTab.value = '2'
}

const handleCreateFromTemplate = (templateId: string) => {
  emit('create-workflow-from-template', templateId)
}

const handleClearHistory = async () => {
  await store.clearHistory()
}

const templateVisualMap = {
  insight: {
    icon: Radar,
    shell: 'border-blue-200 bg-[radial-gradient(circle_at_top_left,_rgba(191,219,254,0.9),_rgba(255,255,255,0.98)_48%,_rgba(239,246,255,0.9)_100%)]',
    glow: 'from-blue-500/18 via-sky-500/10 to-transparent',
    iconWrap: 'bg-blue-600 text-white shadow-[0_14px_28px_-18px_rgba(37,99,235,0.9)]',
    accentText: 'text-blue-700',
    accentSoft: 'bg-blue-100/80 text-blue-700 border-blue-200',
    panel: 'bg-white/80 border-blue-100',
    buttonClass: 'template-action-btn template-action-btn--blue',
  },
  ranking: {
    icon: Trophy,
    shell: 'border-emerald-200 bg-[radial-gradient(circle_at_top_left,_rgba(209,250,229,0.95),_rgba(255,255,255,0.98)_50%,_rgba(236,253,245,0.88)_100%)]',
    glow: 'from-emerald-500/18 via-teal-500/10 to-transparent',
    iconWrap: 'bg-emerald-600 text-white shadow-[0_14px_28px_-18px_rgba(5,150,105,0.9)]',
    accentText: 'text-emerald-700',
    accentSoft: 'bg-emerald-100/80 text-emerald-700 border-emerald-200',
    panel: 'bg-white/82 border-emerald-100',
    buttonClass: 'template-action-btn template-action-btn--emerald',
  },
  explanation: {
    icon: Microscope,
    shell: 'border-amber-200 bg-[radial-gradient(circle_at_top_left,_rgba(254,243,199,0.96),_rgba(255,255,255,0.98)_50%,_rgba(255,251,235,0.88)_100%)]',
    glow: 'from-amber-500/18 via-orange-500/10 to-transparent',
    iconWrap: 'bg-amber-500 text-white shadow-[0_14px_28px_-18px_rgba(217,119,6,0.9)]',
    accentText: 'text-amber-700',
    accentSoft: 'bg-amber-100/80 text-amber-700 border-amber-200',
    panel: 'bg-white/82 border-amber-100',
    buttonClass: 'template-action-btn template-action-btn--amber',
  },
  comparison: {
    icon: LayoutDashboard,
    shell: 'border-cyan-200 bg-[radial-gradient(circle_at_top_left,_rgba(207,250,254,0.96),_rgba(255,255,255,0.98)_50%,_rgba(236,254,255,0.88)_100%)]',
    glow: 'from-cyan-500/18 via-sky-500/10 to-transparent',
    iconWrap: 'bg-cyan-600 text-white shadow-[0_14px_28px_-18px_rgba(8,145,178,0.9)]',
    accentText: 'text-cyan-700',
    accentSoft: 'bg-cyan-100/80 text-cyan-700 border-cyan-200',
    panel: 'bg-white/82 border-cyan-100',
    buttonClass: 'template-action-btn template-action-btn--cyan',
  },
} as const

const getTemplateVisual = (theme: keyof typeof templateVisualMap) => templateVisualMap[theme]
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: 'min(980px, calc(100vw - 32px))' }"
    :pt="{
      mask: {
        class: 'workflow-manager-dialog-mask',
      },
    }"
    class="n8n-modern-dialog"
    :closable="false"
    @update:visible="(val) => !val && emit('close')"
  >
    <template #header>
      <div class="flex items-center justify-between w-full pr-4">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-slate-100 text-slate-600 rounded-lg">
            <Layers2 :size="20" :stroke-width="2.5" />
          </div>
          <span class="font-bold text-[16px] text-slate-900 tracking-tight">工作流管理中心</span>
        </div>
        <button
          class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex items-center justify-center cursor-pointer"
          aria-label="Close"
          @click="emit('close')"
        >
          <X :size="20" :stroke-width="2.5" />
        </button>
      </div>
    </template>

    <div class="py-2">
      <Tabs v-model:value="activeTab">
        <TabList>
          <Tab value="0" class="flex items-center gap-2"><FolderOpen :size="14" /> 我的工作流</Tab>
          <Tab value="2" class="flex items-center gap-2"><Layers2 :size="14" /> 分析模板</Tab>
          <Tab value="1" class="flex items-center gap-2"><History :size="14" /> 运行历史</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="0">
            <div class="flex flex-col py-4 px-1 gap-5">
              <!-- 创建入口 -->
              <div
                class="flex items-center gap-4 p-5 bg-slate-900 text-white rounded-2xl cursor-pointer hover:bg-slate-800 transition-all shadow-lg shadow-slate-200/50 group/new shrink-0"
                @click="handleCreateNew"
              >
                <div
                  class="p-3 bg-white/10 rounded-xl group-hover/new:bg-white/20 transition-colors"
                >
                  <Plus :size="24" :stroke-width="2.5" />
                </div>
                <div>
                  <div class="font-bold text-[16px] tracking-tight">创建新工作流</div>
                  <div class="text-[11px] text-slate-400">从零开始构建您的分析流程</div>
                </div>
              </div>

              <div
                class="flex items-center gap-4 p-5 bg-white border border-blue-100 rounded-2xl cursor-pointer hover:border-blue-200 hover:bg-blue-50/60 transition-all shadow-sm group/template shrink-0"
                @click="openTemplateTab"
              >
                <div
                  class="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover/template:bg-blue-100 transition-colors"
                >
                  <Layers2 :size="24" :stroke-width="2.5" />
                </div>
                <div>
                  <div class="font-bold text-[16px] tracking-tight text-slate-900">从模板创建</div>
                  <div class="text-[11px] text-slate-500">选择常见分析链路，直接生成可编辑工作流</div>
                </div>
              </div>

              <!-- 列表展示区域 -->
              <div class="flex flex-col gap-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                <div
                  v-if="sortedWorkflows.length === 0"
                  class="text-center py-10 text-[#a3acb9] italic border-2 border-dashed rounded-2xl flex flex-col items-center gap-2"
                >
                  <FolderOpen :size="32" class="opacity-20" /> 还没有保存过任何工作流。
                </div>
                <div
                  v-for="wf in sortedWorkflows"
                  :key="wf.id"
                  class="flex items-center justify-between p-4 bg-[#fcfcfd] border border-[#f1f4f8] rounded-xl hover:border-indigo-200 hover:bg-white transition-all group"
                >
                  <div class="flex flex-col gap-1">
                    <span class="font-bold text-[13px] text-[#3c4257]">{{ wf.name }}</span>
                    <span
                      class="text-[10px] text-[#a3acb9] flex items-center gap-1.5 font-medium uppercase tracking-tight"
                      ><Clock :size="12" /> 更新于
                      {{ new Date(wf.updatedAt).toLocaleString() }}</span
                    >
                  </div>
                  <div class="flex gap-2">
                    <Button
                      label="打开"
                      size="small"
                      text
                      class="font-black text-indigo-600 px-3"
                      @click="handleLoadWorkflow(wf.id)"
                    />
                    <Button
                      v-tooltip.top="'复制工作流'"
                      severity="secondary"
                      text
                      size="small"
                      data-testid="duplicate-workflow-button"
                      class="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                      @click="openDuplicateWorkflowDialog(wf)"
                      ><Copy :size="16"
                    /></Button>
                    <Button
                      v-tooltip.top="'删除工作流'"
                      severity="danger"
                      text
                      size="small"
                      class="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      @click="handleDeleteWorkflow(wf.id)"
                      ><Trash2 :size="16"
                    /></Button>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>
          <TabPanel value="2">
            <div class="flex flex-col gap-4 py-4 px-1">
              <div
                class="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_#0f172a_0%,_#172554_46%,_#0f172a_100%)] px-5 py-5 text-white shadow-[0_22px_60px_-32px_rgba(15,23,42,0.65)]"
              >
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(96,165,250,0.28),_transparent_34%)]"></div>
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(59,130,246,0.18),_transparent_42%)]"></div>
                <div class="relative">
                  <div
                    class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold tracking-[0.24em] text-blue-100"
                  >
                    <Sparkles :size="12" />
                    分析模板
                  </div>
                  <div class="mt-4 max-w-[520px]">
                    <div class="text-[24px] font-black tracking-tight text-white">
                      先看结果，再决定要不要用这条工作流
                    </div>
                    <div class="mt-2 text-sm leading-6 text-slate-200">
                      每张模板卡都先告诉你最终会得到什么分析成果，再补充适合场景、关键产出和核心节点，帮助你快速选对起手式。
                    </div>
                  </div>
                  <div class="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-200">
                    <span class="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">一键创建</span>
                    <span class="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">未保存骨架</span>
                    <span class="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">结果导向挑选</span>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 pr-1">
                <div
                  v-for="template in workflowTemplateDefinitions"
                  :key="template.id"
                  :class="[
                    'group relative overflow-hidden rounded-[28px] border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)]',
                    getTemplateVisual(template.theme).shell,
                  ]"
                >
                  <div
                    :class="[
                      'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 transition-opacity duration-300 group-hover:opacity-100',
                      getTemplateVisual(template.theme).glow,
                    ]"
                  ></div>
                  <div class="relative flex min-h-[360px] flex-col">
                    <div class="flex items-start justify-between gap-5">
                      <div class="min-w-0">
                        <div
                          :class="[
                            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black tracking-[0.18em]',
                            getTemplateVisual(template.theme).accentSoft,
                          ]"
                        >
                          {{ template.categoryLabel }}
                        </div>
                        <div class="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          你会先看到
                        </div>
                      </div>
                      <div
                        :class="[
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px]',
                          getTemplateVisual(template.theme).iconWrap,
                        ]"
                      >
                        <component :is="getTemplateVisual(template.theme).icon" :size="20" :stroke-width="2.3" />
                      </div>
                    </div>

                    <div class="mt-3">
                      <div class="max-w-[620px] text-[26px] font-black leading-[1.08] tracking-tight text-slate-950">
                        {{ template.outcomeTitle }}
                      </div>
                      <p class="mt-3 max-w-[680px] text-[14px] leading-6 text-slate-600">
                        {{ template.outcomeSummary }}
                      </p>
                    </div>

                    <div class="mt-5 flex flex-wrap gap-2.5">
                      <span
                        v-for="result in template.keyResults"
                        :key="result"
                        :class="[
                          'inline-flex rounded-full border px-3.5 py-1.5 text-[11px] font-bold',
                          getTemplateVisual(template.theme).accentSoft,
                        ]"
                      >
                        {{ result }}
                      </span>
                    </div>

                    <div
                      :class="[
                        'mt-6 rounded-[22px] border p-5 backdrop-blur-sm',
                        getTemplateVisual(template.theme).panel,
                      ]"
                    >
                      <div class="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6 max-md:grid-cols-1">
                        <div>
                          <div class="text-[11px] font-black tracking-[0.2em] text-slate-500">核心节点</div>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <span
                              v-for="node in template.keyNodes"
                              :key="node"
                              class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              {{ node }}
                            </span>
                          </div>
                        </div>

                        <div>
                          <div class="text-[11px] font-black tracking-[0.2em] text-slate-500">适合场景</div>
                          <p class="mt-2 text-[12px] leading-5 text-slate-700">{{ template.bestFor }}</p>
                        </div>
                      </div>

                      <div class="mt-5">
                        <div class="text-[11px] font-black tracking-[0.2em] text-slate-500">下一步建议</div>
                        <p class="mt-2 text-[12px] leading-5 text-slate-600">
                          {{ template.recommendedNextStep }}
                        </p>
                      </div>

                      <div class="mt-4 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3">
                        <div class="text-[11px] font-black tracking-[0.18em] text-blue-700">数据入口建议</div>
                        <p class="mt-1 text-[12px] leading-5 text-blue-700">
                          {{ template.dataSourceHint }}
                        </p>
                      </div>
                    </div>

                    <div class="mt-auto flex items-end justify-between gap-4 pt-5 max-md:flex-col max-md:items-start">
                      <div class="max-w-[560px]">
                        <div class="text-[13px] font-bold text-slate-900">{{ template.name }}</div>
                        <div :class="['mt-1 text-[12px] font-medium leading-5', getTemplateVisual(template.theme).accentText]">
                          {{ template.description }}
                        </div>
                      </div>
                      <Button
                        :data-testid="`workflow-template-create-${template.id}`"
                        label="立即生成"
                        size="small"
                        :class="getTemplateVisual(template.theme).buttonClass"
                        @click="handleCreateFromTemplate(template.id)"
                      >
                        <template #icon>
                          <ArrowRight :size="14" />
                        </template>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>
          <TabPanel value="1">
            <div class="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
              <span class="text-[11px] font-bold text-slate-500">
                所有工作流的历史记录 (最近 20 条)
              </span>
              <Button
                v-if="allWorkflowHistory.length > 0"
                label="清空历史"
                size="small"
                severity="danger"
                text
                class="text-xs py-1 px-2 h-auto"
                @click="handleClearHistory"
              />
            </div>
            <div
              class="flex flex-col gap-3 py-4 max-h-[420px] overflow-y-auto custom-scrollbar px-1"
            >
              <div
                v-if="allWorkflowHistory.length === 0"
                class="text-center py-20 text-[#a3acb9] italic"
              >
                <History :size="48" class="mx-auto mb-4 opacity-10" /> 暂无运行记录。
              </div>
              <div
                v-for="record in allWorkflowHistory"
                :key="record.id"
                class="flex items-center justify-between p-4 bg-[#fcfcfd] border border-[#f1f4f8] rounded-xl hover:bg-white transition-all group border-l-4"
                :class="
                  record.status === 'success'
                    ? 'border-l-emerald-500'
                    : record.status === 'error'
                      ? 'border-l-rose-500'
                      : 'border-l-amber-500'
                "
              >
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <CheckCircle2
                      v-if="record.status === 'success'"
                      :size="14"
                      class="text-emerald-500"
                    />
                    <AlertCircle
                      v-else-if="record.status === 'error'"
                      :size="14"
                      class="text-rose-500"
                    />
                    <StopCircle v-else :size="14" class="text-amber-500" />
                    <span class="font-bold text-[13px] text-[#3c4257]">{{
                      record.workflowName
                    }}</span>
                  </div>
                  <div
                    class="flex items-center gap-3 text-[10px] text-[#a3acb9] font-medium uppercase tracking-tight"
                  >
                    <span class="flex items-center gap-1"
                      ><Clock :size="12" /> {{ new Date(record.startTime).toLocaleString() }}</span
                    >
                    <span class="flex items-center gap-1"
                      ><Activity :size="12" /> {{ (record.duration / 1000).toFixed(2) }}s</span
                    >
                  </div>
                </div>
                <Button
                  label="查看快照"
                  size="small"
                  text
                  class="font-black text-indigo-600 px-3"
                  @click="handleRestoreExecution(record)"
                />
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </Dialog>

  <Dialog
    :visible="duplicateDialogVisible"
    modal
    :closable="false"
    :style="{ width: '420px' }"
    @update:visible="(value) => !value && closeDuplicateWorkflowDialog()"
  >
    <template #header>
      <div class="flex flex-col gap-1">
        <span class="text-base font-bold text-slate-900">设置新工作流名称</span>
        <span class="text-sm text-slate-500">复制后将以新名称创建一份独立工作流。</span>
      </div>
    </template>

    <div class="flex flex-col gap-3 py-2">
      <label for="duplicate-workflow-name" class="text-sm font-medium text-slate-700">
        新工作流名称
      </label>
      <InputText
        id="duplicate-workflow-name"
        v-model="duplicateWorkflowName"
        autofocus
        placeholder="请输入工作流名称"
      />
      <p class="text-xs text-slate-500">默认名称已自动生成，你也可以按需修改。</p>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3 pt-2">
        <Button label="取消" severity="secondary" outlined @click="closeDuplicateWorkflowDialog" />
        <Button
          data-testid="confirm-duplicate-workflow-button"
          label="确认复制"
          :disabled="!duplicateWorkflowNameTrimmed"
          @click="handleDuplicateWorkflow"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
:global(.workflow-manager-dialog-mask) {
  align-items: flex-start !important;
  padding-top: clamp(2rem, 8vh, 5rem);
}

.n8n-modern-dialog :deep(.p-dialog-header) {
  border-bottom: 1px solid #f1f4f8;
  padding: 1rem 1.5rem;
}
.n8n-modern-dialog :deep(.p-dialog-header-title) {
  font-weight: 800;
  font-size: 16px;
  color: #1a1f36;
}
.n8n-modern-dialog :deep(.p-dialog-content) {
  padding: 0 1rem;
  max-height: min(78vh, 840px);
  overflow-y: auto;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}

.template-action-btn {
  height: 2.5rem;
  border-radius: 999px;
  border: none;
  padding-inline: 0.9rem;
  font-size: 12px;
  font-weight: 800;
  color: #ffffff;
  box-shadow: 0 14px 28px -18px rgba(15, 23, 42, 0.4);
}

.template-action-btn--blue {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
}

.template-action-btn--emerald {
  background: linear-gradient(135deg, #059669 0%, #0f766e 100%);
}

.template-action-btn--amber {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
}

.template-action-btn--cyan {
  background: linear-gradient(135deg, #0891b2 0%, #0f766e 100%);
}
</style>
