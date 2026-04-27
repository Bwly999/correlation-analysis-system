<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { FileSpreadsheet, ListChecks, Upload } from 'lucide-vue-next'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import VirtualScroller from 'primevue/virtualscroller'
import {
  extractTextColumnValues,
  parseTabularTextFile,
  type ParsedTabularTextFile,
  type TextColumnExtractionResult,
} from './fileColumnTextImport'

const props = defineProps<{
  visible: boolean
  valueLabel: string
  defaultDeduplicate?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [values: string[]]
}>()

const parsedFile = shallowRef<ParsedTabularTextFile | null>(null)
const selectedColumn = shallowRef('')
const selectedFileName = shallowRef('')
const errorMessage = shallowRef('')
const isParsing = shallowRef(false)
const deduplicate = shallowRef(props.defaultDeduplicate !== false)

const columnOptions = computed(() =>
  (parsedFile.value?.columns || []).map((column) => ({
    name: column,
    value: column,
  })),
)

const extraction = computed<TextColumnExtractionResult | null>(() => {
  if (!parsedFile.value || !selectedColumn.value) return null
  return extractTextColumnValues(parsedFile.value.rows, selectedColumn.value, {
    deduplicate: deduplicate.value,
  })
})

const stats = computed(() => extraction.value?.stats ?? null)
const previewValues = computed(() => extraction.value?.values ?? [])
const canConfirm = computed(() => previewValues.value.length > 0)
const showPreview = computed(() => canConfirm.value)

const close = () => {
  emit('update:visible', false)
}

const resetForFile = () => {
  parsedFile.value = null
  selectedColumn.value = ''
  selectedFileName.value = ''
  errorMessage.value = ''
}

const parseFile = async (file: File) => {
  resetForFile()
  selectedFileName.value = file.name
  isParsing.value = true

  try {
    parsedFile.value = await parseTabularTextFile(file)
    selectedColumn.value = parsedFile.value.columns[0] || ''
    if (parsedFile.value.columns.length === 0) {
      errorMessage.value = '文件中未识别到可选列'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件解析失败'
  } finally {
    isParsing.value = false
  }
}

const onFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) void parseFile(file)
  target.value = ''
}

const onFileDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files[0]
  if (file) void parseFile(file)
}

const confirm = () => {
  if (!canConfirm.value) return
  emit('confirm', previewValues.value)
  close()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="从文件导入 SN"
    :style="{ width: 'min(980px, calc(100vw - 32px))' }"
    @update:visible="(value) => emit('update:visible', value)"
  >
    <div class="sn-import-dialog">
      <section class="sn-import-dialog__main">
        <label
          class="sn-import-dialog__drop"
          @dragover.prevent
          @drop.prevent="onFileDrop"
        >
          <input
            class="hidden"
            type="file"
            accept=".csv,.xls,.xlsx"
            @change="onFileSelect"
          />
          <Upload :size="22" class="text-blue-600" />
          <div>
            <p class="sn-import-dialog__drop-title">
              {{ selectedFileName || '点击或拖拽上传 CSV / Excel 文件' }}
            </p>
            <p class="sn-import-dialog__hint">支持 .csv、.xls、.xlsx，默认读取 Excel 第一个工作表</p>
          </div>
        </label>

        <div v-if="errorMessage" class="sn-import-dialog__error">
          {{ errorMessage }}
        </div>

        <div class="sn-import-dialog__panel">
          <div class="sn-import-dialog__field">
            <label class="sn-import-dialog__label">选择 {{ valueLabel }} 列</label>
            <Select
              v-model="selectedColumn"
              :options="columnOptions"
              option-label="name"
              option-value="value"
              placeholder="请先上传文件"
              class="w-full"
              :disabled="columnOptions.length === 0 || isParsing"
            />
          </div>

          <div class="sn-import-dialog__switch-row">
            <div>
              <p class="sn-import-dialog__label">去重</p>
              <p class="sn-import-dialog__hint">默认开启；关闭后会保留文件中的重复 {{ valueLabel }}</p>
            </div>
            <ToggleSwitch v-model="deduplicate" />
          </div>

          <div v-if="stats" class="sn-import-dialog__stats">
            <div>
              <strong>{{ stats.rawRowCount }}</strong>
              <span>原始行数</span>
            </div>
            <div>
              <strong>{{ stats.emptyCount }}</strong>
              <span>空值</span>
            </div>
            <div>
              <strong>{{ stats.duplicateCount }}</strong>
              <span>重复</span>
            </div>
            <div>
              <strong>{{ stats.finalCount }}</strong>
              <span>最终 {{ valueLabel }}</span>
            </div>
          </div>

          <p class="sn-import-dialog__hint">选择列后会自动在右侧预览，确认无误后可直接回填。</p>
        </div>
      </section>

      <aside class="sn-import-dialog__preview">
        <div class="sn-import-dialog__preview-head">
          <component :is="showPreview ? FileSpreadsheet : ListChecks" :size="16" />
          {{ showPreview ? `${valueLabel} List 预览` : '等待预览' }}
        </div>
        <VirtualScroller
          v-if="showPreview"
          :items="previewValues"
          :item-size="34"
          class="sn-import-dialog__virtual"
        >
          <template #item="{ item, options }">
            <div class="sn-import-dialog__row">
              <span>{{ Number(options.index) + 1 }}</span>
              <strong>{{ item }}</strong>
            </div>
          </template>
        </VirtualScroller>
        <div
          v-else
          class="sn-import-dialog__placeholder"
          data-testid="sn-import-preview-placeholder"
        >
          <div class="sn-import-dialog__placeholder-icon">
            <ListChecks :size="26" />
          </div>
          <strong>选择列后可点击预览</strong>
          <p>预览会在这里展示最终回填的 {{ valueLabel }} List，并使用虚拟滚动避免大列表卡顿。</p>
          <span>如果你已经确认列选择正确，也可以不预览直接确认回填。</span>
        </div>
      </aside>
    </div>

    <template #footer>
      <Button label="取消" severity="secondary" outlined @click="close" />
      <Button
        label="确认并回填"
        :disabled="!canConfirm"
        class="!bg-blue-600 !border-blue-600"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.sn-import-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
}

