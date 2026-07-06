<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import {
  Search,
  ChevronRight,
  X,
  Info,
  Box,
  Layout,
  Filter,
  Clock3,
  Sparkles,
} from 'lucide-vue-next'

import NodeIcon from './nodes/NodeIcon.vue'
import {
  useWorkflowStore,
  CONNECTION_RULES,
  type PendingConnectionState,
} from '@/stores/workflowStore'
import { creatableNodeDefinitions, getNodeDefinition } from '@/nodes/registry'
import { NODE_LIBRARY_GROUPS, type NodeLibraryGroupId } from '@/nodes/libraryGroups'
import type { NodeCategory } from '@/nodes/types'
import type { WorkflowNode } from '@/utils/storage'

const RECENT_NODE_STORAGE_KEY = 'workflow-node-sidebar-recent'
const MAX_RECENT_NODE_COUNT = 5
const MAX_SHORTCUT_NODE_COUNT = 4
const FALLBACK_RECOMMENDED_TYPES = ['file-import', 'manual-json-import', 'neighbor-system']

type SidebarCategoryFilter = 'all' | NodeCategory

type SidebarCategoryMeta = {
  value: SidebarCategoryFilter
  label: string
}

type SidebarNode = {
  type: string
  label: string
  desc: string
  summary: string
  category: NodeCategory
  isMultipleInput: boolean
  libraryGroup: NodeLibraryGroupId | 'misc'
  libraryAliases: string[]
  libraryKeywords: string[]
  recommendedNextNodes: string[]
  recommendedPrevNodes: string[]
  isClickable: boolean
}

type SidebarSearchMatch = {
  label: string
  priority: number
}

type SidebarSearchNode = SidebarNode & {
  matchReason: string
  matchPriority: number
}

type SidebarBrowseGroup = {
  id: NodeLibraryGroupId | 'misc'
  label: string
  icon: Component
  nodes: SidebarNode[]
}

type SidebarShortcutSection = {
  id: 'connectable' | 'recent' | 'context' | 'recommended'
  title: string
  icon: Component
  nodes: SidebarNode[]
}

const categoryFilters: SidebarCategoryMeta[] = [
  { value: 'all', label: '全部' },
  { value: 'trigger', label: '数据接入' },
  { value: 'action', label: '数据处理' },
  { value: 'terminal', label: '分析输出' },
]

const groupIconMap: Record<NodeLibraryGroupId | 'misc', Component> = {
  'import-data': Box,
  'clean-filter': Filter,
  'field-shaping': Layout,
  'merge-aggregate': Layout,
  'stat-analysis': Box,
  'model-analysis': Sparkles,
  'result-output': Box,
  misc: Box,
}

const browseGroupOrder: Array<{ id: NodeLibraryGroupId | 'misc'; label: string }> = [
  ...NODE_LIBRARY_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
  })),
  {
    id: 'misc',
    label: '其他节点',
  },
]

const store = useWorkflowStore()
const searchQuery = ref('')
const activeCategoryFilter = ref<SidebarCategoryFilter>('all')
const recentNodeTypes = ref(loadRecentNodeTypes())
const collapsedGroupIds = ref<Array<NodeLibraryGroupId | 'misc'>>([])
const collapsedShortcutSectionIds = ref<SidebarShortcutSection['id'][]>([])

const emit = defineEmits(['close'])

const workflowNodes = computed<WorkflowNode[]>(() => store.nodes as WorkflowNode[])
const pendingConnection = computed<PendingConnectionState>(() => store.pendingConnection)
const trimmedSearchQuery = computed(() => searchQuery.value.trim())
const normalizedSearchQuery = computed(() => trimmedSearchQuery.value.toLowerCase())

const allowedCategories = computed<NodeCategory[]>(() => {
  const currentPendingConnection = pendingConnection.value
  if (!currentPendingConnection) {
    return ['trigger', 'action', 'terminal']
  }

  const sourceNode = workflowNodes.value.find((node) => node.id === currentPendingConnection.sourceNodeId)
  const sourceCategory = sourceNode?.data?.category as NodeCategory | undefined

  if (!sourceCategory) {
    return ['trigger', 'action', 'terminal']
  }

  return (CONNECTION_RULES[sourceCategory] as NodeCategory[]) ?? []
})

