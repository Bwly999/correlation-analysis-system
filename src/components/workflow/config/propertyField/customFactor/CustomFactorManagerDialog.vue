<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import type { CellValueChangedEvent, ColDef, GridApi, GridReadyEvent, RowSelectionOptions, SelectionChangedEvent } from 'ag-grid-community'
import { AgGridVue } from 'ag-grid-vue3'
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { Download, FileSpreadsheet, Lock, LockOpen, Plus, Sparkles, Trash2, Upload } from 'lucide-vue-next'
import { useWorkflowOverlayHost } from '@/components/workflow/workflowOverlayHost'
import AgGridCommunitySetFilter from '@/components/workflow/common/AgGridCommunitySetFilter.vue'
import { parseTabularTextFile, type ParsedTabularTextFile } from '../inputs/fileColumnTextImport'
import { buildCustomFactorsFromColumnMapping, buildCustomFactorsFromDraft } from './importers'
import {
  createCustomFactorGroup,
  deleteCustomFactorGroup,
  duplicateCustomFactorGroup,
  exportCustomFactorGroups,
  importCustomFactorGroups,
  loadCustomFactorGroups,
  saveCustomFactorGroup,
} from './storage'
import { CUSTOM_FACTOR_FIELDS, type CustomFactorColumnMapping, type CustomFactorDraft, type CustomFactorGroup, type CustomFactorRecord } from './types'

ModuleRegistry.registerModules([AllCommunityModule])

const myTheme = themeQuartz.withParams({
  fontSize: 13,
  fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  headerBackgroundColor: '#fafafa',
  backgroundColor: '#ffffff',
  borderColor: 'rgba(24, 29, 31, 0.12)',
  rowHoverColor: 'rgba(33, 150, 243, 0.08)',
  selectedRowBackgroundColor: 'rgba(33, 150, 243, 0.12)',
  oddRowBackgroundColor: 'rgba(248, 250, 252, 0.76)',
  inputFocusBorder: '1px solid rgba(37, 99, 235, 0.55)',
})

const props = defineProps<{
  visible: boolean
  storageKey: string
  selectedGroupId: string
  dialogTitle?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'update:selectedGroupId': [value: string]
  saved: []
}>()

const { overlayAppendTo } = useWorkflowOverlayHost()

const groups = shallowRef<CustomFactorGroup[]>([])
const currentMode = shallowRef<'batch' | 'excel'>('batch')
const selectedGroupIdLocal = shallowRef('')
const editingFactors = shallowRef<CustomFactorRecord[]>([])
const parsedExcelFile = shallowRef<ParsedTabularTextFile | null>(null)
const selectedExcelFileName = shallowRef('')
const excelColumns = computed(() => parsedExcelFile.value?.columns || [])
const errorMessage = shallowRef('')
const isDirty = shallowRef(false)
const gridApi = shallowRef<GridApi<CustomFactorRecord> | null>(null)
const selectedRowCount = shallowRef(0)
const createGroupDialogVisible = shallowRef(false)
const deleteGroupDialogVisible = shallowRef(false)
const pendingGroupName = shallowRef('')
const isExcelUploadDragging = shallowRef(false)

const createEmptyDraft = (): CustomFactorDraft => ({
  factorKey: { value: '', locked: false },
  factorName: { value: '', locked: false },
  materialType: { value: '', locked: true },
  processName: { value: '', locked: true },
  r2Name: { value: '', locked: false },
})

const batchDraft = ref<CustomFactorDraft>(createEmptyDraft())
const excelMapping = ref<CustomFactorColumnMapping>({
  factorKey: '',
  factorName: '',
  materialType: '',
  processName: '',
  r2Name: '',
})

const resetDrafts = () => {
  batchDraft.value = createEmptyDraft()
  excelMapping.value = {
    factorKey: '',
    factorName: '',
    materialType: '',
    processName: '',
    r2Name: '',
  }
  parsedExcelFile.value = null
  selectedExcelFileName.value = ''
  errorMessage.value = ''
}

const selectedGroupStorageKey = computed(() => `${props.storageKey}:selectedGroupId`)

const loadPersistedSelectedGroupId = () => localStorage.getItem(selectedGroupStorageKey.value) || ''

const persistSelectedGroupId = (groupId: string) => {
  if (!groupId) {
    localStorage.removeItem(selectedGroupStorageKey.value)
    return
  }
  localStorage.setItem(selectedGroupStorageKey.value, groupId)
}