.sn-import-dialog__main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.sn-import-dialog__drop {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 104px;
  padding: 18px;
  cursor: pointer;
  border: 2px dashed #bfdbfe;
  border-radius: 18px;
  background: linear-gradient(135deg, #f8fbff, #ffffff);
}

.sn-import-dialog__drop-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
}

.sn-import-dialog__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.sn-import-dialog__error {
  padding: 10px 12px;
  border: 1px solid #fecdd3;
  border-radius: 14px;
  background: #fff1f2;
  color: #be123c;
  font-size: 12px;
  font-weight: 700;
}

.sn-import-dialog__panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
}

.sn-import-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sn-import-dialog__label {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
}

.sn-import-dialog__switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sn-import-dialog__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.sn-import-dialog__stats div {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
}

.sn-import-dialog__stats strong,
.sn-import-dialog__stats span {
  display: block;
}

.sn-import-dialog__stats strong {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.2;
}

.sn-import-dialog__stats span {
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
}

.sn-import-dialog__preview-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.sn-import-dialog__preview {
  min-width: 0;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}

.sn-import-dialog__preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.sn-import-dialog__virtual {
  height: 380px;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #ffffff;
}

.sn-import-dialog__placeholder {
  display: flex;
  min-height: 380px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  border: 1px dashed #bfdbfe;
  border-radius: 14px;
  background:
    radial-gradient(circle at top, rgba(37, 99, 235, 0.08), transparent 36%),
    linear-gradient(180deg, #ffffff, #f8fbff);
  text-align: center;
}

.sn-import-dialog__placeholder-icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 18px;
  background: #eff6ff;
  color: #2563eb;
}

.sn-import-dialog__placeholder strong {
  color: #0f172a;
  font-size: 14px;
}

.sn-import-dialog__placeholder p,
.sn-import-dialog__placeholder span {
  max-width: 240px;
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.sn-import-dialog__row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 12px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 12px;
}

.sn-import-dialog__row span {
  width: 48px;
  color: #94a3b8;
  font-family: Consolas, monospace;
}

.sn-import-dialog__row strong {
  min-width: 0;
  overflow: hidden;
  color: #0f172a;
  font-family: Consolas, monospace;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .sn-import-dialog {
    grid-template-columns: 1fr;
  }

  .sn-import-dialog__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
