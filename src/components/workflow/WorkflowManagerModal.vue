<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { type SavedWorkflow, type ExecutionRecord } from '@/utils/storage'
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
} from 'lucide-vue-next'

const _props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['close', 'load-workflow', 'create-workflow'])

const store = useWorkflowStore()
const confirm = useConfirm()

const activeTab = ref('0')
const duplicateDialogVisible = ref(false)
const duplicateSourceWorkflowId = ref<string | null>(null)
const duplicateWorkflowName = ref('')

const loadData = async () => {
  await store.getSavedWorkflows()
  await store.loadHistory()
}

onMounted(loadData)

// 排序后的工作流列表 (按更新时间倒序)
const sortedWorkflows = computed(() => {
  return [...store.savedWorkflows].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
})

// 当前工作流的运行历史
const currentWorkflowHistory = computed<ExecutionRecord[]>(() => {
  const executionHistory = store.executionHistory as ExecutionRecord[]
  if (store.currentWorkflowId) {
    return executionHistory.filter((record) => record.workflowId === store.currentWorkflowId)
  }
  return executionHistory
})

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

const handleClearHistory = async () => {
  await store.clearHistory()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '640px' }"
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
          <TabPanel value="1">
            <div class="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
              <span class="text-[11px] font-bold text-slate-500">
                当前工作流的历史记录 (最近 20 条)
              </span>
              <Button
                v-if="currentWorkflowHistory.length > 0"
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
                v-if="currentWorkflowHistory.length === 0"
                class="text-center py-20 text-[#a3acb9] italic"
              >
                <History :size="48" class="mx-auto mb-4 opacity-10" /> 暂无当前工作流的运行记录。
              </div>
              <div
                v-for="record in currentWorkflowHistory"
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
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
</style>
