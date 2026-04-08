import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
}

interface UsePropertyFieldTreeSearchOptions {
  options: Ref<PropertyFieldTreeNode[]>
  debounceMs?: number
}

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

const filterTreeNodes = (
  nodes: PropertyFieldTreeNode[],
  normalizedQuery: string,
): FilteredTreeState => {
  if (!normalizedQuery) {
    return {
      nodes,
      expandedKeys: {},
    }
  }

  const expandedKeys: Record<string, boolean> = {}

  const visit = (
    items: PropertyFieldTreeNode[],
  ): Array<{ node: PropertyFieldTreeNode; expandedKeys: string[] }> =>
    items.reduce<Array<{ node: PropertyFieldTreeNode; expandedKeys: string[] }>>((acc, node) => {
      const matchedChildren = Array.isArray(node.children) ? visit(node.children) : []
      const searchText = node.data?.normalizedSearchText || ''
      const matched = searchText.includes(normalizedQuery)

      if (!matched && matchedChildren.length === 0) {
        return acc
      }

      const currentExpandedKeys =
        matchedChildren.length > 0 && node.key !== undefined ? [String(node.key)] : []

      acc.push({
        node: {
          ...node,
          children: matchedChildren.map((child) => child.node),
        },
        expandedKeys: [
          ...currentExpandedKeys,
          ...matchedChildren.flatMap((child) => child.expandedKeys),
        ],
      })

      return acc
    }, [])

  const filteredNodes = visit(nodes)

  filteredNodes
    .flatMap((item) => item.expandedKeys)
    .forEach((key) => {
      expandedKeys[key] = true
    })

  return {
    nodes: filteredNodes.map((item) => item.node),
    expandedKeys,
  }
}

const collectExpandedKeys = (nodes: PropertyFieldTreeNode[]): Record<string, boolean> => {
  const expandedKeys: Record<string, boolean> = {}

  const traverse = (items: PropertyFieldTreeNode[]) => {
    items.forEach((item) => {
      if (!item?.children?.length) return
      expandedKeys[String(item.key)] = true
      traverse(item.children)
    })
  }

  traverse(nodes)

  return expandedKeys
}

export const usePropertyFieldTreeSearch = ({
  options,
  debounceMs = 150,
}: UsePropertyFieldTreeSearchOptions) => {
  const query = ref('')
  const debouncedQuery = ref('')
  const expandedKeys = ref<Record<string, boolean>>({})
  let filterTimer: ReturnType<typeof setTimeout> | null = null

  const normalizedTreeFilterQuery = computed(() => debouncedQuery.value.trim().toLowerCase())

  const filteredTreeState = computed(() =>
    filterTreeNodes(options.value, normalizedTreeFilterQuery.value),
  )

  const filteredOptions = computed(() => filteredTreeState.value.nodes)

  const expandAllNodes = () => {
    expandedKeys.value = collectExpandedKeys(filteredOptions.value)
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
    expandedKeys.value = state.expandedKeys
  })

  onBeforeUnmount(() => {
    if (!filterTimer) return
    clearTimeout(filterTimer)
  })

  return {
    query,
    expandedKeys,
    filteredOptions,
    expandAllNodes,
    collapseAllNodes,
  }
}

export const normalizePropertyFieldTreeOptions = normalizeTreeOptions
