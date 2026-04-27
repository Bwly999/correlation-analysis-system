import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { extractTableCollectionGroups, extractTableRows, isPlainObject } from '@/nodes/result'
import { normalizeWorkflowResult } from '../resultView'

type DataQualityFieldType = 'number' | 'string' | 'boolean' | 'date' | 'json' | 'unknown'

export interface DataQualityFieldProfile {
  field: string
  type: DataQualityFieldType
  totalCount: number
  missingCount: number
  nonMissingCount: number
  missingRate: number
  min?: number
  max?: number
  mean?: number
}

export interface DataQualitySummary {
  rowCount: number
  fieldCount: number
  missingFieldCount: number
  highestMissingRate: number
  numericFieldCount: number
}

export interface MissingRateBucket {
  label: string
  min: number
  max: number
  count: number
}

type SourceProfile = {
  field?: unknown
  type?: unknown
  missingCount?: unknown
  nonNullCount?: unknown
  nonMissingCount?: unknown
  missingRate?: unknown
  min?: unknown
  max?: unknown
  mean?: unknown
}

const isMissingValue = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'number' && Number.isNaN(value))

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const isDateLike = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))

const classifyValues = (values: unknown[]): DataQualityFieldType => {
  const presentValues = values.filter((value) => !isMissingValue(value))
  if (presentValues.length === 0) return 'unknown'
  if (presentValues.every((value) => toFiniteNumber(value) !== null)) return 'number'
  if (presentValues.every((value) => typeof value === 'boolean')) return 'boolean'
  if (presentValues.every((value) => isDateLike(value))) return 'date'
  if (presentValues.every((value) => typeof value === 'string')) return 'string'
  if (presentValues.every((value) => isPlainObject(value) || Array.isArray(value))) return 'json'
  return 'unknown'
}

const normalizeProfileType = (type: unknown): DataQualityFieldType => {
  if (type === 'numeric' || type === 'number') return 'number'
  if (type === 'categorical' || type === 'string') return 'string'
  if (type === 'datetime' || type === 'date') return 'date'
  if (type === 'boolean') return 'boolean'
  if (type === 'json') return 'json'
  return 'unknown'
}

const toOptionalNumber = (value: unknown) => {
  const parsed = toFiniteNumber(value)
  return parsed === null ? undefined : parsed
}

const getRowsFromInput = (input: unknown) => {
  const rows = extractTableRows(input)
  if (rows) return rows

  const groups = extractTableCollectionGroups(input)
  if (groups) return groups.flatMap((group) => group.data)

  const normalized = normalizeWorkflowResult(input)
  const sourceData = normalized?.meta?.sourceData
  if (Array.isArray(sourceData)) {
    return sourceData.filter((row): row is Record<string, unknown> => isPlainObject(row))
  }

  return []
}

const getSourceProfiles = (input: unknown): SourceProfile[] => {
  const normalized = normalizeWorkflowResult(input)
  const profile = normalized?.meta?.profile
  return Array.isArray(profile) ? profile.filter(isPlainObject) : []
}

const buildProfileFromSource = (
  profile: SourceProfile,
  totalCount: number,
): DataQualityFieldProfile | null => {
  if (typeof profile.field !== 'string' || profile.field.trim() === '') return null
  const missingCount = Math.max(0, Math.round(toOptionalNumber(profile.missingCount) ?? 0))
  const nonMissingCount = Math.max(
    0,
    Math.round(
      toOptionalNumber(profile.nonMissingCount) ?? toOptionalNumber(profile.nonNullCount) ?? 0,
    ),
  )
  const inferredTotal = Math.max(totalCount, missingCount + nonMissingCount)
  const missingRate =
    toOptionalNumber(profile.missingRate) ??
    (inferredTotal === 0 ? 0 : missingCount / inferredTotal)

  return {
    field: profile.field,
    type: normalizeProfileType(profile.type),
    totalCount: inferredTotal,
    missingCount,
    nonMissingCount,
    missingRate,
    min: toOptionalNumber(profile.min),
    max: toOptionalNumber(profile.max),
    mean: toOptionalNumber(profile.mean),
  }
}