const allSidebarNodes = computed<SidebarNode[]>(() =>
  creatableNodeDefinitions.map((definition) => ({
    type: definition.name,
    label: definition.displayName,
    desc: definition.description,
    summary: definition.help?.summary ?? definition.description,
    category: definition.category,
    isMultipleInput: definition.inputMode === 'multiple',
    libraryGroup: definition.libraryGroup ?? 'misc',
    libraryAliases: definition.libraryAliases ?? [],
    libraryKeywords: definition.libraryKeywords ?? [],
    recommendedNextNodes: definition.assistantHints?.recommendedNextNodes ?? [],
    recommendedPrevNodes: definition.assistantHints?.recommendedPrevNodes ?? [],
    isClickable: allowedCategories.value.includes(definition.category),
  })),
)

const contextSourceNode = computed<WorkflowNode | null>(() => {
  if (pendingConnection.value) {
    return (
      workflowNodes.value.find((node) => node.id === pendingConnection.value?.sourceNodeId) ?? null
    )
  }

  return workflowNodes.value.length > 0 ? workflowNodes.value[workflowNodes.value.length - 1] ?? null : null
})

const contextRecommendedTypes = computed<string[]>(() => {
  const sourceType = contextSourceNode.value?.data?.type
  if (!sourceType) {
    return []
  }

  const sourceDefinition = getNodeDefinition(sourceType)
  if (!sourceDefinition) {
    return []
  }

  const nextNodes = sourceDefinition.assistantHints?.recommendedNextNodes ?? []
  if (nextNodes.length > 0) {
    return nextNodes
  }

  return sourceDefinition.assistantHints?.recommendedPrevNodes ?? []
})

const searchResults = computed<SidebarSearchNode[]>(() => {
  const searchTerm = normalizedSearchQuery.value
  if (!searchTerm) {
    return []
  }

  return allSidebarNodes.value
    .filter((node) => matchesCategoryFilter(node))
    .map((node) => {
      const match = getSearchMatch(node, searchTerm)
      if (!match) {
        return null
      }

      return {
        ...node,
        matchReason: match.label,
        matchPriority: match.priority,
      }
    })
    .filter((node): node is SidebarSearchNode => Boolean(node))
    .sort((left, right) => {
      if (left.matchPriority !== right.matchPriority) {
        return left.matchPriority - right.matchPriority
      }

      const recentDelta = getRecentRank(left.type) - getRecentRank(right.type)
      if (recentDelta !== 0) {
        return recentDelta
      }

      return left.label.localeCompare(right.label, 'zh-CN')
    })
})

const browseGroups = computed<SidebarBrowseGroup[]>(() => {
  if (normalizedSearchQuery.value) {
    return []
  }

  const nodeMap = new Map<NodeLibraryGroupId | 'misc', SidebarNode[]>()

  for (const node of allSidebarNodes.value) {
    if (!matchesCategoryFilter(node)) {
      continue
    }

    const groupNodes = nodeMap.get(node.libraryGroup) ?? []
    groupNodes.push(node)
    nodeMap.set(node.libraryGroup, groupNodes)
  }

  return browseGroupOrder
    .map((group) => ({
      id: group.id,
      label: group.label,
      icon: groupIconMap[group.id],
      nodes: (nodeMap.get(group.id) ?? []).sort(sortNodesForBrowsing),
    }))
    .filter((group) => group.nodes.length > 0)
})

