<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StructuredPreview } from './previewSerialization'
import { stringifyStructuredPreview } from './previewSerialization'

const props = defineProps<{
  preview: StructuredPreview
  textMaxLength?: number
  prefix?: string
  allowTextToggle?: boolean
}>()

const showTextPreview = ref(false)

const testPrefix = computed(() => props.prefix ?? 'data-preview')
const previewText = computed(() =>
  showTextPreview.value
    ? stringifyStructuredPreview(props.preview, props.textMaxLength)
    : '',
)

const hasTableRows = computed(() => props.preview.rows.length > 0)
const hasGroupRows = computed(() => props.preview.groups.length > 0)
const hasEntries = computed(() => props.preview.entries.length > 0)
const visibleSampleRows = computed(() => props.preview.rows.slice(0, 3))
const visibleGroupRows = computed(() =>
  props.preview.groups.flatMap((group) =>
    group.rows.slice(0, 3).map((row, index) => ({
      key: `${group.name}-${index}`,
      title: group.name,
      row,
    })),
  ).slice(0, 3),
)
const hasSampleOverflow = computed(() => {
  if (props.preview.summary.omittedRowCount && props.preview.summary.omittedRowCount > 0) return true
  if (props.preview.summary.omittedGroupCount && props.preview.summary.omittedGroupCount > 0) return true
  return false
})
const visibleKeyColumns = computed(() => props.preview.columns.slice(0, 12))
const hasKeyColumns = computed(() => visibleKeyColumns.value.length > 0)
const sampleCountLabel = computed(() => {
  if (hasTableRows.value) return `${visibleSampleRows.value.length} 条`
  if (hasGroupRows.value) return `${visibleGroupRows.value.length} 条`
  return '0 条'
})
</script>

