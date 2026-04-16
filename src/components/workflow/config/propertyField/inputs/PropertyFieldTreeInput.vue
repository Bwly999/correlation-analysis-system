<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, LoaderCircle, Search } from 'lucide-vue-next'
import { ElTreeV2 } from 'element-plus'
import InputText from 'primevue/inputtext'
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

/**
 * PropertyFieldTreeInput 用法说明
 *
 * 1. 该组件的 v-model 始终输出统一结构：
 *    {
 *      selectedKeys: string[]
 *      values: unknown[]
 *    }
 * 2. 输出结构与 options 节点是否提供 data.value 无关。
 *    - selectedKeys 保存当前选中的叶子节点 key
 *    - values 按相同顺序保存节点 data.value；若节点未提供 data.value，则对应项为 undefined
 * 3. singleSelect=true 时仍使用同一结构，只是最多保留一个叶子节点
 * 4. 为兼容历史配置，组件读取时仍支持旧格式：
 *    - TreeSelectionKeys
 *    - { selectedKey, value }
 *    - { selectedKeys, values }
 */
interface PropertyFieldTreeModelValue {
  selectedKeys: string[]
  values: unknown[]
}

const ENABLE_SEARCH_RESULT_GUARD = false
const ENABLE_SAFE_EXPAND_LIMIT = true

type TreeV2Expose = {
  setCheckedKeys?: (keys: Array<string | number>) => void
  setExpandedKeys?: (keys: Array<string | number>) => void
}

if (!import.meta.env.TEST) {
  void import('element-plus/es/components/tree-v2/style/css')
}

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const isLeafNode = (node: TreeNode) => !Array.isArray(node.children) || node.children.length === 0

const normalizedTreeOptions = computed(() =>
  normalizePropertyFieldTreeOptions(props.options as TreeNode[], Boolean(props.prop.singleSelect)),
)

const collectTreeNodeMap = (nodes: any[]) => {
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

const treeNodeMap = computed(() => collectTreeNodeMap(normalizedTreeOptions.value))

const collectLeafKeys = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((node) => {
    if (isLeafNode(node)) {
      return node.key === undefined ? [] : [String(node.key)]
    }

    return collectLeafKeys((node.children || []) as TreeNode[])
  })

const countLeafNodes = (nodes: TreeNode[]): number =>
  nodes.reduce((count, node) => {
    if (isLeafNode(node)) return count + 1
    return count + countLeafNodes((node.children || []) as TreeNode[])
  }, 0)

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

const selectionKeysToModelValue = (
  selectionKeys: TreeSelectionKeys | undefined,
): PropertyFieldTreeModelValue => {
  const checkedLeafKeys = getCheckedLeafEntries(selectionKeys).map(([key]) => key)

  return {
    selectedKeys: checkedLeafKeys,
    values: checkedLeafKeys.map((key) => treeNodeMap.value.get(key)?.data?.value),
  }
}

const isSelectionStateRecord = (
  value: unknown,
): value is Record<string, { checked?: boolean; partialChecked?: boolean }> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).some((item) => item && typeof item === 'object' && 'checked' in item)
}

const modelValueToSelectionKeys = (value: unknown): TreeSelectionKeys | undefined => {
  if (!value || typeof value !== 'object') return undefined

  if (isSelectionStateRecord(value)) {
    return value
  }

  const wrappedValue = value as {
    selectedKey?: string
    selectedKeys?: string[]
  }

  if (typeof wrappedValue.selectedKey === 'string' && wrappedValue.selectedKey) {
    return toSelectionStateMap([wrappedValue.selectedKey])
  }

  const selectedKeys = wrappedValue.selectedKeys
  return Array.isArray(selectedKeys) && selectedKeys.length > 0
    ? toSelectionStateMap(selectedKeys)
    : undefined
}

const {
  query: treeFilterQuery,
  expandedKeys: treeExpandedKeys,
  filteredOptions: filteredTreeOptions,
  isSearchResultTruncated,
  searchResultMessage,
  expandAllLabel,
  expandAllNodes,
  collapseAllNodes,
} = usePropertyFieldTreeSearch({
  options: normalizedTreeOptions,
  enableSearchResultGuard: ENABLE_SEARCH_RESULT_GUARD,
  maxExpandKeys: ENABLE_SAFE_EXPAND_LIMIT ? undefined : Number.MAX_SAFE_INTEGER,
})

const treeRef = ref<TreeV2Expose | null>(null)

const orderedLeafKeys = computed(() => collectLeafKeys(normalizedTreeOptions.value as TreeNode[]))
const visibleFilteredLeafKeys = computed(() => collectLeafKeys(filteredTreeOptions.value as TreeNode[]))

const checkedKeysList = computed(() =>
  getCheckedKeys(modelValueToSelectionKeys(configValue.value)),
)

const selectedLeafCount = computed(() => getCheckedLeafEntries(treeSelectionValue.value).length)

const totalLeafCount = computed(() => countLeafNodes(normalizedTreeOptions.value as TreeNode[]))

const selectionSummary = computed(() => {
  if (selectedLeafCount.value === 0) return ''
  return `${selectedLeafCount.value} / ${totalLeafCount.value}`
})

const expandedKeysList = computed(() => Object.keys(treeExpandedKeys.value || {}))