const shortcutSections = computed<SidebarShortcutSection[]>(() => {
  if (normalizedSearchQuery.value) {
    return []
  }

  const sections: SidebarShortcutSection[] = []
  const recommendedTypes = contextRecommendedTypes.value

  const connectableNodes = allSidebarNodes.value
    .filter((node) => matchesCategoryFilter(node) && node.isClickable)
    .sort((left, right) => sortNodesForShortcut(left, right, recommendedTypes))
    .slice(0, MAX_SHORTCUT_NODE_COUNT)

  if (pendingConnection.value && connectableNodes.length > 0) {
    sections.push({
      id: 'connectable',
      title: '当前可接入',
      icon: Sparkles,
      nodes: connectableNodes,
    })
    return sections
  }

  const recentNodes = recentNodeTypes.value
    .map((type) => allSidebarNodes.value.find((node) => node.type === type))
    .filter((node): node is SidebarNode => Boolean(node))
    .filter(matchesCategoryFilter)
    .slice(0, MAX_SHORTCUT_NODE_COUNT)

  if (recentNodes.length > 0) {
    sections.push({
      id: 'recent',
      title: '最近使用',
      icon: Clock3,
      nodes: recentNodes,
    })
  }

  const contextNodes = recommendedTypes
    .map((type) => allSidebarNodes.value.find((node) => node.type === type))
    .filter((node): node is SidebarNode => Boolean(node))
    .filter(matchesCategoryFilter)
    .slice(0, MAX_SHORTCUT_NODE_COUNT)

  if (contextNodes.length > 0) {
    sections.push({
      id: 'context',
      title: '上下文推荐',
      icon: Sparkles,
      nodes: contextNodes,
    })
    return sections
  }

  const recommendedNodes = FALLBACK_RECOMMENDED_TYPES
    .map((type) => allSidebarNodes.value.find((node) => node.type === type))
    .filter((node): node is SidebarNode => Boolean(node))
    .filter(matchesCategoryFilter)
    .slice(0, MAX_SHORTCUT_NODE_COUNT)

  if (recommendedNodes.length > 0) {
    sections.push({
      id: 'recommended',
      title: '常用起点',
      icon: Sparkles,
      nodes: recommendedNodes,
    })
  }

  return sections
})

const totalVisibleNodeCount = computed(() => {
  if (normalizedSearchQuery.value) {
    return searchResults.value.length
  }

  return browseGroups.value.reduce((sum, group) => sum + group.nodes.length, 0)
})

const groupCount = computed(() =>
  normalizedSearchQuery.value ? 1 : browseGroups.value.length,
)

const onNodeClick = (node: SidebarNode) => {
  rememberRecentNode(node.type)

  const currentPendingConnection = pendingConnection.value
  if (currentPendingConnection) {
    const pendingSourceNode = workflowNodes.value.find(
      (currentNode) => currentNode.id === currentPendingConnection.sourceNodeId,
    )
    const position = pendingSourceNode
      ? { x: pendingSourceNode.position.x + 300, y: pendingSourceNode.position.y }
      : { x: 100, y: 100 }

    store.addAndConnectNode(node.type, node.label, position)
    return
  }

  store.addAndConnectNode(node.type, node.label, { x: 200, y: 200 })
}

const clearPendingConnection = () => {
  store.setPendingConnection(null)
}

const onDragStart = (event: DragEvent, node: SidebarNode) => {
  if (!event.dataTransfer) {
    return
  }

  event.dataTransfer.setData('application/vueflow', node.type)
  event.dataTransfer.setData('application/label', node.label)
  event.dataTransfer.effectAllowed = 'move'
}

function matchesCategoryFilter(node: SidebarNode) {
  return activeCategoryFilter.value === 'all' || node.category === activeCategoryFilter.value
}

function getSearchMatch(node: SidebarNode, searchTerm: string): SidebarSearchMatch | null {
  const normalizedLabel = node.label.toLowerCase()
  const normalizedDescription = node.desc.toLowerCase()
  const normalizedSummary = node.summary.toLowerCase()
  const aliasHit = node.libraryAliases.some((alias) => alias.toLowerCase().includes(searchTerm))
  const keywordHit = node.libraryKeywords.some((keyword) => keyword.toLowerCase().includes(searchTerm))

  if (normalizedLabel === searchTerm) {
    return { label: '名称命中', priority: 0 }
  }
  if (normalizedLabel.startsWith(searchTerm)) {
    return { label: '名称命中', priority: 1 }
  }
  if (normalizedLabel.includes(searchTerm)) {
    return { label: '名称命中', priority: 2 }
  }
  if (aliasHit) {
    return { label: '别名命中', priority: 3 }
  }
  if (normalizedSummary.includes(searchTerm) || normalizedDescription.includes(searchTerm)) {
    return { label: '说明命中', priority: 4 }
  }
  if (keywordHit) {
    return { label: '用途匹配', priority: 5 }
  }

  return null
}