const reloadGroups = () => {
  groups.value = loadCustomFactorGroups(props.storageKey)
}

const selectedGroup = computed(() =>
  groups.value.find((group) => group.id === selectedGroupIdLocal.value) ?? null,
)

const groupOptions = computed(() =>
  groups.value.map((group) => ({
    name: group.name,
    value: group.id,
  })),
)

const columnOptions = computed(() =>
  excelColumns.value.map((column) => ({
    name: column,
    value: column,
  })),
)

const batchFieldStats = computed(() =>
  Object.fromEntries(
    CUSTOM_FACTOR_FIELDS.map((field) => [
      field,
      batchDraft.value[field].value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean).length,
    ]),
  ) as Record<(typeof CUSTOM_FACTOR_FIELDS)[number], number>,
)

const canBatchImport = computed(() =>
  CUSTOM_FACTOR_FIELDS.some((field) => batchFieldStats.value[field] > 0),
)

const canExcelImport = computed(() =>
  Boolean(
    parsedExcelFile.value
    && CUSTOM_FACTOR_FIELDS.every((field) => Boolean(excelMapping.value[field])),
  ),
)

const canSave = computed(() => Boolean(selectedGroup.value) && isDirty.value)
const canDeleteSelectedRows = computed(() => selectedRowCount.value > 0)
const currentGroupSummary = computed(() =>
  selectedGroup.value
    ? `${selectedGroup.value.name} · ${editingFactors.value.length} 条因子`
    : '还没有选中配置组',
)
const gridDefaultColDef = computed<ColDef<CustomFactorRecord>>(() => ({
  resizable: true,
  sortable: true,
  filter: true,
  floatingFilter: true,
  editable: true,
  minWidth: 120,
}))

const gridRowSelection = computed<RowSelectionOptions<CustomFactorRecord>>(() => ({
  mode: 'multiRow',
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: true,
}))

const columnDefs = computed<ColDef<CustomFactorRecord>[]>(() => [
  { field: 'factorKey', headerName: '因子编码', editable: true, flex: 1.05, minWidth: 140 },
  { field: 'factorName', headerName: '因子名称', editable: true, flex: 1.1, minWidth: 140 },
  { field: 'materialType', headerName: '物料类型', filter: 'AgGridCommunitySetFilter', editable: true, flex: 0.95, minWidth: 120 },
  { field: 'processName', headerName: '工序', filter: 'AgGridCommunitySetFilter', editable: true, flex: 0.95, minWidth: 120 },
  { field: 'r2Name', headerName: 'R2 名称', filter: 'AgGridCommunitySetFilter', editable: true, flex: 1, minWidth: 140 },
])

const ensureNoUnsavedChanges = () => {
  if (!isDirty.value) return true
  return window.confirm('当前配置组有未保存改动，确定继续吗？')
}

const resolveInitialSelectedGroupId = (preferredGroupId: string) => {
  const availableGroupIds = new Set(groups.value.map((group) => group.id))
  if (preferredGroupId && availableGroupIds.has(preferredGroupId)) return preferredGroupId

  const persistedGroupId = loadPersistedSelectedGroupId()
  if (persistedGroupId && availableGroupIds.has(persistedGroupId)) return persistedGroupId

  return groups.value[0]?.id || ''
}

const syncEditingFactorsFromGroup = (group: CustomFactorGroup | null) => {
  editingFactors.value = group?.factors.map((factor) => ({
    ...factor,
    uid: factor.uid || crypto.randomUUID(),
  })) || []
  isDirty.value = false
  errorMessage.value = ''
}

const selectGroup = (groupId: string) => {
  if (groupId === selectedGroupIdLocal.value) return
  if (!ensureNoUnsavedChanges()) return
  selectedGroupIdLocal.value = groupId
  persistSelectedGroupId(groupId)
  emit('update:selectedGroupId', groupId)
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    reloadGroups()
    const nextSelectedGroupId = resolveInitialSelectedGroupId(props.selectedGroupId)
    selectedGroupIdLocal.value = nextSelectedGroupId
    persistSelectedGroupId(nextSelectedGroupId)
    if (nextSelectedGroupId !== props.selectedGroupId) {
      emit('update:selectedGroupId', nextSelectedGroupId)
    }
    syncEditingFactorsFromGroup(
      groups.value.find((group) => group.id === nextSelectedGroupId) ?? null,
    )
    resetDrafts()
  },
  { immediate: true },
)

