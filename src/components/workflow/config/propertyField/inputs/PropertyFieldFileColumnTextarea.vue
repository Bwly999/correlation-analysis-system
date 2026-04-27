<script setup lang="ts">
import { computed, defineAsyncComponent, shallowRef } from 'vue'
import { FileUp } from 'lucide-vue-next'
import Button from 'primevue/button'
import type { NodeProperty } from '@/nodes/types'
import FileColumnTextImportDialog from './FileColumnTextImportDialog.vue'

const MonacoEditor = defineAsyncComponent(() => import('../../../MonacoEditor.vue'))

const props = defineProps<{
  modelValue: unknown
  prop: NodeProperty
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isImportVisible = shallowRef(false)

const importConfig = computed(() => props.prop.textareaImport)
const valueLabel = computed(() => importConfig.value?.valueLabel || props.prop.displayName || '文本')

const textValue = computed({
  get: () => (typeof props.modelValue === 'string' ? props.modelValue : ''),
  set: (value) => emit('update:modelValue', value),
})

const lineCount = computed(() => {
  if (!textValue.value) return 0
  return textValue.value.split(/\r\n|\r|\n/).length
})

const applyImportedValues = (values: string[]) => {
  textValue.value = values.join('\n')
}
</script>

<template>
  <div class="sn-textarea" data-testid="file-column-textarea-import">
    <div class="sn-textarea__toolbar">
      <div class="sn-textarea__meta">
        <span>{{ lineCount }} 行</span>
      </div>
      <div class="sn-textarea__actions">
        <Button
          severity="secondary"
          outlined
          size="small"
          class="sn-textarea__button"
          @click="isImportVisible = true"
        >
          <FileUp :size="14" />
          从文件导入
        </Button>
      </div>
    </div>

    <div
      class="sn-textarea__monaco"
      data-testid="file-column-textarea-monaco"
    >
      <MonacoEditor
        v-model="textValue"
        language="plaintext"
        height="280px"
      />
    </div>

    <FileColumnTextImportDialog
      v-model:visible="isImportVisible"
      :value-label="valueLabel"
      :default-deduplicate="importConfig?.defaultDeduplicate !== false"
      @confirm="applyImportedValues"
    />
  </div>
</template>

<style scoped>
.sn-textarea {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sn-textarea__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sn-textarea__meta,
.sn-textarea__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.sn-textarea__meta span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.sn-textarea__button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
}

.sn-textarea__monaco {
  min-height: 280px;
}
</style>