function sortNodesForBrowsing(left: SidebarNode, right: SidebarNode) {
  const recentDelta = getRecentRank(left.type) - getRecentRank(right.type)
  if (recentDelta !== 0) {
    return recentDelta
  }

  return left.label.localeCompare(right.label, 'zh-CN')
}

function sortNodesForShortcut(left: SidebarNode, right: SidebarNode, recommendedTypes: string[]) {
  const leftRecommendedRank = getRecommendedRank(left.type, recommendedTypes)
  const rightRecommendedRank = getRecommendedRank(right.type, recommendedTypes)

  if (leftRecommendedRank !== rightRecommendedRank) {
    return leftRecommendedRank - rightRecommendedRank
  }

  return sortNodesForBrowsing(left, right)
}

function getRecentRank(type: string) {
  const rank = recentNodeTypes.value.indexOf(type)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

function getRecommendedRank(type: string, recommendedTypes: string[]) {
  const rank = recommendedTypes.indexOf(type)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

function rememberRecentNode(type: string) {
  const nextRecentNodes = [type, ...recentNodeTypes.value.filter((item) => item !== type)].slice(
    0,
    MAX_RECENT_NODE_COUNT,
  )

  recentNodeTypes.value = nextRecentNodes

  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(RECENT_NODE_STORAGE_KEY, JSON.stringify(nextRecentNodes))
}

function isBrowseGroupCollapsed(groupId: NodeLibraryGroupId | 'misc') {
  return collapsedGroupIds.value.includes(groupId)
}

function toggleBrowseGroup(groupId: NodeLibraryGroupId | 'misc') {
  collapsedGroupIds.value = isBrowseGroupCollapsed(groupId)
    ? collapsedGroupIds.value.filter((id) => id !== groupId)
    : [...collapsedGroupIds.value, groupId]
}

function isShortcutSectionCollapsed(sectionId: SidebarShortcutSection['id']) {
  return collapsedShortcutSectionIds.value.includes(sectionId)
}

function toggleShortcutSection(sectionId: SidebarShortcutSection['id']) {
  collapsedShortcutSectionIds.value = isShortcutSectionCollapsed(sectionId)
    ? collapsedShortcutSectionIds.value.filter((id) => id !== sectionId)
    : [...collapsedShortcutSectionIds.value, sectionId]
}

function loadRecentNodeTypes() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_NODE_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_RECENT_NODE_COUNT)
  } catch {
    return []
  }
}

const categoryBadge = (category: NodeCategory) => {
  if (category === 'trigger') {
    return '接入'
  }
  if (category === 'terminal') {
    return '输出'
  }
  return '处理'
}
</script>

