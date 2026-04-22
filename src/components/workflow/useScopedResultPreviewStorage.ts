import { ref } from 'vue'
import { useLocalStorage, type RemovableRef, type UseStorageOptions } from '@vueuse/core'

const RESULT_PREVIEW_STORAGE_PREFIX = 'workflow-result-preview'

const cloneDefaultValue = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  if (Array.isArray(value)) return [...value] as T
  if (value && typeof value === 'object') return JSON.parse(JSON.stringify(value)) as T
  return value
}

export const buildScopedResultPreviewStorageKey = (
  storageScopeKey: string | null | undefined,
  slice: string,
) => {
  const scope = storageScopeKey?.trim()
  if (!scope) return null
  return `${RESULT_PREVIEW_STORAGE_PREFIX}:${scope}:${slice}`
}

export const useScopedResultPreviewStorage = <T>(
  storageScopeKey: string | null | undefined,
  slice: string,
  defaults: T,
  options?: UseStorageOptions<T>,
) => {
  const storageKey = buildScopedResultPreviewStorageKey(storageScopeKey, slice)
  if (!storageKey) {
    return ref(cloneDefaultValue(defaults)) as RemovableRef<T>
  }
  return useLocalStorage<T>(storageKey, defaults, options)
}