watch(
  () => props.selectedGroupId,
  (groupId) => {
    if (!props.visible) return
    selectedGroupIdLocal.value = groupId
  },
)

watch(selectedGroup, (group) => {
  syncEditingFactorsFromGroup(group)
})

const createGroup = () => {
  const name = pendingGroupName.value.trim()
  if (!name) return
  const created = saveCustomFactorGroup(createCustomFactorGroup(name), props.storageKey)
  reloadGroups()
  selectedGroupIdLocal.value = created.id
  persistSelectedGroupId(created.id)
  emit('update:selectedGroupId', created.id)
  emit('saved')
  pendingGroupName.value = ''
  createGroupDialogVisible.value = false
}

const duplicateGroup = () => {
  if (!selectedGroupIdLocal.value) return
  const duplicated = duplicateCustomFactorGroup(selectedGroupIdLocal.value, props.storageKey)
  if (!duplicated) return
  reloadGroups()
  selectedGroupIdLocal.value = duplicated.id
  persistSelectedGroupId(duplicated.id)
  emit('update:selectedGroupId', duplicated.id)
  emit('saved')
}

const removeGroup = () => {
  if (!selectedGroupIdLocal.value) return
  deleteCustomFactorGroup(selectedGroupIdLocal.value, props.storageKey)
  reloadGroups()
  const fallbackGroupId = groups.value[0]?.id || ''
  selectedGroupIdLocal.value = fallbackGroupId
  persistSelectedGroupId(fallbackGroupId)
  emit('update:selectedGroupId', fallbackGroupId)
  emit('saved')
  deleteGroupDialogVisible.value = false
}

const importGroupsFromFile = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return

  const content = await file.text()
  importCustomFactorGroups(content, props.storageKey)
  reloadGroups()
  emit('saved')
}

const exportGroupsToFile = () => {
  const content = exportCustomFactorGroups(props.storageKey)
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '自定义因子配置组.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

const addFactors = (factors: CustomFactorRecord[]) => {
  editingFactors.value = [...editingFactors.value, ...factors]
  isDirty.value = true
}

const importBatchFactors = () => {
  try {
    const factors = buildCustomFactorsFromDraft(batchDraft.value)
    if (factors.length === 0) {
      errorMessage.value = '请至少输入一条有效因子'
      return
    }
    addFactors(factors)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '批量导入失败'
  }
}

const parseExcelSourceFile = async (file: File) => {
  parsedExcelFile.value = await parseTabularTextFile(file)
  selectedExcelFileName.value = file.name
  CUSTOM_FACTOR_FIELDS.forEach((field) => {
    excelMapping.value[field] = parsedExcelFile.value?.columns.find((column) => column.includes(field === 'factorKey'
      ? '编码'
      : field === 'factorName'
        ? '名称'
        : field === 'materialType'
          ? '物料'
          : field === 'processName'
            ? '工序'
            : 'R2')) || ''
  })
}

const handleExcelSourceFile = async (file: File | null | undefined) => {
  if (!file) return
  try {
    await parseExcelSourceFile(file)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Excel 解析失败'
  }
}

const handleExcelFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  await handleExcelSourceFile(file)
}

const handleExcelDragEnter = (event: DragEvent) => {
  event.preventDefault()
  isExcelUploadDragging.value = true
}

const handleExcelDragOver = (event: DragEvent) => {
  event.preventDefault()
  isExcelUploadDragging.value = true
}

const handleExcelDragLeave = (event: DragEvent) => {
  event.preventDefault()
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget?.contains(relatedTarget)) return
  isExcelUploadDragging.value = false
}

const handleExcelDrop = async (event: DragEvent) => {
  event.preventDefault()
  isExcelUploadDragging.value = false
  await handleExcelSourceFile(event.dataTransfer?.files?.[0])
}

const importExcelFactors = () => {
  if (!parsedExcelFile.value) return
  try {
    const factors = buildCustomFactorsFromColumnMapping(parsedExcelFile.value.rows, excelMapping.value)
    if (factors.length === 0) {
      errorMessage.value = '映射后没有可导入的因子'
      return
    }
    addFactors(factors)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Excel 导入失败'
  }
}

const handleGridReady = (event: GridReadyEvent<CustomFactorRecord>) => {
  gridApi.value = event.api
  selectedRowCount.value = event.api.getSelectedRows().length
}

