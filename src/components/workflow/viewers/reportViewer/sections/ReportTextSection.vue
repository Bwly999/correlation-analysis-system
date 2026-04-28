<script setup lang="ts">
import { computed } from 'vue'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import ReportSectionHelpButton from '../ReportSectionHelpButton.vue'
import type { ReportTextSection } from '../reportTypes'

const props = defineProps<{
  section: ReportTextSection
}>()

type JsonTableMode = 'rows' | 'entries'
type JsonTableRow = Record<string, string>

interface JsonTablePreview {
  mode: JsonTableMode
  columns: string[]
  rows: JsonTableRow[]
}

const MAX_CELL_LENGTH = 120
const MAX_COLUMNS = 24

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const truncateText = (value: string, maxLength = MAX_CELL_LENGTH) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value

const resolveValueType = (value: unknown) => {
  if (value === null) return '空值'
  if (Array.isArray(value)) return '数组'
  if (isPlainObject(value)) return '对象'
  if (typeof value === 'number') return '数值'
  if (typeof value === 'boolean') return '布尔'
  if (typeof value === 'string') return '文本'
  if (value === undefined) return '未定义'
  return '其他'
}

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return truncateText(value)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) return `数组（${value.length} 项）`
  if (isPlainObject(value)) return `对象（${Object.keys(value).length} 项）`
  return truncateText(String(value))
}

const parseJsonContent = (content?: string) => {
  if (typeof content !== 'string') return null
  const trimmed = content.trim()
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) return null

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

const createRowsPreview = (items: Array<Record<string, unknown>>): JsonTablePreview => {
  const columnSet = new Set<string>()
  for (const item of items) {
    Object.keys(item).forEach((key) => {
      if (columnSet.size < MAX_COLUMNS || columnSet.has(key)) columnSet.add(key)
    })
  }

  const columns = [...columnSet]
  return {
    mode: 'rows',
    columns,
    rows: items.map((item) =>
      Object.fromEntries(columns.map((column) => [column, formatCellValue(item[column])])),
    ),
  }
}

const createEntriesPreview = (value: Record<string, unknown>): JsonTablePreview => ({
  mode: 'entries',
  columns: ['字段', '类型', '值'],
  rows: Object.entries(value).map(([key, entryValue]) => ({
    字段: key,
    类型: resolveValueType(entryValue),
    值: formatCellValue(entryValue),
  })),
})

const jsonTablePreview = computed<JsonTablePreview | null>(() => {
  const parsed = parseJsonContent(props.section.content)

  if (Array.isArray(parsed)) {
    const objectRows = parsed.filter((item): item is Record<string, unknown> => isPlainObject(item))
    if (objectRows.length === 0 || objectRows.length !== parsed.length) return null
    return createRowsPreview(objectRows)
  }

  if (isPlainObject(parsed)) return createEntriesPreview(parsed)

  return null
})

const shouldRenderJsonTable = computed(
  () => Boolean(jsonTablePreview.value) && (jsonTablePreview.value?.rows.length ?? 0) > 0,
)
</script>

<template>
  <section class="space-y-2">
    <div v-if="section.title" class="flex items-center gap-2">
      <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
      <ReportSectionHelpButton
        :help="section.help"
        :section-key="String(section.key || 'text')"
        :title="section.title"
      />
    </div>
    <div v-if="shouldRenderJsonTable && jsonTablePreview" class="report-json-table-shell">
      <DataTable
        :value="jsonTablePreview.rows"
        data-test="report-json-table"
        scrollable
        scroll-height="360px"
        removable-sort
        show-gridlines
        striped-rows
        class="report-json-table"
        :table-style="`min-width: ${Math.max(44, jsonTablePreview.columns.length * 10)}rem`"
      >
        <Column
          v-for="column in jsonTablePreview.columns"
          :key="column"
          :field="column"
          :header="column"
          sortable
        >
          <template #body="{ data }: { data: JsonTableRow }">
            <span class="report-json-table__cell" :title="data[column]">
              {{ data[column] }}
            </span>
          </template>
        </Column>
      </DataTable>
    </div>
    <p v-else class="text-sm leading-relaxed whitespace-pre-wrap text-slate-600">{{ section.content }}</p>
  </section>
</template>

<style scoped>
.report-json-table-shell {
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.report-json-table:deep(.p-datatable-table) {
  font-size: 0.8125rem;
}

.report-json-table:deep(.p-datatable-thead > tr > th) {
  background: #f8fafc;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.7rem 0.85rem;
}

.report-json-table:deep(.p-datatable-tbody > tr > td) {
  border-color: #edf2f7;
  color: #334155;
  padding: 0.65rem 0.85rem;
  vertical-align: top;
}

.report-json-table:deep(.p-datatable-tbody > tr:hover) {
  background: #f8fafc;
}

.report-json-table__cell {
  display: inline-block;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: top;
  white-space: nowrap;
}
</style>