const toTreeV2Data = (nodes: TreeNode[]): TreeNode[] =>
  nodes.map((node) => ({
    ...node,
    children: Array.isArray(node.children) ? toTreeV2Data(node.children) : node.children,
  }))

const treeViewData = computed(() => toTreeV2Data(filteredTreeOptions.value as TreeNode[]))

const collectNodeAndDescendantKeys = (node: TreeNode | undefined): string[] => {
  if (!node || node.key === undefined) return []

  const keys = [String(node.key)]
  const children = Array.isArray(node.children) ? node.children : []

  children.forEach((child) => {
    keys.push(...collectNodeAndDescendantKeys(child))
  })

  return keys
}

const syncCheckedState = async () => {
  await nextTick()
  treeRef.value?.setCheckedKeys?.(checkedKeysList.value)
}

const syncExpandedState = async () => {
  await nextTick()
  treeRef.value?.setExpandedKeys?.(expandedKeysList.value)
}

watch(filteredTreeOptions, () => {
  void syncCheckedState()
  void syncExpandedState()
}, { immediate: true })

watch(checkedKeysList, () => {
  void syncCheckedState()
})

watch(expandedKeysList, () => {
  void syncExpandedState()
})

const selectionKeysFromCheckedState = (
  checkedKeys: Array<string | number> = [],
  halfCheckedKeys: Array<string | number> = [],
): TreeSelectionKeys =>
  [...checkedKeys, ...halfCheckedKeys].reduce<TreeSelectionKeys>((acc, rawKey) => {
    const key = String(rawKey)
    acc[key] = {
      checked: checkedKeys.some((item) => String(item) === key),
      partialChecked: halfCheckedKeys.some((item) => String(item) === key),
    }
    return acc
  }, {})

const handleTreeCheck = (
  _data: unknown,
  payload: {
    checkedKeys?: Array<string | number>
    halfCheckedKeys?: Array<string | number>
  },
) => {
  const nextSelectionKeys = selectionKeysFromCheckedState(
    payload.checkedKeys || [],
    payload.halfCheckedKeys || [],
  )

  if (!treeFilterQuery.value.trim() || props.prop.singleSelect) {
    treeSelectionValue.value = nextSelectionKeys
    return
  }

  const visibleLeafKeySet = new Set(visibleFilteredLeafKeys.value)
  const currentSelectedLeafKeys = getCheckedLeafEntries(treeSelectionValue.value).map(([key]) => key)
  const hiddenSelectedLeafKeys = currentSelectedLeafKeys.filter((key) => !visibleLeafKeySet.has(key))
  const nextVisibleSelectedLeafKeys = getCheckedLeafEntries(nextSelectionKeys)
    .map(([key]) => key)
    .filter((key) => visibleLeafKeySet.has(key))

  const mergedSelectionKeySet = new Set([
    ...hiddenSelectedLeafKeys,
    ...nextVisibleSelectedLeafKeys,
  ])

  treeSelectionValue.value = toSelectionStateMap(
    orderedLeafKeys.value.filter((key) => mergedSelectionKeySet.has(key)),
  )
}

const handleTreeExpand = (data: unknown) => {
  const node = data as TreeNode
  if (node.key === undefined) return
  treeExpandedKeys.value = {
    ...treeExpandedKeys.value,
    [String(node.key)]: true,
  }
}

const handleTreeCollapse = (data: unknown) => {
  const node = data as TreeNode
  if (node.key === undefined) return
  const nextKeys = { ...treeExpandedKeys.value }
  collectNodeAndDescendantKeys(node).forEach((key) => {
    delete nextKeys[key]
  })
  treeExpandedKeys.value = nextKeys
}

const treeSelectionValue = computed<TreeSelectionKeys | undefined>({
  get: () => modelValueToSelectionKeys(configValue.value),
  set: (selectionKeys) => {
    const normalizedSelectionKeys = props.prop.singleSelect
      ? normalizeSingleSelection(selectionKeys)
      : selectionKeys

    configValue.value = selectionKeysToModelValue(normalizedSelectionKeys)
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
          :title="expandAllLabel"
          :aria-label="expandAllLabel"
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
        v-if="isSearchResultTruncated"
        class="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700"
      >
        {{ searchResultMessage }}
      </div>
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
      <ElTreeV2
        v-else
        ref="treeRef"
        :data="treeViewData"
        node-key="key"
        show-checkbox
        check-on-click-node
        :check-strictly="false"
        highlight-current
        class="ndv-tree max-h-[360px] overflow-auto"
        :props="{ value: 'key', label: 'label', children: 'children' }"
        @check="handleTreeCheck"
        @node-expand="handleTreeExpand"
        @node-collapse="handleTreeCollapse"
      >
        <template #default="{ node, data }">
          <span
            class="block rounded-lg px-1 py-1 text-[12px] font-medium text-slate-600"
            :class="data?.data?.searchSummary ? 'text-amber-700 italic' : ''"
          >
            {{ node.label }}
          </span>
        </template>
      </ElTreeV2>
      <div
        v-if="selectionSummary"
        class="mt-2 text-right text-[11px] leading-5 text-slate-400"
        data-testid="tree-selection-summary"
      >
        {{ selectionSummary }}
      </div>
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