const handleSelectionChanged = (event: SelectionChangedEvent<CustomFactorRecord>) => {
  selectedRowCount.value = event.api.getSelectedRows().length
}

const handleCellValueChanged = (event: CellValueChangedEvent<CustomFactorRecord>) => {
  const updatedFactor = event.data
  if (!updatedFactor?.uid) return

  editingFactors.value = editingFactors.value.map((factor) =>
    factor.uid === updatedFactor.uid
      ? {
          ...updatedFactor,
        }
      : factor,
  )
  isDirty.value = true
}

const deleteSelectedRows = () => {
  const selectedRows = gridApi.value?.getSelectedRows() || []
  if (selectedRows.length === 0) return
  const selectedKeySet = new Set(selectedRows.map((row) => row.uid))
  editingFactors.value = editingFactors.value.filter((row) => !selectedKeySet.has(row.uid))
  selectedRowCount.value = 0
  isDirty.value = true
}

const saveCurrentGroup = () => {
  if (!selectedGroup.value) {
    errorMessage.value = '请先创建或选择一个配置组'
    return
  }

  saveCustomFactorGroup({
    ...selectedGroup.value,
    factors: editingFactors.value.map((factor) => ({ ...factor })),
  }, props.storageKey)
  reloadGroups()
  syncEditingFactorsFromGroup(
    loadCustomFactorGroups(props.storageKey).find((group) => group.id === selectedGroup.value?.id) ?? null,
  )
  emit('saved')
}

const close = () => {
  if (!ensureNoUnsavedChanges()) return
  emit('update:visible', false)
}

const openCreateGroupDialog = () => {
  pendingGroupName.value = `配置组 ${groups.value.length + 1}`
  createGroupDialogVisible.value = true
}

const openDeleteGroupDialog = () => {
  if (!selectedGroupIdLocal.value) return
  deleteGroupDialogVisible.value = true
}

