import type { CustomFactorGroup } from './types'

export const CUSTOM_FACTOR_STORAGE_KEY = 'workflow.customFactorGroups.v1'

const getStorageKey = (storageKey = CUSTOM_FACTOR_STORAGE_KEY) => storageKey

const sortGroups = (groups: CustomFactorGroup[]) =>
  [...groups].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

const persistGroups = (groups: CustomFactorGroup[], storageKey = CUSTOM_FACTOR_STORAGE_KEY) => {
  localStorage.setItem(getStorageKey(storageKey), JSON.stringify(sortGroups(groups)))
}

export const loadCustomFactorGroups = (storageKey = CUSTOM_FACTOR_STORAGE_KEY): CustomFactorGroup[] => {
  const rawValue = localStorage.getItem(getStorageKey(storageKey))
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((group): group is CustomFactorGroup => {
      return Boolean(
        group
        && typeof group === 'object'
        && typeof group.id === 'string'
        && typeof group.name === 'string'
        && Array.isArray(group.factors),
      )
    })
  } catch {
    return []
  }
}

export const createCustomFactorGroup = (name = '未命名配置组'): CustomFactorGroup => {
  const now = new Date().toISOString()
  return {
    id: `custom-factor-group:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: now,
    updatedAt: now,
    factors: [],
  }
}

export const saveCustomFactorGroup = (
  group: CustomFactorGroup,
  storageKey = CUSTOM_FACTOR_STORAGE_KEY,
) => {
  const groups = loadCustomFactorGroups(storageKey)
  const nextGroup = {
    ...group,
    updatedAt: new Date().toISOString(),
  }
  const existingIndex = groups.findIndex((item) => item.id === group.id)
  if (existingIndex >= 0) {
    groups.splice(existingIndex, 1, nextGroup)
  } else {
    groups.push(nextGroup)
  }
  persistGroups(groups, storageKey)
  return nextGroup
}

export const deleteCustomFactorGroup = (
  groupId: string,
  storageKey = CUSTOM_FACTOR_STORAGE_KEY,
) => {
  persistGroups(
    loadCustomFactorGroups(storageKey).filter((group) => group.id !== groupId),
    storageKey,
  )
}

export const duplicateCustomFactorGroup = (
  groupId: string,
  storageKey = CUSTOM_FACTOR_STORAGE_KEY,
) => {
  const source = loadCustomFactorGroups(storageKey).find((group) => group.id === groupId)
  if (!source) return null

  const duplicated = saveCustomFactorGroup({
    ...createCustomFactorGroup(`${source.name} 副本`),
    factors: source.factors.map((factor) => ({ ...factor })),
  }, storageKey)

  return duplicated
}

export const exportCustomFactorGroups = (storageKey = CUSTOM_FACTOR_STORAGE_KEY) =>
  JSON.stringify(loadCustomFactorGroups(storageKey), null, 2)

export const importCustomFactorGroups = (
  serializedGroups: string,
  storageKey = CUSTOM_FACTOR_STORAGE_KEY,
) => {
  const parsed = JSON.parse(serializedGroups)
  if (!Array.isArray(parsed)) {
    throw new Error('导入内容不是合法的配置组列表')
  }

  const existingMap = new Map(loadCustomFactorGroups(storageKey).map((group) => [group.id, group]))
  parsed.forEach((group) => {
    if (!group || typeof group !== 'object' || typeof group.id !== 'string') return
    existingMap.set(group.id, group as CustomFactorGroup)
  })

  const groups = Array.from(existingMap.values())
  persistGroups(groups, storageKey)
  return sortGroups(groups)
}