<template>
  <div class="node-sidebar-root flex flex-col h-full border-l border-slate-200 overflow-hidden">
    <div class="sidebar-header sticky top-0 z-20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div
            class="h-7 w-7 rounded-lg border border-slate-200 bg-white shadow-sm flex items-center justify-center"
          >
            <Box :size="14" class="text-slate-700" />
          </div>
          <div>
            <h2 class="text-[14px] font-semibold text-slate-900 tracking-tight">节点库</h2>
            <p class="text-[11px] text-slate-500 mt-0.5">按场景浏览，结合搜索快速定位节点</p>
          </div>
        </div>
        <button
          class="p-1.5 text-[#a3acb9] hover:text-[#ef4444] hover:bg-red-50 rounded-lg transition-all duration-200 cursor-pointer"
          @click="emit('close')"
        >
          <X :size="18" :stroke-width="2.5" />
        </button>
      </div>

      <div class="stats-strip">
        <div class="stat-item">
          <span class="stat-label">可见节点</span>
          <span class="stat-value">{{ totalVisibleNodeCount }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">{{ normalizedSearchQuery ? '搜索结果' : '场景分组' }}</span>
          <span class="stat-value">{{ groupCount }}</span>
        </div>
      </div>

      <div class="relative group">
        <div class="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <Search
            :size="16"
            class="text-[#94a3b8] group-focus-within:text-slate-900 transition-colors duration-200"
            :stroke-width="2.5"
          />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索节点名称、用途或别名..."
          class="w-full pl-10 pr-8 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5 rounded-xl text-[13px] text-[#1e293b] placeholder:text-[#94a3b8] outline-none transition-all duration-200"
        />
        <button
          v-if="searchQuery"
          class="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#94a3b8] hover:text-[#64748b]"
          @click="searchQuery = ''"
        >
          <X :size="14" />
        </button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="filter in categoryFilters"
          :key="filter.value"
          :data-testid="'category-filter'"
          class="category-filter-chip"
          :class="{ 'category-filter-chip--active': activeCategoryFilter === filter.value }"
          @click="activeCategoryFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div class="sidebar-list flex-1 overflow-y-auto custom-scrollbar px-3 pb-8 pt-3">
      <div
        v-if="store.pendingConnection"
        class="mt-1 mb-4 p-4 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-200 animate-in zoom-in-95 duration-300 relative overflow-hidden border border-slate-700/70"
      >
        <div class="relative z-10 flex items-start gap-3">
          <div class="p-1.5 bg-white/10 rounded-lg text-white ring-1 ring-white/20">
            <Info :size="14" />
          </div>
          <div class="flex-1">
            <p class="text-[12px] font-bold text-white leading-tight">选择连接目标</p>
            <p class="text-[10px] text-white/60 mt-1 leading-relaxed">
              已优先展示当前可连接节点，仍可继续浏览完整节点库。
            </p>
          </div>
          <button
            class="text-white/40 hover:text-white transition-colors cursor-pointer"
            @click="clearPendingConnection"
          >
            <X :size="14" />
          </button>
        </div>
        <div class="absolute -right-4 -bottom-4 opacity-5 rotate-12 text-white">
          <Box :size="80" />
        </div>
      </div>

      <div v-if="shortcutSections.length" class="space-y-3 mb-4">
        <div
          v-for="section in shortcutSections"
          :key="section.id"
          class="shortcut-shell"
          :data-shortcut-section="section.id"
        >
          <div class="shortcut-header">
            <div class="flex items-center gap-2">
              <component :is="section.icon" :size="14" class="text-slate-600" />
              <span class="text-[11px] font-bold text-slate-700 tracking-wide">{{ section.title }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="shortcut-count">{{ section.nodes.length }}</span>
              <button
                data-testid="shortcut-toggle"
                class="group-toggle-button"
                :aria-expanded="!isShortcutSectionCollapsed(section.id)"
                @click="toggleShortcutSection(section.id)"
              >
                <ChevronRight
                  :size="14"
                  class="text-slate-500 transition-transform duration-200"
                  :class="{ 'rotate-90': !isShortcutSectionCollapsed(section.id) }"
                />
              </button>
            </div>
          </div>

          <div v-if="!isShortcutSectionCollapsed(section.id)" data-testid="shortcut-body" class="space-y-1.5 p-2.5">
            <div
              v-for="node in section.nodes"
              :key="`${section.id}-${node.type}`"
              :data-node-type="node.type"
              draggable="true"
              class="n8n-node-item group"
              :class="[
                store.pendingConnection
                  ? node.isClickable
                    ? 'is-connectable'
                    : 'is-disabled'
                  : 'is-normal',
              ]"
              @dragstart="onDragStart($event, node)"
              @click="onNodeClick(node)"
            >
              <div class="n8n-node-item-inner flex items-center gap-3 p-2.5 rounded-xl transition-all border border-transparent">
                <div
                  class="n8n-icon-box p-1.5 bg-white rounded-lg shadow-sm border border-slate-200/80 group-hover:border-blue-200 transition-colors duration-300"
                >
                  <NodeIcon :type="node.type" :size="30" />
                </div>
                <div class="flex flex-col flex-1 min-w-0">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-[12px] font-semibold text-slate-800 truncate tracking-tight">
                      {{ node.label }}
                    </span>
                    <span class="node-category-badge">{{ categoryBadge(node.category) }}</span>
                    <span v-if="node.isMultipleInput" class="node-input-mode-badge">多输入</span>
                  </div>
                  <span class="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                    {{ node.summary }}
                  </span>
                </div>
                <ChevronRight
                  :size="13"
                  class="text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="normalizedSearchQuery" class="search-result-shell">
        <div class="search-result-header">
          <span class="text-[11px] font-bold text-slate-700 tracking-wide">搜索结果</span>
          <span class="shortcut-count">{{ searchResults.length }}</span>
        </div>

        <div v-if="searchResults.length" class="space-y-1.5 p-2.5">
          <div
            v-for="node in searchResults"
            :key="node.type"
            :data-node-type="node.type"
            draggable="true"
            class="n8n-node-item group"
            :class="[
              store.pendingConnection
                ? node.isClickable
                  ? 'is-connectable'
                  : 'is-disabled'
                : 'is-normal',
            ]"
            @dragstart="onDragStart($event, node)"
            @click="onNodeClick(node)"
          >
            <div class="n8n-node-item-inner flex items-center gap-3 p-2.5 rounded-xl transition-all border border-transparent">
              <div
                class="n8n-icon-box p-1.5 bg-white rounded-lg shadow-sm border border-slate-200/80 group-hover:border-blue-200 transition-colors duration-300"
              >
                <NodeIcon :type="node.type" :size="30" />
              </div>
              <div class="flex flex-col flex-1 min-w-0">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-[12px] font-semibold text-slate-800 truncate tracking-tight">
                      {{ node.label }}
                    </span>
                    <span class="node-category-badge">{{ categoryBadge(node.category) }}</span>
                    <span v-if="node.isMultipleInput" class="node-input-mode-badge">多输入</span>
                    <span class="search-match-badge">{{ node.matchReason }}</span>
                  </div>
                  <span class="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                    {{ node.summary }}
                  </span>
              </div>
              <ChevronRight
                :size="13"
                class="text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-300"
              />
            </div>
          </div>
        </div>

        <div v-else class="empty-search-state">
          <p class="text-[12px] font-semibold text-slate-800">没有找到匹配节点</p>
          <p class="text-[11px] text-slate-500 mt-1">可以尝试节点名称、分析方法或用途关键词，例如“相关”“图表”“清洗”。</p>
        </div>
      </div>

      <div v-else class="space-y-4">
        <div v-for="group in browseGroups" :key="group.id" class="category-shell" :data-group-id="group.id">
          <div class="category-shell-header">
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="w-5 h-5 rounded-md border border-white/70 shadow-sm flex items-center justify-center bg-white/70"
              >
                <component :is="group.icon" :size="12" class="text-slate-600" />
              </div>
              <span
                data-testid="library-group-title"
                class="text-[11px] font-bold text-slate-700 tracking-wide truncate"
              >
                {{ group.label }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <div class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
                {{ group.nodes.length }}
              </div>
              <button
                data-testid="group-toggle"
                class="group-toggle-button"
                :aria-expanded="!isBrowseGroupCollapsed(group.id)"
                @click="toggleBrowseGroup(group.id)"
              >
                <ChevronRight
                  :size="14"
                  class="text-slate-500 transition-transform duration-200"
                  :class="{ 'rotate-90': !isBrowseGroupCollapsed(group.id) }"
                />
              </button>
            </div>
          </div>

          <div v-if="!isBrowseGroupCollapsed(group.id)" data-testid="group-body" class="px-2.5 py-2.5 space-y-1.5">
            <div
              v-for="node in group.nodes"
              :key="node.type"
              :data-node-type="node.type"
              draggable="true"
              class="n8n-node-item group"
              :class="[
                store.pendingConnection
                  ? node.isClickable
                    ? 'is-connectable'
                    : 'is-disabled'
                  : 'is-normal',
              ]"
              @dragstart="onDragStart($event, node)"
              @click="onNodeClick(node)"
            >
              <div class="n8n-node-item-inner flex items-center gap-3 p-2.5 rounded-xl transition-all border border-transparent">
                <div
                  class="n8n-icon-box p-1.5 bg-white rounded-lg shadow-sm border border-slate-200/80 group-hover:border-blue-200 transition-colors duration-300"
                >
                  <NodeIcon :type="node.type" :size="30" />
                </div>
                <div class="flex flex-col flex-1 min-w-0">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-[12px] font-semibold text-slate-800 truncate tracking-tight">
                      {{ node.label }}
                    </span>
                    <span class="node-category-badge">{{ categoryBadge(node.category) }}</span>
                    <span v-if="node.isMultipleInput" class="node-input-mode-badge">多输入</span>
                  </div>
                  <span class="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                    {{ node.summary }}
                  </span>
                </div>
                <ChevronRight
                  :size="13"
                  class="text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.n8n-node-item {
  cursor: grab;
}

