<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronUp, LoaderCircle, Search } from 'lucide-vue-next'
import InputText from 'primevue/inputtext'
import Tree from 'primevue/tree'
import type { TreeSelectionKeys } from 'primevue/tree'
import type { TreeNode } from 'primevue/treenode'
import type { NodeProperty } from '@/nodes/types'
import {
  normalizePropertyFieldTreeOptions,
  usePropertyFieldTreeSearch,
} from '../usePropertyFieldTreeSearch'

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

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const isLeafNode = (node: TreeNode) => !Array.isArray(node.children) || node.children.length === 0

const normalizedTreeOptions = computed(() =>
  normalizePropertyFieldTreeOptions(props.options as TreeNode[], Boolean(props.prop.singleSelect)),
)

const collectNodeMap = (nodes: any[]) => {
  const map = new Map<string, any>()

  const visit = (items: any[]) => {
    items.forEach((item) => {
      if (!item?.key) return
      map.set(String(item.key), item)
      if (Array.isArray(item.children) && item.children.length > 0) {
        visit(item.children)
      }
    })
  }

  visit(nodes)

  return map
}

const treeNodeMap = computed(() => collectNodeMap(normalizedTreeOptions.value))
const usesObjectValueMode = computed(() =>
  Array.from(treeNodeMap.value.values()).some((node) => node?.data?.value !== undefined),
)

const toSelectionStateMap = (keys: string[]) =>
  keys.reduce<Record<string, { checked: boolean; partialChecked: boolean }>>((acc, key) => {
    acc[key] = { checked: true, partialChecked: false }
    return acc
  }, {})

const getCheckedKeys = (selectionKeys: TreeSelectionKeys | undefined) =>
  Object.entries(selectionKeys || {})
    .filter(([, state]) => state?.checked)
    .map(([key]) => key)

const getCheckedLeafEntries = (selectionKeys: TreeSelectionKeys | undefined) =>
  Object.entries(selectionKeys || {}).filter(([key, state]) => {
    const node = treeNodeMap.value.get(key)
    return state?.checked && node && isLeafNode(node)
  })

const normalizeSingleSelection = (selectionKeys: TreeSelectionKeys | undefined) => {
  if (!selectionKeys || typeof selectionKeys !== 'object') return selectionKeys

  const checkedLeafEntries = getCheckedLeafEntries(selectionKeys)
  if (checkedLeafEntries.length === 0) return {}
  if (checkedLeafEntries.length === 1) {
    const [selectedKey, selectedState] = checkedLeafEntries[0] as [
      string,
      { checked?: boolean; partialChecked?: boolean },
    ]

    return {
      [selectedKey]: {
        checked: selectedState.checked ?? true,
        partialChecked: false,
      },
    }
  }

  const [selectedKey, selectedState] = checkedLeafEntries[checkedLeafEntries.length - 1] as [
    string,
    { checked?: boolean; partialChecked?: boolean },
  ]

  return {
    [selectedKey]: {
      checked: selectedState.checked ?? true,
      partialChecked: false,
    },
  }
}

const selectionKeysToObjectValue = (selectionKeys: TreeSelectionKeys | undefined) => {
  const checkedKeys = getCheckedKeys(selectionKeys)

  if (checkedKeys.length === 0) return {}

  if (props.prop.singleSelect) {
    const selectedKey = checkedKeys[checkedKeys.length - 1]
    if (!selectedKey) return {}

    return {
      selectedKey,
      value: treeNodeMap.value.get(selectedKey)?.data?.value,
    }
  }

  return {
    selectedKeys: checkedKeys,
    values: checkedKeys
      .map((key) => treeNodeMap.value.get(key)?.data?.value)
      .filter((value) => value !== undefined),
  }
}

const objectValueToSelectionKeys = (value: unknown): TreeSelectionKeys | undefined => {
  if (!value || typeof value !== 'object') return undefined

  if (props.prop.singleSelect) {
    const selectedKey = (value as { selectedKey?: string }).selectedKey
    return selectedKey ? toSelectionStateMap([selectedKey]) : undefined
  }

  const selectedKeys = (value as { selectedKeys?: string[] }).selectedKeys
  return Array.isArray(selectedKeys) && selectedKeys.length > 0
    ? toSelectionStateMap(selectedKeys)
    : undefined
}

const { query: treeFilterQuery, expandedKeys: treeExpandedKeys, filteredOptions: filteredTreeOptions, expandAllNodes, collapseAllNodes } =
  usePropertyFieldTreeSearch({
    options: normalizedTreeOptions,
  })

const treeSelectionValue = computed<TreeSelectionKeys | undefined>({
  get: () =>
    usesObjectValueMode.value
      ? objectValueToSelectionKeys(configValue.value)
      : (configValue.value as TreeSelectionKeys | undefined),
  set: (selectionKeys) => {
    const normalizedSelectionKeys = props.prop.singleSelect
      ? normalizeSingleSelection(selectionKeys)
      : selectionKeys

    if (!usesObjectValueMode.value) {
      configValue.value = normalizedSelectionKeys
      return
    }

    configValue.value = selectionKeysToObjectValue(normalizedSelectionKeys)
  },
})

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