const triggerImportFile = () => {
  const input = document.getElementById('custom-factor-group-import-input') as HTMLInputElement | null
  input?.click()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    maximizable
    :draggable="false"
    :append-to="overlayAppendTo"
    :style="{ width: 'min(1280px, calc(100vw - 32px))' }"
    :header="dialogTitle || '自定义因子配置'"
    @update:visible="(value) => !value && close()"
  >
    <div class="custom-factor-dialog">
      <section class="custom-factor-dialog__toolbar">
        <div class="custom-factor-dialog__group-select">
          <div class="custom-factor-dialog__group-meta">
            <div class="custom-factor-dialog__section-kicker">
              <Sparkles :size="14" />
              配置组管理
            </div>
            <p class="custom-factor-dialog__section-title">{{ currentGroupSummary }}</p>
          </div>
          <div class="custom-factor-dialog__toolbar-row">
            <Select
              :model-value="selectedGroupIdLocal"
              :options="groupOptions"
              option-label="name"
              option-value="value"
              placeholder="请选择配置组"
              class="custom-factor-dialog__select"
              @update:model-value="selectGroup"
            />

            <div class="custom-factor-dialog__toolbar-actions">
              <Button
                v-tooltip.bottom="'创建配置'"
                aria-label="创建配置"
                class="custom-factor-dialog__icon-button custom-factor-dialog__icon-button--primary"
                @click="openCreateGroupDialog"
              >
                <Plus :size="16" />
              </Button>
              <Button
                v-tooltip.bottom="'复制配置'"
                aria-label="复制配置"
                class="custom-factor-dialog__icon-button custom-factor-dialog__icon-button--neutral"
                :disabled="!selectedGroupIdLocal"
                @click="duplicateGroup"
              >
                <FileSpreadsheet :size="16" />
              </Button>
              <Button
                v-tooltip.bottom="'删除配置'"
                aria-label="删除配置"
                class="custom-factor-dialog__icon-button custom-factor-dialog__icon-button--danger"
                :disabled="!selectedGroupIdLocal"
                @click="openDeleteGroupDialog"
              >
                <Trash2 :size="16" />
              </Button>
              <Button
                v-tooltip.bottom="'导入配置'"
                aria-label="导入配置"
                class="custom-factor-dialog__icon-button custom-factor-dialog__icon-button--ghost"
                @click="triggerImportFile"
              >
                <Upload :size="16" />
              </Button>
              <input id="custom-factor-group-import-input" type="file" accept=".json" class="hidden" @change="importGroupsFromFile" />
              <Button
                v-tooltip.bottom="'导出配置'"
                aria-label="导出配置"
                class="custom-factor-dialog__icon-button custom-factor-dialog__icon-button--ghost"
                @click="exportGroupsToFile"
              >
                <Download :size="16" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div v-if="errorMessage" class="custom-factor-dialog__error">
        {{ errorMessage }}
      </div>

      <section class="custom-factor-dialog__content">
        <aside class="custom-factor-dialog__imports">
          <div class="custom-factor-dialog__pane-head">
            <div>
              <div class="custom-factor-dialog__section-kicker">新增因子</div>
              <h3 class="custom-factor-dialog__pane-title">导入方式</h3>
            </div>
          </div>

          <div class="custom-factor-dialog__mode-switch">
            <button
              type="button"
              class="custom-factor-dialog__mode-button"
              :class="{ 'custom-factor-dialog__mode-button--active': currentMode === 'batch' }"
              @click="currentMode = 'batch'"
            >
              批量新增
            </button>
            <button
              type="button"
              class="custom-factor-dialog__mode-button"
              :class="{ 'custom-factor-dialog__mode-button--active': currentMode === 'excel' }"
              @click="currentMode = 'excel'"
            >
              Excel 智能导入
            </button>
          </div>

          <div v-if="currentMode === 'batch'" class="space-y-3">
            <div
              v-for="field in CUSTOM_FACTOR_FIELDS"
              :key="field"
              class="custom-factor-dialog__draft-field"
            >
              <div class="custom-factor-dialog__draft-head">
                <label class="custom-factor-dialog__label">
                  {{
                    field === 'factorKey'
                      ? '因子编码'
                      : field === 'factorName'
                        ? '因子名称'
                        : field === 'materialType'
                          ? '物料类型'
                          : field === 'processName'
                            ? '工序'
                            : 'R2 名称'
                  }}
                </label>
                <button
                  type="button"
                  class="custom-factor-dialog__lock-button"
                  :class="{ 'custom-factor-dialog__lock-button--active': batchDraft[field].locked }"
                  @click="batchDraft[field].locked = !batchDraft[field].locked"
                >
                  <component :is="batchDraft[field].locked ? Lock : LockOpen" :size="14" />
                  {{ batchDraft[field].locked ? '锁定' : '多行' }}
                </button>
              </div>
              <Textarea
                v-model="batchDraft[field].value"
                rows="3"
                class="w-full"
                :placeholder="batchDraft[field].locked ? '输入 1 行固定值' : '支持输入多行数据'"
              />
              <p class="custom-factor-dialog__hint">当前有效行数：{{ batchFieldStats[field] }}</p>
            </div>

            <Button
              label="导入到当前配置组"
              class="!bg-blue-600 !border-blue-600"
              :disabled="!canBatchImport || !selectedGroupIdLocal"
              @click="importBatchFactors"
            />
          </div>

          <div v-else class="space-y-3">
            <label
              class="custom-factor-dialog__upload-box"
              :class="{ 'custom-factor-dialog__upload-box--dragging': isExcelUploadDragging }"
              @dragenter="handleExcelDragEnter"
              @dragover="handleExcelDragOver"
              @dragleave="handleExcelDragLeave"
              @drop="handleExcelDrop"
            >
              <FileSpreadsheet :size="18" class="text-blue-600" />
              <div>
                <strong>{{ selectedExcelFileName || '上传 CSV / Excel 文件' }}</strong>
                <p class="custom-factor-dialog__hint">支持拖拽或点击上传 `.csv`、`.xls`、`.xlsx`，默认读取首个工作表</p>
              </div>
              <input type="file" accept=".csv,.xls,.xlsx" class="hidden" @change="handleExcelFileSelect" />
            </label>

            <div
              v-for="field in CUSTOM_FACTOR_FIELDS"
              :key="`mapping-${field}`"
              class="custom-factor-dialog__mapping-field"
            >
              <label class="custom-factor-dialog__label">
                {{
                  field === 'factorKey'
                    ? '因子编码列'
                    : field === 'factorName'
                      ? '因子名称列'
                      : field === 'materialType'
                        ? '物料类型列'
                        : field === 'processName'
                          ? '工序列'
                          : 'R2 名称列'
                }}
              </label>
              <Select
                v-model="excelMapping[field]"
                :options="columnOptions"
                option-label="name"
                option-value="value"
                placeholder="请选择列"
                class="w-full"
              />
            </div>

            <Button
              label="按映射导入"
              class="!bg-blue-600 !border-blue-600"
              :disabled="!canExcelImport || !selectedGroupIdLocal"
              @click="importExcelFactors"
            />
          </div>
        </aside>

        <section class="custom-factor-dialog__grid">
          <div class="custom-factor-dialog__grid-head">
            <div>
              <div class="custom-factor-dialog__section-kicker">因子列表</div>
              <h3 class="custom-factor-dialog__pane-title">当前因子</h3>
              <p class="custom-factor-dialog__hint">支持直接修改、批量删除，并在确认后保存到当前配置组。</p>
            </div>
            <div class="custom-factor-dialog__grid-actions">
              <div class="custom-factor-dialog__grid-meta">
                已选 {{ selectedRowCount }} 行
              </div>
              <Button label="删除选中" severity="danger" outlined :disabled="!canDeleteSelectedRows" @click="deleteSelectedRows">
                <template #icon>
                  <Trash2 :size="14" />
                </template>
              </Button>
              <Button label="保存" class="!bg-blue-600 !border-blue-600" :disabled="!canSave" @click="saveCurrentGroup" />
            </div>
          </div>

          <div class="custom-factor-dialog__grid-shell">
            <AgGridVue
              class="h-full w-full"
              :theme="myTheme"
              :row-data="editingFactors"
              :column-defs="columnDefs"
              :default-col-def="gridDefaultColDef"
              :row-selection="gridRowSelection"
              :components="{ AgGridCommunitySetFilter }"
              :animate-rows="false"
              :row-height="38"
              :header-height="42"
              :tooltip-show-delay="200"
              :single-click-edit="true"
              :suppress-cell-focus="false"
              :enable-cell-text-selection="true"
              :ensure-dom-order="true"
              :stop-editing-when-cells-lose-focus="true"
              :get-row-id="(params) => params.data.uid"
              @grid-ready="handleGridReady"
              @selection-changed="handleSelectionChanged"
              @cell-value-changed="handleCellValueChanged"
            />
          </div>
        </section>
      </section>
    </div>

    <Dialog
      :visible="createGroupDialogVisible"
      modal
      header="创建配置组"
      :style="{ width: '420px' }"
      :append-to="overlayAppendTo"
      @update:visible="createGroupDialogVisible = $event"
    >
      <div class="custom-factor-dialog__subdialog-body">
        <label class="custom-factor-dialog__label">配置组名称</label>
        <InputText v-model="pendingGroupName" class="w-full" placeholder="例如：PACK 补充因子组" />
        <p class="custom-factor-dialog__hint">创建后会作为全局共享配置组保存到本地。</p>
      </div>
      <template #footer>
        <Button label="取消" severity="secondary" outlined @click="createGroupDialogVisible = false" />
        <Button label="创建" class="!bg-blue-600 !border-blue-600" :disabled="!pendingGroupName.trim()" @click="createGroup" />
      </template>
    </Dialog>

    <Dialog
      :visible="deleteGroupDialogVisible"
      modal
      header="删除配置组"
      :style="{ width: '420px' }"
      :append-to="overlayAppendTo"
      @update:visible="deleteGroupDialogVisible = $event"
    >
      <div class="custom-factor-dialog__subdialog-body">
        <p class="custom-factor-dialog__danger-title">确定删除当前配置组吗？</p>
        <p class="custom-factor-dialog__hint">
          将删除 <strong>{{ selectedGroup?.name || '当前配置组' }}</strong> 及其全部因子内容，这个操作不可恢复。
        </p>
      </div>
      <template #footer>
        <Button label="取消" severity="secondary" outlined @click="deleteGroupDialogVisible = false" />
        <Button label="确认删除" severity="danger" @click="removeGroup" />
      </template>
    </Dialog>
  </Dialog>
</template>

<style scoped>
.custom-factor-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.custom-factor-dialog__toolbar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 22px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 38%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.custom-factor-dialog__group-select {
  min-width: min(100%, 640px);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-factor-dialog__group-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.custom-factor-dialog__toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.custom-factor-dialog__toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.custom-factor-dialog__content {
  display: grid;
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
  gap: 16px;
  min-height: 560px;
}

.custom-factor-dialog__imports,
.custom-factor-dialog__grid {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  box-shadow:
    0 14px 32px rgba(15, 23, 42, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.custom-factor-dialog__imports {
  padding: 18px;
}

.custom-factor-dialog__grid {
  display: flex;
  flex-direction: column;
  padding: 18px;
}

.custom-factor-dialog__grid-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.custom-factor-dialog__grid-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-factor-dialog__grid-meta {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.92);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.custom-factor-dialog__grid-shell {
  flex: 1;
  min-height: 440px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
}

.custom-factor-dialog__mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.custom-factor-dialog__mode-button {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
  color: #475569;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.18s ease;
}

.custom-factor-dialog__mode-button--active {
  border-color: rgba(37, 99, 235, 0.3);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(219, 234, 254, 0.96));
  color: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.12);
}

.custom-factor-dialog__draft-field,
.custom-factor-dialog__mapping-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-factor-dialog__draft-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.custom-factor-dialog__label {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.custom-factor-dialog__lock-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #64748b;
  padding: 4px 10px;
  font-size: 11px;
  transition: all 0.18s ease;
}

.custom-factor-dialog__lock-button--active {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.custom-factor-dialog__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.custom-factor-dialog__upload-box {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 16px;
  border: 1px dashed rgba(96, 165, 250, 0.7);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(248, 251, 255, 1), rgba(255, 255, 255, 0.98));
  transition: all 0.18s ease;
}

.custom-factor-dialog__upload-box--dragging {
  border-color: rgba(37, 99, 235, 0.82);
  background:
    linear-gradient(135deg, rgba(239, 246, 255, 1), rgba(219, 234, 254, 0.78));
  box-shadow: 0 12px 30px rgba(37, 99, 235, 0.12);
}

.custom-factor-dialog__upload-box strong {
  display: block;
  color: #0f172a;
  font-size: 13px;
}

.custom-factor-dialog__error {
  border: 1px solid #fecdd3;
  border-radius: 18px;
  background: #fff1f2;
  color: #be123c;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
}

.custom-factor-dialog__section-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.custom-factor-dialog__section-title {
  margin: 0;
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}

.custom-factor-dialog__pane-head {
  margin-bottom: 14px;
}

.custom-factor-dialog__pane-title {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 18px;
  font-weight: 800;
}

.custom-factor-dialog__select {
  min-width: min(100%, 320px);
  flex: 1 1 260px;
}

.custom-factor-dialog__icon-button {
  width: 38px;
  min-width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.92);
  color: #334155;
  transition: all 0.18s ease;
}

.custom-factor-dialog__icon-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.custom-factor-dialog__icon-button:disabled {
  opacity: 0.5;
  box-shadow: none;
}

.custom-factor-dialog__icon-button--primary {
  border-color: rgba(37, 99, 235, 0.22);
  background: linear-gradient(180deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
}

.custom-factor-dialog__icon-button--neutral {
  border-color: rgba(148, 163, 184, 0.28);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
}

.custom-factor-dialog__icon-button--danger {
  border-color: rgba(251, 113, 133, 0.26);
  background: linear-gradient(180deg, rgba(255, 241, 242, 1), rgba(255, 228, 230, 0.96));
  color: #be123c;
}

.custom-factor-dialog__icon-button--ghost {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(248, 250, 252, 0.9);
}

.custom-factor-dialog__subdialog-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.custom-factor-dialog__danger-title {
  margin: 0;
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}

.custom-factor-dialog__select :deep(.p-select-label) {
  font-size: 13px;
}

.custom-factor-dialog__grid-shell :deep(.ag-root-wrapper) {
  border: none;
  border-radius: 0;
}

.custom-factor-dialog__grid-shell :deep(.ag-header) {
  border-bottom-color: rgba(24, 29, 31, 0.12);
}

.custom-factor-dialog__grid-shell :deep(.ag-header-cell-label) {
  font-weight: 700;
}

.custom-factor-dialog__grid-shell :deep(.ag-cell) {
  border-color: rgba(226, 232, 240, 0.72);
}

.custom-factor-dialog__grid-shell :deep(.ag-cell),
.custom-factor-dialog__grid-shell :deep(.ag-cell-value) {
  user-select: text;
}

.custom-factor-dialog__grid-shell :deep(.ag-floating-filter) {
  background: rgba(248, 250, 252, 0.88);
}

.custom-factor-dialog__grid-shell :deep(.ag-ltr .ag-cell-focus:not(.ag-cell-range-selected):focus-within) {
  border: 1px solid rgba(37, 99, 235, 0.55);
}
</style>