const buildProfilesFromRows = (rows: Array<Record<string, unknown>>) => {
  const fieldSet = new Set<string>()
  rows.forEach((row) => Object.keys(row).forEach((field) => fieldSet.add(field)))

  return [...fieldSet].sort((left, right) => left.localeCompare(right)).map((field) => {
    const values = rows.map((row) => row[field])
    const presentValues = values.filter((value) => !isMissingValue(value))
    const type = classifyValues(values)
    const numericValues =
      type === 'number'
        ? presentValues.map(toFiniteNumber).filter((value): value is number => value !== null)
        : []
    const sum = numericValues.reduce((total, value) => total + value, 0)

    return {
      field,
      type,
      totalCount: rows.length,
      missingCount: rows.length - presentValues.length,
      nonMissingCount: presentValues.length,
      missingRate: rows.length === 0 ? 0 : (rows.length - presentValues.length) / rows.length,
      min: numericValues.length > 0 ? Math.min(...numericValues) : undefined,
      max: numericValues.length > 0 ? Math.max(...numericValues) : undefined,
      mean: numericValues.length > 0 ? sum / numericValues.length : undefined,
    } satisfies DataQualityFieldProfile
  })
}

const buildBuckets = (profiles: DataQualityFieldProfile[]): MissingRateBucket[] => {
  const buckets: MissingRateBucket[] = [
    { label: '0%', min: 0, max: 0, count: 0 },
    { label: '0-10%', min: 0, max: 0.1, count: 0 },
    { label: '10-30%', min: 0.1, max: 0.3, count: 0 },
    { label: '30-60%', min: 0.3, max: 0.6, count: 0 },
    { label: '60%+', min: 0.6, max: 1, count: 0 },
  ]

  profiles.forEach((profile) => {
    if (profile.missingRate === 0) {
      buckets[0]!.count += 1
    } else if (profile.missingRate <= 0.1) {
      buckets[1]!.count += 1
    } else if (profile.missingRate <= 0.3) {
      buckets[2]!.count += 1
    } else if (profile.missingRate <= 0.6) {
      buckets[3]!.count += 1
    } else {
      buckets[4]!.count += 1
    }
  })

  return buckets
}

const sortByMissingRate = (profiles: DataQualityFieldProfile[]) =>
  [...profiles].sort(
    (left, right) =>
      right.missingRate - left.missingRate || left.field.localeCompare(right.field),
  )

export function useDataQualityProfile(data: MaybeRefOrGetter<unknown>) {
  const rows = computed(() => getRowsFromInput(toValue(data)))
  const fieldProfiles = computed(() => {
    const input = toValue(data)
    const sourceProfiles = getSourceProfiles(input)
    if (sourceProfiles.length > 0) {
      const totalCount = rows.value.length
      return sourceProfiles
        .map((profile) => buildProfileFromSource(profile, totalCount))
        .filter((profile): profile is DataQualityFieldProfile => Boolean(profile))
        .sort((left, right) => left.field.localeCompare(right.field))
    }

    return buildProfilesFromRows(rows.value)
  })

  const summary = computed<DataQualitySummary>(() => {
    const profiles = fieldProfiles.value
    return {
      rowCount: rows.value.length,
      fieldCount: profiles.length,
      missingFieldCount: profiles.filter((profile) => profile.missingCount > 0).length,
      highestMissingRate: profiles.reduce(
        (highest, profile) => Math.max(highest, profile.missingRate),
        0,
      ),
      numericFieldCount: profiles.filter((profile) => profile.type === 'number').length,
    }
  })

  const missingBuckets = computed(() => buildBuckets(fieldProfiles.value))
  const hasProfileData = computed(() => rows.value.length > 0 && fieldProfiles.value.length > 0)
  const fieldsAtOrAboveMissingRate = computed(
    () => (thresholdPercent: number) => {
      const thresholdRate = Math.max(0, Math.min(100, thresholdPercent)) / 100
      return sortByMissingRate(
        fieldProfiles.value.filter((profile) => profile.missingRate >= thresholdRate),
      )
    },
  )

  return {
    rows,
    fieldProfiles,
    summary,
    missingBuckets,
    hasProfileData,
    fieldsAtOrAboveMissingRate,
  }
}