<template>
  <div class="structured-preview">
    <div
      v-if="hasTableRows || hasGroupRows"
      class="structured-preview__top-grid"
    >
      <div
        :data-test="`${testPrefix}-summary`"
        class="structured-preview__hero"
      >
        <div class="structured-preview__hero-label">Preview</div>
        <div class="structured-preview__hero-title">{{ preview.summary.label }}</div>
        <div class="structured-preview__hero-description">{{ preview.summary.description }}</div>
        <div class="structured-preview__stats structured-preview__stats--hero">
          <span v-if="preview.summary.rowCount !== undefined" class="structured-preview__stat structured-preview__stat--dark">
            {{ preview.summary.rowCount }} 行
          </span>
          <span v-if="preview.summary.columnCount !== undefined" class="structured-preview__stat structured-preview__stat--primary">
            {{ preview.summary.columnCount }} 列
          </span>
          <span v-if="preview.summary.groupCount !== undefined" class="structured-preview__stat structured-preview__stat--dark">
            {{ preview.summary.groupCount }} 组
          </span>
          <span
            v-if="preview.summary.omittedColumnCount"
            :data-test="`${testPrefix}-omitted-columns`"
            class="structured-preview__stat structured-preview__stat--dark"
          >
            已省略 {{ preview.summary.omittedColumnCount }} 列
          </span>
        </div>
      </div>

      <div v-if="hasKeyColumns" class="structured-preview__keys-card">
        <div class="structured-preview__panel-label">Keys</div>
        <div class="structured-preview__keys-scroll custom-scrollbar">
          <span
            v-for="column in visibleKeyColumns"
            :key="column"
            class="structured-preview__key-pill"
          >
            {{ column }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-else
      :data-test="`${testPrefix}-summary`"
      class="structured-preview__summary"
    >
      <div class="structured-preview__label">{{ preview.summary.label }}</div>
      <div class="structured-preview__description">{{ preview.summary.description }}</div>
    </div>

    <div
      v-if="preview.summary.omittedRowCount && !hasTableRows"
      :data-test="`${testPrefix}-omitted-rows`"
      class="structured-preview__note"
    >
      已省略 {{ preview.summary.omittedRowCount }} 行样本
    </div>
    <div
      v-if="preview.summary.omittedGroupCount && !hasGroupRows"
      :data-test="`${testPrefix}-omitted-groups`"
      class="structured-preview__note"
    >
      已省略 {{ preview.summary.omittedGroupCount }} 个分组
    </div>

    <div v-if="hasTableRows" class="structured-preview__section structured-preview__samples-card">
      <div class="structured-preview__samples-head">
        <div class="structured-preview__panel-label">样本记录</div>
        <div class="structured-preview__samples-meta">当前展示 {{ sampleCountLabel }}</div>
      </div>
      <div class="structured-preview__sample-stack">
        <div
          v-for="(row, rowIndex) in visibleSampleRows"
          :key="rowIndex"
          class="structured-preview__sample-card"
        >
          <div
            v-for="column in preview.columns"
            :key="column"
            class="structured-preview__sample-line"
          >
            <span class="structured-preview__cell-key">{{ column }}</span>
            <span class="structured-preview__cell-value">{{ row[column] }}</span>
          </div>
        </div>
      </div>
      <div v-if="hasSampleOverflow" class="structured-preview__samples-footer">最多展示3条，其余已省略</div>
    </div>

    <div v-else-if="hasGroupRows" class="structured-preview__section structured-preview__samples-card">
      <div class="structured-preview__samples-head">
        <div class="structured-preview__panel-label">样本记录</div>
        <div class="structured-preview__samples-meta">当前展示 {{ sampleCountLabel }}</div>
      </div>
      <div class="structured-preview__sample-stack">
        <div
          v-for="item in visibleGroupRows"
          :key="item.key"
          class="structured-preview__sample-card"
        >
          <div class="structured-preview__sample-title">{{ item.title }}</div>
          <div
            v-for="(value, key) in item.row"
            :key="key"
            class="structured-preview__sample-line"
          >
            <span class="structured-preview__cell-key">{{ key }}</span>
            <span class="structured-preview__cell-value">{{ value }}</span>
          </div>
        </div>
      </div>
      <div v-if="hasSampleOverflow" class="structured-preview__samples-footer">最多展示3条，其余已省略</div>
    </div>

    <div v-else-if="hasEntries" class="structured-preview__section structured-preview__entries">
      <div
        v-for="entry in preview.entries"
        :key="entry.key"
        class="structured-preview__entry"
      >
        <span class="structured-preview__entry-key">{{ entry.key }}</span>
        <span class="structured-preview__entry-value">{{ entry.value }}</span>
      </div>
    </div>

    <div
      v-for="note in preview.notes"
      :key="note"
      class="structured-preview__note"
    >
      {{ note }}
    </div>

    <div
      v-if="allowTextToggle"
      class="structured-preview__toolbar"
    >
      <button
        :data-test="`${testPrefix}-toggle-text`"
        class="structured-preview__toggle"
        type="button"
        @click="showTextPreview = !showTextPreview"
      >
        {{ showTextPreview ? '收起文本预览' : '查看文本预览' }}
      </button>
    </div>

    <div
      v-if="showTextPreview"
      :data-test="`${testPrefix}-text`"
      class="structured-preview__text"
    >
      <pre>{{ previewText }}</pre>
    </div>
  </div>
</template>

<style scoped>
.structured-preview {
  --preview-bg: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  --preview-card: rgba(255, 255, 255, 0.94);
  --preview-border: #dbe4ee;
  --preview-text: #0f172a;
  --preview-muted: #64748b;
  --preview-primary: #2563eb;
  --preview-primary-soft: #eff6ff;
  --preview-dark: #0f172a;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.structured-preview__summary {
  padding: 0.95rem;
  border-radius: 1rem;
  border: 1px solid var(--preview-border);
  background: var(--preview-card);
  box-shadow: 0 14px 28px rgba(148, 163, 184, 0.12);
}

.structured-preview__label {
  font-size: 11px;
  font-weight: 800;
  color: var(--preview-text);
}

.structured-preview__description {
  margin-top: 0.25rem;
  font-size: 11px;
  line-height: 1.5;
  color: #475569;
}

.structured-preview__top-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(7rem, 0.8fr);
  gap: 0.65rem;
}

