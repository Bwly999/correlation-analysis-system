import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { TreeNode } from 'primevue/treenode'

export type PropertyFieldTreeNode = TreeNode & {
  children?: PropertyFieldTreeNode[]
  data?: Record<string, unknown> & {
    searchText?: string
    normalizedSearchText?: string
  }
}

type FilteredTreeState = {
  nodes: PropertyFieldTreeNode[]
  expandedKeys: Record<string, boolean>
  isTruncated: boolean
  hiddenLeafMatchCount: number
  message: string
}

interface UsePropertyFieldTreeSearchOptions {
  options: Ref<PropertyFieldTreeNode[]>
  debounceMs?: number
  maxSearchLeafMatches?: number
  maxExpandKeys?: number
}

const DEFAULT_MAX_SEARCH_LEAF_MATCHES = 120
const DEFAULT_MAX_EXPAND_KEYS = 160
const SEARCH_SUMMARY_KEY_PREFIX = '__search-summary__'
const SEARCH_SUMMARY_MESSAGE_SUFFIX = '请继续缩小搜索范围'

const normalizeSearchText = (node: TreeNode) =>
  String(node.data?.searchText || node.label || '').trim().toLowerCase()

const normalizeTreeOptions = (
  nodes: TreeNode[],
  leafOnlySelectable: boolean,
): PropertyFieldTreeNode[] =>
  nodes.map((node) => {
    const normalizedChildren = Array.isArray(node.children)
      ? normalizeTreeOptions(node.children, leafOnlySelectable)
      : undefined
    const leaf = !normalizedChildren || normalizedChildren.length === 0

    return {
      ...node,
      children: normalizedChildren,
      data: {
        ...(node.data as Record<string, unknown> | undefined),
        normalizedSearchText: normalizeSearchText(node),
      },
      selectable: leafOnlySelectable && !leaf ? false : node.selectable,
    }
  })

type SearchFilterBudget = {
  remainingLeafMatches: number
  hiddenLeafMatchCount: number
  summarySequence: number
  isTruncated: boolean
}

type SearchVisitResult = {
  node: PropertyFieldTreeNode | null
  matched: boolean
  expandedKeys: string[]
}

const createSearchSummaryNode = (
  parentKey: string,
  hiddenLeafMatchCount: number,
  summarySequence: number,
): PropertyFieldTreeNode => ({
  key: `${SEARCH_SUMMARY_KEY_PREFIX}:${parentKey}:${summarySequence}`,
  label: `该分组命中 ${hiddenLeafMatchCount} 项，${SEARCH_SUMMARY_MESSAGE_SUFFIX}`,
  children: [],
  selectable: false,
  data: {
    searchSummary: true,
    hiddenLeafMatchCount,
  },
})

const visitFilteredNode = (
  node: PropertyFieldTreeNode,
  normalizedQuery: string,
  budget: SearchFilterBudget,
): SearchVisitResult => {
  const children = Array.isArray(node.children) ? node.children : []
  const isLeaf = children.length === 0
  const searchText = node.data?.normalizedSearchText || ''
  const selfMatched = searchText.includes(normalizedQuery)

  if (isLeaf) {
    if (!selfMatched) {
      return {
        node: null,
        matched: false,
        expandedKeys: [],
      }
    }

    if (budget.remainingLeafMatches <= 0) {
      budget.hiddenLeafMatchCount += 1
      budget.isTruncated = true

      return {
        node: null,
        matched: true,
        expandedKeys: [],
      }
    }

    budget.remainingLeafMatches -= 1

    return {
      node: {
        ...node,
        children: [],
      },
      matched: true,
      expandedKeys: [],
    }
  }

  const visibleChildren: PropertyFieldTreeNode[] = []
  const expandedKeys: string[] = []
  let matchedDescendantCount = 0
  const hiddenBefore = budget.hiddenLeafMatchCount

  children.forEach((child) => {
    const childResult = visitFilteredNode(child, normalizedQuery, budget)

    if (!childResult.matched) {
      return
    }

    matchedDescendantCount += 1
    expandedKeys.push(...childResult.expandedKeys)

    if (childResult.node) {
      visibleChildren.push(childResult.node)
    }
  })

  const hiddenInCurrentNode = budget.hiddenLeafMatchCount - hiddenBefore
  const matched = selfMatched || matchedDescendantCount > 0 || hiddenInCurrentNode > 0

  if (!matched) {
    return {
      node: null,
      matched: false,
      expandedKeys: [],
    }
  }

  const currentChildren =
    hiddenInCurrentNode > 0
      ? [
          ...visibleChildren,
          createSearchSummaryNode(
            String(node.key ?? `group-${budget.summarySequence}`),
            hiddenInCurrentNode,
            budget.summarySequence++,
          ),
        ]
      : visibleChildren

  const nextExpandedKeys =
    currentChildren.length > 0 && node.key !== undefined
      ? [String(node.key), ...expandedKeys]
      : expandedKeys

  return {
    node: {
      ...node,
      children: currentChildren,
    },
    matched: true,
    expandedKeys: nextExpandedKeys,
  }
}