.n8n-node-item:active {
  cursor: grabbing;
}

.n8n-node-item.is-normal:hover .n8n-node-item-inner {
  background: #f8fbff;
  border-color: #dbeafe;
  box-shadow: 0 6px 18px -16px rgba(37, 99, 235, 0.65);
}

.n8n-node-item.is-connectable .n8n-node-item-inner {
  background: rgba(37, 99, 235, 0.06);
  border: 1.5px dashed rgba(37, 99, 235, 0.35);
  cursor: pointer;
}

.n8n-node-item.is-connectable:hover .n8n-node-item-inner {
  background: rgba(37, 99, 235, 0.12);
  border-color: rgba(37, 99, 235, 0.55);
  border-style: solid;
}

.n8n-node-item.is-disabled {
  opacity: 0.22;
  filter: grayscale(0.75);
  pointer-events: none;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}

.node-sidebar-root {
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(59, 130, 246, 0.06) 0%, rgba(248, 250, 252, 0) 45%),
    linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.sidebar-header {
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%),
    radial-gradient(120% 80% at 10% 0%, rgba(148, 163, 184, 0.08) 0%, transparent 60%);
  backdrop-filter: blur(8px);
}

.stats-strip {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  height: 2rem;
  border: 1px solid #dbe4ef;
  border-radius: 0.7rem;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.625rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.stat-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}

