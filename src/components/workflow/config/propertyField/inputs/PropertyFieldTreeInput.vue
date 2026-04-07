<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, LoaderCircle, Search } from 'lucide-vue-next'
import InputText from 'primevue/inputtext'
import Tree from 'primevue/tree'
import type { TreeSelectionKeys } from 'primevue/tree'
import type { NodeProperty } from '@/nodes/types'

const props = defineProps<{
  modelValue: unknown
  prop: NodeProperty
  options: any[]
  isOptionsLoading: boolean
  optionsError: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const treeFilterQuery = ref('')
const treeExpandedKeys = ref<Record<string, boolean>>({})

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const filterTreeNodes = (nodes: any[], query: string): any[] => {
  if (!query.trim()) return nodes

  const normalizedQuery = query.trim().toLowerCase()

  return nodes
    .map((node) => {
      const searchText = String(node.data?.searchText || node.label || '').toLowerCase()
      const matchedChildren = filterTreeNodes(node.children || [], query)
      if (searchText.includes(normalizedQuery) || matchedChildren.length > 0) {
        return {
          ...node,
          children: matchedChildren,
        }
      }

      return null
    })
    .filter(Boolean)
}

const filteredTreeOptions = computed(() =>
  filterTreeNodes(props.options, treeFilterQuery.value),
)

const collectExpandedKeys = (nodes: any[]): Record<string, boolean> => {
  const expandedKeys: Record<string, boolean> = {}

  const traverse = (items: any[]) => {
    items.forEach((item) => {
      if (!item?.children?.length) return
      expandedKeys[String(item.key)] = true
      traverse(item.children)
    })
  }

  traverse(nodes)

  return expandedKeys
}

const expandAllNodes = () => {
  treeExpandedKeys.value = collectExpandedKeys(filteredTreeOptions.value)
}

const collapseAllNodes = () => {
  treeExpandedKeys.value = {}
}

const treeSelectionValue = computed<TreeSelectionKeys | undefined>({
  get: () => configValue.value as TreeSelectionKeys | undefined,
  set: (selectionKeys) => {
    if (!props.prop.singleSelect || !selectionKeys || typeof selectionKeys !== 'object') {
      configValue.value = selectionKeys
      return
    }

    const checkedEntries = Object.entries(selectionKeys).filter(([, state]) => state?.checked)
    if (checkedEntries.length <= 1) {
      configValue.value = selectionKeys
      return
    }

    const [selectedKey, selectedState] = checkedEntries[checkedEntries.length - 1] as [
      string,
      { checked?: boolean; partialChecked?: boolean },
    ]

    configValue.value = {
      [selectedKey]: {
        checked: selectedState.checked ?? true,
        partialChecked: false,
      },
    }
  },
})

watch(
  [treeFilterQuery, filteredTreeOptions],
  ([query, options]) => {
    if (!query.trim()) return
    treeExpandedKeys.value = collectExpandedKeys(options)
  },
  { deep: true },
)
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-0 shadow-sm overflow-hidden">
    <div v-if="prop.filterable" class="border-b border-slate-100 bg-slate-50/50 p-2">
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <Search
            :size="14"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <InputText
            v-model="treeFilterQuery"
            class="w-full !border-slate-200 !bg-white !rounded-lg !pl-9 !text-xs !h-9"
            :placeholder="prop.placeholder || '搜索...'"
          />
        </div>
        <button
          type="button"
          data-testid="tree-expand-all"
          class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
          title="完全展开"
          aria-label="完全展开"
          @click="expandAllNodes"
        >
          <ChevronDown :size="16" />
        </button>
        <button
          type="button"
          data-testid="tree-collapse-all"
          class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
          title="完全收起"
          aria-label="完全收起"
          @click="collapseAllNodes"
        >
          <ChevronUp :size="16" />
        </button>
      </div>
    </div>

    <div class="p-2">
      <div
        v-if="isOptionsLoading"
        class="flex items-center justify-center gap-2 py-8 text-xs text-slate-400"
      >
        <LoaderCircle :size="16" class="animate-spin text-blue-500" /> 加载中...
      </div>
      <div
        v-else-if="optionsError"
        class="rounded-lg border border-rose-100 bg-rose-50 p-4 text-xs text-rose-500 text-center"
      >
        {{ optionsError }}
      </div>
      <div
        v-else-if="filteredTreeOptions.length === 0"
        class="py-12 text-center text-xs text-slate-300 italic"
      >
        {{ prop.emptyMessage || '暂无数据' }}
      </div>
      <Tree
        v-else
        v-model:selection-keys="treeSelectionValue"
        v-model:expanded-keys="treeExpandedKeys"
        :value="filteredTreeOptions"
        selection-mode="checkbox"
        class="ndv-tree max-h-[360px] overflow-auto"
        :pt="{
          root: { class: 'p-0' },
          node: { class: 'p-0' },
          content: { class: 'p-1 hover:bg-blue-50/50 rounded-lg transition-colors' },
          label: { class: 'text-[12px] text-slate-600 font-medium' },
          checkbox: { class: 'mr-2' },
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.ndv-tree {
  background: transparent !important;
  border: none !important;
  font-size: 12px;
}
</style>