.structured-preview__hero {
  min-height: 7.9rem;
  padding: 0.9rem 1rem;
  border-radius: 1.15rem;
  background: linear-gradient(160deg, #0f172a 0%, #172554 100%);
  color: white;
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.structured-preview__hero-label,
.structured-preview__panel-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.structured-preview__hero-label {
  color: #93c5fd;
}

.structured-preview__hero-title {
  margin-top: 0.35rem;
  font-size: 1.2rem;
  font-weight: 800;
  color: white;
}

.structured-preview__hero-description {
  margin-top: 0.3rem;
  font-size: 11px;
  line-height: 1.55;
  color: #cbd5e1;
}

.structured-preview__keys-card,
.structured-preview__samples-card {
  border: 1px solid var(--preview-border);
  background: var(--preview-card);
  border-radius: 1.1rem;
  box-shadow: 0 12px 24px rgba(148, 163, 184, 0.1);
}

.structured-preview__keys-card {
  min-height: 7.9rem;
  padding: 0.78rem 0.78rem 0.72rem;
  display: flex;
  flex-direction: column;
}

.structured-preview__panel-label {
  color: var(--preview-muted);
}

.structured-preview__keys-scroll {
  margin-top: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 5.75rem;
  overflow: auto;
  padding-right: 0.2rem;
}

.structured-preview__key-pill {
  padding: 0.45rem 0.65rem;
  border-radius: 0.7rem;
  background: #f8fafc;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
}

.structured-preview__key-pill:first-child {
  background: var(--preview-primary-soft);
  color: #1d4ed8;
}

.structured-preview__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.structured-preview__stat {
  padding: 0.26rem 0.52rem;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.structured-preview__stats--hero {
  margin-top: 0.75rem;
}

.structured-preview__stat--primary {
  background: var(--preview-primary);
  color: white;
}

.structured-preview__stat--dark {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.structured-preview__section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.structured-preview__samples-card {
  padding: 0.82rem;
  background: var(--preview-card);
}

.structured-preview__samples-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.structured-preview__samples-meta {
  color: var(--preview-muted);
  font-size: 11px;
  font-weight: 600;
}

.structured-preview__sample-stack {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.15rem;
}

.structured-preview__sample-card,
.structured-preview__entry {
  border-radius: 0.95rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 0.78rem 0.8rem;
}

.structured-preview__sample-title {
  margin-bottom: 0.45rem;
  font-size: 11px;
  font-weight: 800;
  color: var(--preview-text);
}

.structured-preview__sample-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.16rem 0;
  border-bottom: 1px dashed rgba(203, 213, 225, 0.75);
}

.structured-preview__sample-line:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.structured-preview__group-title,
.structured-preview__entry-key,
.structured-preview__cell-key {
  display: block;
  font-size: 10px;
  font-weight: 800;
  color: #64748b;
}

.structured-preview__cell-value,
.structured-preview__entry-value {
  font-size: 11px;
  line-height: 1.45;
  color: var(--preview-text);
  word-break: break-all;
  text-align: right;
  font-weight: 700;
}

.structured-preview__entries {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.structured-preview__note {
  font-size: 10px;
  line-height: 1.4;
  color: #64748b;
}

.structured-preview__note--warning {
  color: #b45309;
}

.structured-preview__samples-footer {
  margin-top: 0.15rem;
  padding-top: 0.62rem;
  border-top: 1px dashed #d7e0ea;
  color: var(--preview-muted);
  font-size: 11px;
}

.structured-preview__toolbar {
  display: flex;
  justify-content: flex-end;
}

.structured-preview__toggle {
  border: none;
  background: transparent;
  color: var(--preview-primary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
}

.structured-preview__text {
  overflow: auto;
  border-radius: 0.875rem;
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.875rem;
}

.structured-preview__text pre {
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
  line-height: 1.5;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}
</style>