.stat-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.stat-divider {
  width: 1px;
  height: 12px;
  background: #d8e1ec;
}

.category-filter-chip {
  border: 1px solid #dbe4ef;
  border-radius: 999px;
  padding: 0.34rem 0.7rem;
  background: rgba(255, 255, 255, 0.88);
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.category-filter-chip:hover {
  border-color: #94a3b8;
  color: #0f172a;
}

.category-filter-chip--active {
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
}

.shortcut-shell,
.search-result-shell,
.category-shell {
  border-radius: 1rem;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 24px -18px rgba(15, 23, 42, 0.45);
  overflow: hidden;
}

.shortcut-header,
.search-result-header,
.category-shell-header {
  padding: 0.7rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  background: linear-gradient(90deg, rgba(248, 250, 252, 0.92) 0%, rgba(255, 255, 255, 0.98) 100%);
}

.group-toggle-button {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.group-toggle-button:hover {
  background: rgba(148, 163, 184, 0.12);
  color: #0f172a;
}

.shortcut-count {
  min-width: 1.4rem;
  height: 1.35rem;
  border-radius: 999px;
  border: 1px solid #dbe4ef;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.35rem;
  background: #ffffff;
  color: #334155;
  font-size: 10px;
  font-weight: 700;
}

.node-category-badge,
.node-input-mode-badge,
.search-match-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.node-category-badge {
  border: 1px solid #dbe4ef;
  background: #f8fafc;
  color: #475569;
}

.node-input-mode-badge {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.search-match-badge {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.empty-search-state {
  padding: 1rem 0.9rem 1.1rem;
}

@media (min-width: 1600px) {
  .sidebar-header {
    padding: 0.95rem 0.9rem 0.65rem;
  }

  .sidebar-list {
    padding: 0.6rem 0.65rem 1.1rem;
  }

  .n8n-node-item-inner {
    min-height: 64px;
  }
}
</style>