const filterTreeNodes = (
  nodes: PropertyFieldTreeNode[],
  normalizedQuery: string,
  maxSearchLeafMatches: number,
): FilteredTreeState => {
  if (!normalizedQuery) {
    return {
      nodes,
      expandedKeys: {},
      isTruncated: false,
      hiddenLeafMatchCount: 0,
      message: '',
    }
  }

  const budget: SearchFilterBudget = {
    remainingLeafMatches: maxSearchLeafMatches,
    hiddenLeafMatchCount: 0,
    summarySequence: 1,
    isTruncated: false,
  }
  const expandedKeys: Record<string, boolean> = {}
  const filteredNodes = nodes.reduce<PropertyFieldTreeNode[]>((acc, node) => {
    const result = visitFilteredNode(node, normalizedQuery, budget)
    if (!result.node) {
      return acc
    }

    result.expandedKeys.forEach((key) => {
      expandedKeys[key] = true
    })
    acc.push(result.node)
    return acc
  }, [])

  return {
    nodes: filteredNodes,
    expandedKeys,
    isTruncated: budget.isTruncated,
    hiddenLeafMatchCount: budget.hiddenLeafMatchCount,
    message: budget.isTruncated
      ? `结果过多，已按分组摘要显示，隐藏 ${budget.hiddenLeafMatchCount} 项，${SEARCH_SUMMARY_MESSAGE_SUFFIX}`
      : '',
  }
}

const collectExpandedKeys = (
  nodes: PropertyFieldTreeNode[],
  maxExpandKeys: number,
): Record<string, boolean> => {
  const expandedKeys: Record<string, boolean> = {}
  let collectedCount = 0

  const traverse = (items: PropertyFieldTreeNode[]) => {
    items.forEach((item) => {
      if (!item?.children?.length || collectedCount >= maxExpandKeys) return
      expandedKeys[String(item.key)] = true
      collectedCount += 1
      traverse(item.children)
    })
  }

  traverse(nodes)

  return expandedKeys
}

export const usePropertyFieldTreeSearch = ({
  options,
  debounceMs = 150,
  maxSearchLeafMatches = DEFAULT_MAX_SEARCH_LEAF_MATCHES,
  maxExpandKeys = DEFAULT_MAX_EXPAND_KEYS,
}: UsePropertyFieldTreeSearchOptions) => {
  const query = ref('')
  const debouncedQuery = ref('')
  const expandedKeys = shallowRef<Record<string, boolean>>({})
  let filterTimer: ReturnType<typeof setTimeout> | null = null

  const normalizedTreeFilterQuery = computed(() => debouncedQuery.value.trim().toLowerCase())

  const filteredTreeState = computed(() =>
    filterTreeNodes(options.value, normalizedTreeFilterQuery.value, maxSearchLeafMatches),
  )

  const filteredOptions = computed(() => filteredTreeState.value.nodes)
  const isSearchResultTruncated = computed(() => filteredTreeState.value.isTruncated)
  const searchResultMessage = computed(() => filteredTreeState.value.message)
  const expandAllLabel = '安全展开'

  const expandAllNodes = () => {
    expandedKeys.value = collectExpandedKeys(filteredOptions.value, maxExpandKeys)
  }

  const collapseAllNodes = () => {
    expandedKeys.value = {}
  }

  watch(query, (nextQuery) => {
    if (filterTimer) {
      clearTimeout(filterTimer)
    }

    filterTimer = setTimeout(() => {
      debouncedQuery.value = nextQuery
      filterTimer = null
    }, debounceMs)
  })

  watch([normalizedTreeFilterQuery, filteredTreeState], ([normalizedQuery, state]) => {
    if (!normalizedQuery) return
    expandedKeys.value = collectExpandedKeys(state.nodes, maxExpandKeys)
  })

  onBeforeUnmount(() => {
    if (!filterTimer) return
    clearTimeout(filterTimer)
  })

  return {
    query,
    expandedKeys,
    filteredOptions,
    isSearchResultTruncated,
    searchResultMessage,
    expandAllLabel,
    expandAllNodes,
    collapseAllNodes,
  }
}

export const normalizePropertyFieldTreeOptions = normalizeTreeOptions
