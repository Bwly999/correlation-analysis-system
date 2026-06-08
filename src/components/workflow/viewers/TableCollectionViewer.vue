<script setup lang="ts">
import { computed, watch } from 'vue'
import TableViewer from './TableViewer.vue'
import { buildScopedResultPreviewStorageKey, useScopedResultPreviewStorage } from '../useScopedResultPreviewStorage'
import { getResultGroups } from '../resultView'
import type { NodeResult } from '@/nodes/result'

const props = defineProps<{
  data: unknown
  storageScopeKey?: string
}>()

const groups = computed(() => getResultGroups(props.data))
const initialActiveGroupName = (() => {
  const storageKey = buildScopedResultPreviewStorageKey(props.storageScopeKey, 'table-collection-group')
  if (!storageKey || typeof localStorage === 'undefined') return ''
  return localStorage.getItem(storageKey) ?? ''
})()
const activeGroupName = useScopedResultPreviewStorage(
  props.storageScopeKey,
  'table-collection-group',
  initialActiveGroupName,
)

watch(
  groups,
  (nextGroups) => {
    if (nextGroups.length === 0) {
      activeGroupName.value = ''
      return
    }

    if (!nextGroups.some((group) => group.name === activeGroupName.value)) {
      activeGroupName.value = nextGroups[0]!.name
    }
  },
  { immediate: true },
)

const activeGroup = computed(
  () => groups.value.find((group) => group.name === activeGroupName.value) ?? groups.value[0] ?? null,
)

const activeGroupResult = computed<NodeResult | null>(() => {
  const group = activeGroup.value
  if (!group) return null

  return {
    kind: 'table',
    payload: group.data,
  }
})

const activeGroupStorageScopeKey = computed(() => {
  const baseScope = props.storageScopeKey?.trim()
  const groupName = activeGroup.value?.name?.trim()

  if (!baseScope || !groupName) return props.storageScopeKey
  return `${baseScope}:group:${groupName}`
})
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
    <div class="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div
        v-if="groups.length === 0"
        class="flex-1 flex items-center justify-center text-sm font-medium text-slate-400"
      >
        暂无分组结果
      </div>
      <template v-else>
        <div class="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
          <button
            v-for="group in groups"
            :key="group.name"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer"
            :class="
              group.name === activeGroupName
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            "
            @click="activeGroupName = group.name"
          >
            {{ group.name }} ({{ group.data.length }})
          </button>
        </div>
        <div class="flex-1 min-h-0">
          <TableViewer
            v-if="activeGroupResult"
            :data="activeGroupResult"
            :storage-scope-key="activeGroupStorageScopeKey"
          />
        </div>
      </template>
    </div>
  </div>
</template>
