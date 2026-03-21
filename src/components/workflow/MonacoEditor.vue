<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { VueMonacoEditor, loader } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'

// 配置本地异步加载，不走 CDN
loader.config({ monaco })

const _props = defineProps<{
  modelValue: string
  language?: string
  height?: string
  readOnly?: boolean
  declarations?: string
}>()

const emit = defineEmits(['update:modelValue', 'change'])

const editorRef = ref<any>(null)
let declarationDisposable: monaco.IDisposable | null = null
type MonacoLanguageServiceDefaults = {
  addExtraLib: (content: string, filePath?: string) => monaco.IDisposable
}
const javascriptDefaults = (
  monaco.languages as typeof monaco.languages & {
    typescript: {
      javascriptDefaults: MonacoLanguageServiceDefaults
    }
  }
).typescript.javascriptDefaults

const MONACO_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  formatOnPaste: true,
  formatOnType: true,
  scrollBeyondLastLine: false,
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  minimap: { enabled: false },
  fontSize: 12,
  fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
  lineHeight: 18,
  padding: { top: 8, bottom: 8 },
  renderLineHighlight: 'all',
  theme: 'vs',
  readOnly: _props.readOnly || false,
  editContext: false,
  folding: true,
  tabSize: 2,
  wordWrap: 'on',
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
}

const handleMount = (editor: any) => {
  editorRef.value = editor
}

const onChange = (value: string | undefined) => {
  emit('update:modelValue', value || '')
  emit('change', value || '')
}

const syncDeclarations = (declarations?: string) => {
  declarationDisposable?.dispose()
  declarationDisposable = null

  if (!declarations?.trim()) {
    return
  }

  declarationDisposable = javascriptDefaults.addExtraLib(
    declarations,
    `ts:js-transform-${btoa(unescape(encodeURIComponent(declarations))).replace(/=+$/g, '')}.d.ts`,
  )
}

watch(
  () => _props.declarations,
  (nextDeclarations) => {
    syncDeclarations(nextDeclarations)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  declarationDisposable?.dispose()
})
</script>

<template>
  <div
    class="monaco-wrapper border border-slate-200 rounded-xl overflow-hidden bg-white shadow-inner"
    :style="{ height: height || '300px' }"
  >
    <VueMonacoEditor
      :value="modelValue"
      :language="language || 'json'"
      :options="MONACO_OPTIONS"
      @mount="handleMount"
      @change="onChange"
    >
      <template #default>
        <div
          class="flex items-center justify-center h-full text-slate-400 gap-3 text-xs bg-slate-50"
        >
          <div
            class="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"
          ></div>
          正在加载本地分析算子编辑器...
        </div>
      </template>
    </VueMonacoEditor>
  </div>
</template>

<style scoped>
.monaco-wrapper {
  position: relative;
}
:deep(.monaco-editor) {
  --vscode-editor-background: transparent !important;
  --vscode-editorGutter-background: transparent !important;
}
</style>
